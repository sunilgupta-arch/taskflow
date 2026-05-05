const db = require('../config/db');

class Notification {
  static async create(userId, type, title, body = null, link = null) {
    const [result] = await db.query(
      `INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)`,
      [userId, type, title, body, link]
    );
    return result.insertId;
  }

  static async getForUser(userId, limit = 30) {
    const [rows] = await db.query(
      `SELECT id, type, title, body, link, is_read, created_at
       FROM notifications WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ?`,
      [userId, limit]
    );
    return rows;
  }

  static async getUnreadCount(userId) {
    const [[row]] = await db.query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`,
      [userId]
    );
    return row.count;
  }

  static async markRead(id, userId) {
    await db.query(
      `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
      [id, userId]
    );
  }

  static async markAllRead(userId) {
    await db.query(
      `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0`,
      [userId]
    );
  }
}

module.exports = Notification;
