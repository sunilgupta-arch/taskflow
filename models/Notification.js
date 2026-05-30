const db = require('../config/db');

class Notification {

  // Create a notification; ref_type + ref_id link it to the triggering entity
  // so it can be auto-cleared when that entity is handled.
  static async create(userId, type, title, body = null, link = null, refType = null, refId = null) {
    const [result] = await db.query(
      `INSERT INTO notifications (user_id, type, title, body, link, ref_type, ref_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, type, title, body, link, refType, refId]
    );
    return result.insertId;
  }

  // Create only if the user doesn't already have an unread notification for
  // this ref — prevents duplicate alerts (e.g. multiple chat messages in one
  // conversation before the user reads it).
  static async createIfNotExists(userId, type, title, body, link, refType, refId) {
    if (refType && refId) {
      const [[existing]] = await db.query(
        `SELECT id FROM notifications
         WHERE user_id = ? AND ref_type = ? AND ref_id = ? AND is_read = 0 LIMIT 1`,
        [userId, refType, refId]
      );
      if (existing) return existing.id;
    }
    return Notification.create(userId, type, title, body, link, refType, refId);
  }

  // Mark notifications as read for a set of users matching a ref.
  // Returns the IDs that were actually cleared (were unread).
  static async clearByRef(userIds, refType, refId) {
    if (!userIds || !userIds.length || !refType || !refId) return [];
    const placeholders = userIds.map(() => '?').join(',');
    const [cleared] = await db.query(
      `SELECT id FROM notifications
       WHERE user_id IN (${placeholders}) AND ref_type = ? AND ref_id = ? AND is_read = 0`,
      [...userIds, refType, refId]
    );
    if (!cleared.length) return [];
    await db.query(
      `UPDATE notifications SET is_read = 1
       WHERE user_id IN (${placeholders}) AND ref_type = ? AND ref_id = ? AND is_read = 0`,
      [...userIds, refType, refId]
    );
    return cleared.map(r => r.id);
  }

  // Clear for a single user.
  static async clearByRefForUser(userId, refType, refId) {
    if (!refType || !refId) return [];
    return Notification.clearByRef([userId], refType, refId);
  }

  static async getForUser(userId, limit = 30) {
    const [rows] = await db.query(
      `SELECT id, type, title, body, link, ref_type, ref_id, is_read, created_at
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
