const db = require('../config/db');
const TaskService = require('./taskService');
const RewardModel = require('../models/Reward');
const { getToday, getDayOfWeek } = require('../utils/timezone');

class DashboardService {
  static async getAdminDashboard(orgType = null, timezone = 'America/New_York') {
    const todayDate = getToday(timezone);
    const [taskStats, rewardSummary, attendanceSummary, perUserStats, perUserRewards] = await Promise.all([
      TaskService.getTaskStats(null, orgType, todayDate),
      RewardModel.getGlobalSummary(),
      this.getAttendanceSummary(timezone),
      TaskService.getCompletionPerUser(orgType),
      RewardModel.getPerUserSummary()
    ]);

    return {
      taskStats,
      rewardSummary,
      attendanceSummary,
      perUserStats,
      perUserRewards
    };
  }

  static async getUserDashboard(userId, viewDate = null, timezone = 'America/New_York', workDate = null) {
    const today = workDate || getToday(timezone);
    const selectedDate = viewDate || today;
    const isToday = selectedDate === today;
    const isFuture = selectedDate > today;
    const isPast = selectedDate < today;

    const [taskStats, rewardSummary, dayTasks] = await Promise.all([
      TaskService.getTaskStats(userId, null, today),
      RewardModel.getUserSummary(userId),
      this.getTasksForDate(userId, selectedDate, today)
    ]);

    return {
      taskStats,
      rewardSummary,
      dayTasks,
      selectedDate,
      isToday,
      isFuture,
      isPast
    };
  }

  /**
   * Get a user's tasks relevant to a specific date:
   * - Active daily tasks (always relevant) with completion status for that date
   * - Active weekly tasks with completion status for that date
   * - Adhoc tasks: pending/in_progress ones, or ones completed on that date, or due on that date
   */
  static async getTasksForDate(userId, date, today) {
    const [rows] = await db.query(
      `SELECT t.id, t.title, t.status, t.type, t.priority, t.due_date, t.reward_amount, t.created_at,
              t.recurrence_pattern, t.recurrence_days, t.recurrence_end_date,
              CASE WHEN t.type = 'recurring' AND t.status = 'active' THEN 1 ELSE 0 END as is_recurring,
              (SELECT COUNT(*) FROM task_completions tc WHERE tc.task_id = t.id AND tc.user_id = ? AND tc.completion_date = ? AND tc.completed_at IS NOT NULL) as is_completed_for_date,
              (SELECT COUNT(*) FROM task_completions tc WHERE tc.task_id = t.id AND tc.user_id = ? AND tc.completion_date = ? AND tc.started_at IS NOT NULL AND tc.completed_at IS NULL) as is_started_for_date
       FROM tasks t
       JOIN users u_assignee ON u_assignee.id = t.assigned_to
       WHERE t.assigned_to = ? AND t.is_deleted = 0
         AND u_assignee.weekly_off_day != DAYNAME(?)
         AND (
           -- Active recurring tasks are always shown
           (t.type = 'recurring' AND t.status = 'active')
           -- One-time: pending or in_progress (show on today and future)
           OR (t.type = 'once' AND t.status IN ('pending','in_progress') AND ? >= ?)
           -- One-time: due on this date
           OR (t.type = 'once' AND t.due_date = ?)
           -- One-time: completed on this date
           OR (t.type = 'once' AND t.status = 'completed' AND DATE(t.completed_at) = ?)
         )
       ORDER BY FIELD(t.priority, 'urgent', 'high', 'medium', 'low'), t.created_at DESC`,
      [userId, date, userId, date, userId, date, date, today, date, date]
    );
    return rows;
  }

  static async getAttendanceSummary(timezone = 'America/New_York') {
    const today = getToday(timezone);
    const dayOfWeek = getDayOfWeek(timezone);

    const [[summary]] = await db.query(
      `SELECT
        (SELECT COUNT(*) FROM users WHERE is_active = 1) as total_users,
        (SELECT COUNT(*) FROM attendance_logs WHERE date = ?) as logged_in_today,
        (SELECT COUNT(*) FROM users WHERE leave_status = 1 AND is_active = 1) as on_leave,
        (SELECT COUNT(*) FROM users WHERE weekly_off_day = ? AND is_active = 1) as on_weekoff`,
      [today, dayOfWeek]
    );

    return summary;
  }
}

module.exports = DashboardService;
