const db = require('../config/db');

class Break {
  /**
   * Currently open break for a user, if any.
   */
  static async getActive(userId) {
    const [[row]] = await db.query(
      `SELECT id, user_id, break_type, note, started_at, ended_at, duration_minutes
       FROM user_breaks WHERE user_id = ? AND ended_at IS NULL`,
      [userId]
    );
    return row || null;
  }

  /**
   * Start a break — throws if the user already has one open.
   */
  static async start(userId, breakType, note = null) {
    const active = await Break.getActive(userId);
    if (active) {
      throw new Error('You are already on a break — end it before starting another');
    }
    const [result] = await db.query(
      `INSERT INTO user_breaks (user_id, break_type, note, started_at) VALUES (?, ?, ?, NOW())`,
      [userId, breakType, note]
    );
    return result.insertId;
  }

  /**
   * End the user's currently open break.
   */
  static async end(userId) {
    const [result] = await db.query(
      `UPDATE user_breaks
       SET ended_at = NOW(), duration_minutes = TIMESTAMPDIFF(MINUTE, started_at, NOW())
       WHERE user_id = ? AND ended_at IS NULL`,
      [userId]
    );
    return result.affectedRows > 0;
  }

  /**
   * Today's break punches for a user (history + totals for the personal page).
   */
  static async getTodayForUser(userId, date) {
    const [rows] = await db.query(
      `SELECT id, break_type, note, started_at, ended_at, duration_minutes
       FROM user_breaks
       WHERE user_id = ? AND DATE(started_at) = ?
       ORDER BY started_at DESC`,
      [userId, date]
    );
    return rows;
  }

  /**
   * All currently open breaks across the team, joined to the user — for the
   * admin/manager live view.
   */
  static async getActiveForTeam() {
    const [rows] = await db.query(
      `SELECT ub.id, ub.user_id, ub.break_type, ub.note, ub.started_at,
              u.name, u.avatar
       FROM user_breaks ub
       JOIN users u ON u.id = ub.user_id
       WHERE ub.ended_at IS NULL
       ORDER BY ub.started_at ASC`
    );
    return rows;
  }
}

module.exports = Break;
