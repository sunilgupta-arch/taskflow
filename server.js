require('dotenv').config();
const express = require('express');
const http = require('http');
const expressLayouts = require('express-ejs-layouts');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const db = require('./config/db');
const { init: initSocket } = require('./config/socket');

const autoMigrate = require('./utils/auto-migrate');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Ensure required directories exist
// ============================================================
['logs', 'uploads/tasks'].forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

// ============================================================
// Middleware
// ============================================================
app.use(cors({ origin: process.env.APP_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(process.env.COOKIE_SECRET));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================================
// View Engine - EJS
// ============================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// ============================================================
// Routes
// ============================================================
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const chatRoutes = require('./routes/chat');
const driveRoutes = require('./routes/drive');
const helpRoutes = require('./routes/help');
const indexRoutes = require('./routes/index');

app.get('/', (req, res) => res.redirect('/dashboard'));
app.use('/auth', authRoutes);
app.use('/tasks', taskRoutes);
app.use('/chat', chatRoutes);
app.use('/drive', driveRoutes);
app.use('/help', helpRoutes);
app.use('/', indexRoutes);

// ============================================================
// Error Handlers
// ============================================================
app.use((req, res) => {
  if (req.xhr || req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'Route not found' });
  }
  res.status(404).render('error', { title: 'Not Found', message: 'Page not found', code: 404, layout: false });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (req.xhr || req.path.startsWith('/api/')) {
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
  res.status(500).render('error', { title: 'Error', message: err.message || 'Internal server error', code: 500, layout: false });
});

// ============================================================
// Start Server (migrations first, then listen)
// ============================================================
(async () => {
  // Run pending migrations before anything else
  await autoMigrate();

  // Start Cron Jobs
  const { startCronJobs } = require('./utils/cronJobs');
  await startCronJobs();

  const server = http.createServer(app);
  const io = initSocket(server);

  // Socket.IO authentication middleware
  io.use(async (socket, next) => {
    try {
      const rawCookie = socket.handshake.headers.cookie || '';
      const cookies = cookie.parse(rawCookie);
      const token = cookies.token;

      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const [users] = await db.query(
        `SELECT u.*, r.name as role_name, r.organization_type, o.name as org_name, o.org_type
         FROM users u
         JOIN roles r ON u.role_id = r.id
         JOIN organizations o ON u.organization_id = o.id
         WHERE u.id = ? AND u.is_active = 1`,
        [decoded.id]
      );

      if (!users.length) return next(new Error('User not found'));

      socket.user = users[0];
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  // Track active calls in memory: userId -> { conversation_id, peer_id }
  const activeCalls = new Map();

  // Socket.IO connection handler
  io.on('connection', (socket) => {
    const user = socket.user;

    // Join user-specific room
    socket.join(`user:${user.id}`);

    // Join admins room if user is admin or manager
    if (['CLIENT_ADMIN', 'CLIENT_MANAGER', 'LOCAL_ADMIN', 'LOCAL_MANAGER'].includes(user.role_name)) {
      socket.join('admins');
    }

    // Chat: join a conversation room
    socket.on('chat:join', (conversationId) => {
      socket.join(`chat:${conversationId}`);
    });

    // Chat: typing indicator relay
    socket.on('chat:typing', (data) => {
      if (data.conversation_id) {
        socket.to(`chat:${data.conversation_id}`).emit('chat:typing', {
          conversation_id: data.conversation_id,
          user_id: user.id,
          user_name: user.name
        });
      }
    });

    // ── Voice Calls (WebRTC signaling) ──────────────────────────────────────

    // Caller sends offer to recipient
    socket.on('call:offer', (data) => {
      // { to_user_id, conversation_id, offer }
      if (activeCalls.has(data.to_user_id)) {
        socket.emit('call:busy', { conversation_id: data.conversation_id });
        return;
      }
      activeCalls.set(user.id, { conversation_id: data.conversation_id, peer_id: data.to_user_id });
      io.to(`user:${data.to_user_id}`).emit('call:incoming', {
        conversation_id: data.conversation_id,
        from_user_id: user.id,
        from_user_name: user.name,
        offer: data.offer
      });
    });

    // Recipient accepts and sends answer
    socket.on('call:answer', (data) => {
      // { to_user_id, conversation_id, answer }
      activeCalls.set(user.id, { conversation_id: data.conversation_id, peer_id: data.to_user_id });
      io.to(`user:${data.to_user_id}`).emit('call:answered', { answer: data.answer });
    });

    // ICE candidate exchange
    socket.on('call:ice-candidate', (data) => {
      // { to_user_id, candidate }
      io.to(`user:${data.to_user_id}`).emit('call:ice-candidate', { candidate: data.candidate });
    });

    // Recipient rejects the call
    socket.on('call:reject', (data) => {
      // { to_user_id, conversation_id }
      io.to(`user:${data.to_user_id}`).emit('call:rejected', { conversation_id: data.conversation_id });
    });

    // Either party ends the call
    socket.on('call:end', (data) => {
      // { to_user_id }
      activeCalls.delete(user.id);
      io.to(`user:${data.to_user_id}`).emit('call:ended');
    });

    // Clean up if user disconnects mid-call
    socket.on('disconnect', () => {
      if (activeCalls.has(user.id)) {
        const call = activeCalls.get(user.id);
        activeCalls.delete(user.id);
        io.to(`user:${call.peer_id}`).emit('call:ended');
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`\n🚀 TaskFlow running at http://localhost:${PORT}`);
    console.log(`🔌 Socket.IO ready`);
    console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`\nDefault credentials:`);
    console.log(`  Client Admin : cfc.admin@taskflow.com / Password@123`);
    console.log(`  Local Admin  : our.admin@taskflow.com / Password@123`);
    console.log(`  Local User   : our.user1@taskflow.com / Password@123\n`);
  });
})();

module.exports = app;
