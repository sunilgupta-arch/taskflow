const db = require('../config/db');

class TaskCompletion {
  /**
   * Log a completion for a recurring task on a specific date.
   * Uses INSERT IGNORE to be idempotent (unique key prevents duplicates).
   */
  static async logCompletion(taskId, userId, date, notes = null) {
    const [result] = await db.query(
      `INSERT INTO task_completions (task_id, user_id, completion_date, notes)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE notes = COALESCE(VALUES(notes), notes)`,
      [taskId, userId, date, notes]
    );
    return result.insertId || result.affectedRows > 0;
  }

  /**
   * Undo a completion for a recurring task on a specific date.
   */
  static async undoCompletion(taskId, userId, date) {
    const [result] = await db.query(
      `DELETE FROM task_completions WHERE task_id = ? AND user_id = ? AND completion_date = ?`,
      [taskId, userId, date]
    );
    return result.affectedRows > 0;
  }

  /**
   * Check if a task is completed for a user on a specific date.
   */
  static async isCompletedForDate(taskId, userId, date) {
    const [[row]] = await db.query(
      `SELECT id FROM task_completions WHERE task_id = ? AND user_id = ? AND completion_date = ?`,
      [taskId, userId, date]
    );
    return !!row;
  }

  /**
   * Get all completions for a user within a date range.
   */
  static async getCompletionsForUser(userId, startDate, endDate) {
    const [rows] = await db.query(
      `SELECT tc.*, t.title, t.type
       FROM task_completions tc
       JOIN tasks t ON tc.task_id = t.id
       WHERE tc.user_id = ? AND tc.completion_date >= ? AND tc.completion_date <= ?
       ORDER BY tc.completion_date DESC`,
      [userId, startDate, endDate]
    );
    return rows;
  }

  /**
   * Get completions for a specific task within a date range.
   */
  static async getCompletionsForTask(taskId, startDate, endDate) {
    const [rows] = await db.query(
      `SELECT tc.*, u.name as user_name
       FROM task_completions tc
       JOIN users u ON tc.user_id = u.id
       WHERE tc.task_id = ? AND tc.completion_date >= ? AND tc.completion_date <= ?
       ORDER BY tc.completion_date DESC`,
      [taskId, startDate, endDate]
    );
    return rows;
  }

  /**
   * Count completions by period for stats.
   */
  static async countByPeriod(userId = null) {
    const userFilter = userId ? `AND tc.user_id = ${db.escape(userId)}` : '';
    const [[stats]] = await db.query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN tc.completion_date = CURDATE() THEN 1 ELSE 0 END) as completed_today,
        SUM(CASE WHEN YEARWEEK(tc.completion_date) = YEARWEEK(NOW()) THEN 1 ELSE 0 END) as completed_this_week,
        SUM(CASE WHEN MONTH(tc.completion_date) = MONTH(NOW()) AND YEAR(tc.completion_date) = YEAR(NOW()) THEN 1 ELSE 0 END) as completed_this_month,
        SUM(CASE WHEN YEAR(tc.completion_date) = YEAR(NOW()) THEN 1 ELSE 0 END) as completed_this_year
       FROM task_completions tc
       JOIN tasks t ON tc.task_id = t.id
       WHERE t.is_deleted = 0 ${userFilter}`
    );
    return stats;
  }
}

module.exports = TaskCompletion;
