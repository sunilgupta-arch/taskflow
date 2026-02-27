let io = null;

module.exports = {
  init(server) {
    const { Server } = require('socket.io');
    io = new Server(server);
    return io;
  },

  getIO() {
    if (!io) {
      throw new Error('Socket.IO not initialized. Call init(server) first.');
    }
    return io;
  }
};
