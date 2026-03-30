const db = require('../config/db');

class TaskCompletion {
  /**
   * Log a completion for a recurring task on a specific date (direct/admin use).
   * Sets completed_at immediately without a start step.
   */
  static async logCompletion(taskId, userId, date, notes = null) {
    const [result] = await db.query(
      `INSERT INTO task_completions (task_id, user_id, completion_date, notes, completed_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE notes = COALESCE(VALUES(notes), notes), completed_at = COALESCE(completed_at, NOW())`,
      [taskId, userId, date, notes]
    );
    return result.insertId || result.affectedRows > 0;
  }

  /**
   * Start a session for today — inserts a record with started_at = NOW().
   */
  static async startSession(taskId, userId, date) {
    const [result] = await db.query(
      `INSERT INTO task_completions (task_id, user_id, completion_date, started_at)
       VALUES (?, ?, ?, NOW())`,
      [taskId, userId, date]
    );
    return result.insertId;
  }

  /**
   * Complete a started session — sets completed_at and calculates duration.
   */
  static async completeSession(taskId, userId, date) {
    const [result] = await db.query(
      `UPDATE task_completions
       SET completed_at = NOW(),
           duration_minutes = TIMESTAMPDIFF(MINUTE, started_at, NOW())
       WHERE task_id = ? AND user_id = ? AND completion_date = ?
         AND started_at IS NOT NULL AND completed_at IS NULL`,
      [taskId, userId, date]
    );
    return result.affectedRows > 0;
  }

  /**
   * Get today's session record for a task (returns null, started, or completed state).
   */
  static async getTodaySession(taskId, userId, date) {
    const [[row]] = await db.query(
      `SELECT id, started_at, completed_at, duration_minutes
       FROM task_completions
       WHERE task_id = ? AND user_id = ? AND completion_date = ?`,
      [taskId, userId, date]
    );
    return row || null;
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
      `SELECT id FROM task_completions WHERE task_id = ? AND user_id = ? AND completion_date = ? AND completed_at IS NOT NULL`,
      [taskId, userId, date]
    );
    return !!row;
  }

  static async isStartedToday(taskId, userId, date) {
    const [[row]] = await db.query(
      `SELECT id FROM task_completions WHERE task_id = ? AND user_id = ? AND completion_date = ? AND started_at IS NOT NULL AND completed_at IS NULL`,
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
         AND tc.completed_at IS NOT NULL
       ORDER BY tc.completion_date DESC`,
      [taskId, startDate, endDate]
    );
    return rows;
  }

  /**
   * Count completions by period for stats.
   */
  static async countByPeriod(userId = null, todayDate = null) {
    const userFilter = userId ? `AND tc.user_id = ${db.escape(userId)}` : '';
    const todayExpr = todayDate ? db.escape(todayDate) : 'CURDATE()';
    const nowExpr = todayDate ? db.escape(todayDate) : 'NOW()';
    const [[stats]] = await db.query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN tc.completion_date = ${todayExpr} THEN 1 ELSE 0 END) as completed_today,
        SUM(CASE WHEN YEARWEEK(tc.completion_date) = YEARWEEK(${nowExpr}) THEN 1 ELSE 0 END) as completed_this_week,
        SUM(CASE WHEN MONTH(tc.completion_date) = MONTH(${nowExpr}) AND YEAR(tc.completion_date) = YEAR(${nowExpr}) THEN 1 ELSE 0 END) as completed_this_month,
        SUM(CASE WHEN YEAR(tc.completion_date) = YEAR(${nowExpr}) THEN 1 ELSE 0 END) as completed_this_year
       FROM task_completions tc
       JOIN tasks t ON tc.task_id = t.id
       WHERE t.is_deleted = 0 ${userFilter}`
    );
    return stats;
  }
}

module.exports = TaskCompletion;
