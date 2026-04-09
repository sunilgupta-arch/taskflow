const db = require('../config/db');

class ShiftHistory {
  /**
   * Get the shift that was active for a user on a specific date.
   * Returns the shift_history row with the latest effective_date <= the given date.
   * Falls back to the user's current shift if no history exists.
   */
  static async getShiftForDate(userId, date) {
    const [rows] = await db.query(
      `SELECT shift_start, shift_hours FROM shift_history
       WHERE user_id = ? AND effective_date <= ?
       ORDER BY effective_date DESC, id DESC
       LIMIT 1`,
      [userId, date]
    );
    if (rows.length) return rows[0];

    // Fallback: read from users table
    const [userRows] = await db.query(
      `SELECT shift_start, shift_hours FROM users WHERE id = ?`,
      [userId]
    );
    return userRows[0] || { shift_start: '10:00:00', shift_hours: 8.5 };
  }

  /**
   * Record a shift change.
   */
  static async record({ userId, shiftStart, shiftHours, effectiveDate, changedBy = null }) {
    await db.query(
      `INSERT INTO shift_history (user_id, shift_start, shift_hours, effective_date, changed_by)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, shiftStart, shiftHours, effectiveDate, changedBy]
    );
  }

  /**
   * Get full shift history for a user (most recent first).
   */
  static async getHistory(userId) {
    const [rows] = await db.query(
      `SELECT sh.*, u.name as changed_by_name
       FROM shift_history sh
       LEFT JOIN users u ON sh.changed_by = u.id
       WHERE sh.user_id = ?
       ORDER BY sh.effective_date DESC, sh.id DESC`,
      [userId]
    );
    return rows;
  }
}

module.exports = ShiftHistory;
