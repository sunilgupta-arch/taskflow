require('dotenv').config();
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

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
const indexRoutes = require('./routes/index');

app.get('/', (req, res) => res.redirect('/dashboard'));
app.use('/auth', authRoutes);
app.use('/tasks', taskRoutes);
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
// Start Cron Jobs
// ============================================================
const { startCronJobs } = require('./utils/cronJobs');
startCronJobs();

// ============================================================
// Start Server
// ============================================================
app.listen(PORT, () => {
  console.log(`\n🚀 TaskFlow running at http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\nDefault credentials:`);
  console.log(`  CFC Admin  : cfc.admin@taskflow.com / Password@123`);
  console.log(`  OUR Admin  : our.admin@taskflow.com / Password@123`);
  console.log(`  OUR User   : our.user1@taskflow.com / Password@123\n`);
});

module.exports = app;
