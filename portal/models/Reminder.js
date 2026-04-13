const db = require('../../config/db');

class PortalReminder {

  static async create({ user_id, title, note, remind_at }) {
    const [result] = await db.query(
      'INSERT INTO portal_reminders (user_id, title, note, remind_at) VALUES (?, ?, ?, ?)',
      [user_id, title, note || null, remind_at]
    );
    return result.insertId;
  }

  static async findById(id) {
    const [rows] = await db.query('SELECT * FROM portal_reminders WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async getForUser(userId, { includeDone = false } = {}) {
    let sql = 'SELECT * FROM portal_reminders WHERE user_id = ?';
    if (!includeDone) sql += ' AND is_done = 0';
    sql += ' ORDER BY remind_at ASC';
    const [rows] = await db.query(sql, [userId]);
    return rows;
  }

  static async update(id, fields) {
    const allowed = ['title', 'note', 'remind_at', 'is_done', 'notified'];
    const updates = [];
    const params = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        params.push(fields[key]);
      }
    }
    if (!updates.length) return;
    params.push(id);
    await db.query(`UPDATE portal_reminders SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  static async toggleDone(id) {
    await db.query('UPDATE portal_reminders SET is_done = NOT is_done WHERE id = ?', [id]);
  }

  static async delete(id) {
    await db.query('DELETE FROM portal_reminders WHERE id = ?', [id]);
  }

  // Get reminders that are due and haven't been notified yet
  static async getDueReminders() {
    const [rows] = await db.query(
      `SELECT r.*, u.name as user_name
       FROM portal_reminders r
       JOIN users u ON r.user_id = u.id
       WHERE r.is_done = 0 AND r.notified = 0 AND r.remind_at <= NOW()`
    );
    return rows;
  }

  static async markNotified(id) {
    await db.query('UPDATE portal_reminders SET notified = 1 WHERE id = ?', [id]);
  }
}

module.exports = PortalReminder;
