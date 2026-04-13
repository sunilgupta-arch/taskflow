const db = require('../../config/db');

class PortalReport {

  static async create({ user_id, name, url, color }) {
    const [[{ maxOrder }]] = await db.query(
      'SELECT COALESCE(MAX(sort_order), 0) as maxOrder FROM portal_reports WHERE user_id = ?', [user_id]
    );
    const [result] = await db.query(
      'INSERT INTO portal_reports (user_id, name, url, color, sort_order) VALUES (?, ?, ?, ?, ?)',
      [user_id, name, url, color || 'blue', maxOrder + 1]
    );
    return result.insertId;
  }

  static async findById(id) {
    const [rows] = await db.query('SELECT * FROM portal_reports WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async getForUser(userId) {
    const [rows] = await db.query(
      'SELECT * FROM portal_reports WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC',
      [userId]
    );
    return rows;
  }

  static async update(id, fields) {
    const allowed = ['name', 'url', 'color', 'sort_order'];
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
    await db.query(`UPDATE portal_reports SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  static async delete(id) {
    await db.query('DELETE FROM portal_reports WHERE id = ?', [id]);
  }
}

module.exports = PortalReport;
