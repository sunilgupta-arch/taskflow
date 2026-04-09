const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const db = require('../../config/db');

// Track online users: userId -> Set of socketIds
const onlineUsers = new Map();

function initPortalSocket(io) {
  const portalNs = io.of('/portal');

  // Authentication middleware for portal namespace
  portalNs.use(async (socket, next) => {
    try {
      const rawCookie = socket.handshake.headers.cookie || '';
      const cookies = cookie.parse(rawCookie);
      const token = cookies.token;

      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const [users] = await db.query(
        `SELECT u.*, r.name as role_name
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.id = ? AND u.is_active = 1`,
        [decoded.id]
      );

      if (!users.length) return next(new Error('User not found'));

      if (!users[0].role_name.startsWith('CLIENT_')) {
        return next(new Error('Access denied'));
      }

      socket.user = users[0];
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  portalNs.on('connection', (socket) => {
    const user = socket.user;

    // Track online status
    if (!onlineUsers.has(user.id)) {
      onlineUsers.set(user.id, new Set());
    }
    onlineUsers.get(user.id).add(socket.id);

    // Broadcast online status to all portal users
    portalNs.emit('portal:presence', {
      user_id: user.id,
      status: 'online'
    });

    // Join personal room for direct notifications
    socket.on('portal:join', () => {
      socket.join(`portal:user:${user.id}`);

      // Send current online users list to the newly connected user
      const onlineIds = Array.from(onlineUsers.keys());
      socket.emit('portal:online-users', onlineIds);
    });

    // Join a conversation room
    socket.on('portal:conv:join', (conversationId) => {
      socket.join(`portal:conv:${conversationId}`);
    });

    // Typing indicator
    socket.on('portal:typing', (data) => {
      if (data.conversation_id) {
        socket.to(`portal:conv:${data.conversation_id}`).emit('portal:typing', {
          conversation_id: data.conversation_id,
          user_id: user.id,
          user_name: user.name
        });
      }
    });

    // Stop typing
    socket.on('portal:stop-typing', (data) => {
      if (data.conversation_id) {
        socket.to(`portal:conv:${data.conversation_id}`).emit('portal:stop-typing', {
          conversation_id: data.conversation_id,
          user_id: user.id
        });
      }
    });

    // Read receipt
    socket.on('portal:read', (data) => {
      if (data.conversation_id) {
        socket.to(`portal:conv:${data.conversation_id}`).emit('portal:read', {
          conversation_id: data.conversation_id,
          user_id: user.id,
          last_read_message_id: data.last_read_message_id
        });
      }
    });

    // Disconnect — update online status
    socket.on('disconnect', () => {
      const sockets = onlineUsers.get(user.id);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(user.id);
          portalNs.emit('portal:presence', {
            user_id: user.id,
            status: 'offline'
          });
        }
      }
    });
  });

  return portalNs;
}

module.exports = { initPortalSocket };
