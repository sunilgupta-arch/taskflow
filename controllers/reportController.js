const TaskService = require('../services/taskService');
const RewardModel = require('../models/Reward');
const db = require('../config/db');
const { ApiResponse } = require('../utils/response');

class ReportController {
  static async completionReport(req, res) {
    try {
      const [stats, perUser] = await Promise.all([
        TaskService.getTaskStats(),
        TaskService.getCompletionPerUser()
      ]);

      // Monthly breakdown
      const [monthly] = await db.query(
        `SELECT MONTH(completed_at) as month, YEAR(completed_at) as year, COUNT(*) as count
         FROM tasks WHERE status = 'completed' AND is_deleted = 0
         AND completed_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
         GROUP BY year, month ORDER BY year, month`
      );

      res.render('reports/completion', {
        title: 'Completion Report',
        stats,
        perUser,
        monthly
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  static async rewardReport(req, res) {
    try {
      const [summary, perUser, { rows: ledger }] = await Promise.all([
        RewardModel.getGlobalSummary(),
        RewardModel.getPerUserSummary(),
        RewardModel.getAll({ page: 1, limit: 50 })
      ]);

      res.render('reports/rewards', {
        title: 'Reward Report',
        summary,
        perUser,
        ledger
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  static async attendanceReport(req, res) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const [dailyLogs] = await db.query(
        `SELECT al.*, u.name as user_name, u.email,
                TIMEDIFF(COALESCE(al.logout_time, NOW()), al.login_time) as duration
         FROM attendance_logs al
         JOIN users u ON al.user_id = u.id
         WHERE al.date = ?
         ORDER BY al.login_time`, [today]
      );

      const [weeklyStats] = await db.query(
        `SELECT u.id, u.name, COUNT(al.id) as days_present
         FROM users u
         LEFT JOIN attendance_logs al ON u.id = al.user_id
           AND al.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
         WHERE u.is_active = 1
         GROUP BY u.id ORDER BY days_present DESC`
      );

      res.render('attendance/index', {
        title: 'Attendance Dashboard',
        dailyLogs,
        weeklyStats,
        today
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }
}

module.exports = ReportController;
