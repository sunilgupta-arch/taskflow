const db = require('../config/db');
const TaskService = require('./taskService');
const RewardModel = require('../models/Reward');

class DashboardService {
  static async getAdminDashboard() {
    const [taskStats, rewardSummary, attendanceSummary, perUserStats, perUserRewards] = await Promise.all([
      TaskService.getTaskStats(),
      RewardModel.getGlobalSummary(),
      this.getAttendanceSummary(),
      TaskService.getCompletionPerUser(),
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

  static async getUserDashboard(userId) {
    const [taskStats, rewardSummary, recentTasks] = await Promise.all([
      TaskService.getTaskStats(userId),
      RewardModel.getUserSummary(userId),
      db.query(
        `SELECT t.id, t.title, t.status, t.type, t.due_date, t.reward_amount, t.created_at
         FROM tasks t WHERE t.assigned_to = ? AND t.is_deleted = 0
         ORDER BY t.created_at DESC LIMIT 5`, [userId]
      )
    ]);

    return {
      taskStats,
      rewardSummary,
      recentTasks: recentTasks[0]
    };
  }

  static async getAttendanceSummary() {
    const today = new Date().toISOString().split('T')[0];
    const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });

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
