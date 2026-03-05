const UserModel = require('../models/User');
const TaskService = require('../services/taskService');
const RewardModel = require('../models/Reward');
const { ApiResponse, getPaginationMeta } = require('../utils/response');
const db = require('../config/db');

class UserController {
  static async index(req, res) {
    try {
      const { page = 1, limit = 20, org_type, role_id, search } = req.query;
      const { rows, total } = await UserModel.getAll({ org_type, role_id, search, page, limit });
      const [roles] = await db.query('SELECT * FROM roles');
      const [orgs] = await db.query('SELECT * FROM organizations');

      res.render('users/index', {
        title: 'User Management',
        users: rows,
        roles,
        orgs,
        pagination: getPaginationMeta(total, page, limit),
        filters: { org_type, role_id, search }
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  static async create(req, res) {
    try {
      // LOCAL_MANAGER can only create LOCAL_USER role
      if (req.user.role_name === 'LOCAL_MANAGER') {
        const [[role]] = await db.query('SELECT name FROM roles WHERE id = ?', [req.body.role_id]);
        if (!role || role.name !== 'LOCAL_USER') {
          return ApiResponse.error(res, 'You can only create users with LOCAL_USER role', 403);
        }
        const [[org]] = await db.query('SELECT org_type FROM organizations WHERE id = ?', [req.body.organization_id]);
        if (!org || org.org_type !== 'LOCAL') {
          return ApiResponse.error(res, 'You can only create users in LOCAL organizations', 403);
        }
      }

      const userId = await UserModel.create(req.body);
      const user = await UserModel.findById(userId);
      return ApiResponse.success(res, user, 'User created successfully', 201);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return ApiResponse.error(res, 'Email already exists', 409);
      }
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async update(req, res) {
    try {
      await UserModel.update(req.params.id, req.body);
      const user = await UserModel.findById(req.params.id);
      return ApiResponse.success(res, user, 'User updated successfully');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async toggleActive(req, res) {
    try {
      const user = await UserModel.findById(req.params.id);
      if (!user) return ApiResponse.error(res, 'User not found', 404);
      await UserModel.update(req.params.id, { is_active: user.is_active ? 0 : 1 });
      return ApiResponse.success(res, {}, `User ${user.is_active ? 'deactivated' : 'activated'}`);
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async resetPassword(req, res) {
    try {
      const { password } = req.body;
      if (!password || password.length < 6) {
        return ApiResponse.error(res, 'Password must be at least 6 characters', 400);
      }
      const user = await UserModel.findById(req.params.id);
      if (!user) return ApiResponse.error(res, 'User not found', 404);
      await UserModel.update(req.params.id, { password });
      return ApiResponse.success(res, {}, 'Password reset successfully');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async changePassword(req, res) {
    try {
      const { new_password, confirm_password } = req.body;

      if (!new_password || !confirm_password) {
        return ApiResponse.error(res, 'All fields are required', 400);
      }
      if (new_password.length < 6) {
        return ApiResponse.error(res, 'New password must be at least 6 characters', 400);
      }
      if (new_password !== confirm_password) {
        return ApiResponse.error(res, 'New passwords do not match', 400);
      }

      await UserModel.update(req.user.id, { password: new_password });
      return ApiResponse.success(res, {}, 'Password changed successfully');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async showProgress(req, res) {
    try {
      const targetUser = await UserModel.findById(req.params.id);
      if (!targetUser) return res.status(404).render('error', { title: 'Not Found', message: 'User not found', code: 404, layout: false });

      const selectedDate = req.query.date || new Date().toISOString().split('T')[0];

      const [taskStats, rewardSummary, activeTasks, pendingTasks, recentCompleted, dayTasks] = await Promise.all([
        TaskService.getTaskStats(req.params.id),
        RewardModel.getUserSummary(req.params.id),
        db.query(
          `SELECT t.id, t.title, t.type, t.due_date, t.created_at
           FROM tasks t WHERE t.assigned_to = ? AND t.status = 'in_progress' AND t.is_deleted = 0
           ORDER BY t.created_at DESC`, [req.params.id]
        ),
        db.query(
          `SELECT t.id, t.title, t.type, t.due_date, t.created_at
           FROM tasks t WHERE t.assigned_to = ? AND t.status = 'pending' AND t.is_deleted = 0
           ORDER BY t.created_at DESC`, [req.params.id]
        ),
        db.query(
          `SELECT t.id, t.title, t.type, t.due_date, t.completed_at
           FROM tasks t WHERE t.assigned_to = ? AND t.status = 'completed' AND t.is_deleted = 0
           ORDER BY t.completed_at DESC LIMIT 10`, [req.params.id]
        ),
        db.query(
          `SELECT t.id, t.title, t.type, t.status, t.due_date, t.created_at, t.completed_at
           FROM tasks t
           WHERE t.assigned_to = ? AND t.is_deleted = 0
             AND (DATE(t.created_at) = ? OR DATE(t.completed_at) = ? OR (t.status IN ('in_progress','pending') AND DATE(t.due_date) = ?))
           ORDER BY t.status DESC, t.created_at DESC`,
          [req.params.id, selectedDate, selectedDate, selectedDate]
        )
      ]);

      res.render('users/progress', {
        title: `${targetUser.name} - Progress`,
        targetUser,
        taskStats,
        rewardSummary,
        activeTasks: activeTasks[0],
        pendingTasks: pendingTasks[0],
        recentCompleted: recentCompleted[0],
        dayTasks: dayTasks[0],
        selectedDate
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  // GET /users/:id/monthly-report?month=2026-03
  static async monthlyReport(req, res) {
    try {
      const userId = req.params.id;
      const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM
      const [year, mon] = month.split('-');

      const [[stats]] = await db.query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN type = 'daily' THEN 1 ELSE 0 END) as type_daily,
          SUM(CASE WHEN type = 'weekly' THEN 1 ELSE 0 END) as type_weekly,
          SUM(CASE WHEN type = 'adhoc' THEN 1 ELSE 0 END) as type_adhoc,
          SUM(CASE WHEN status = 'completed' AND type = 'daily' THEN 1 ELSE 0 END) as daily_completed,
          SUM(CASE WHEN status = 'completed' AND type = 'weekly' THEN 1 ELSE 0 END) as weekly_completed,
          SUM(CASE WHEN status = 'completed' AND type = 'adhoc' THEN 1 ELSE 0 END) as adhoc_completed
         FROM tasks
         WHERE assigned_to = ? AND is_deleted = 0
           AND (MONTH(created_at) = ? AND YEAR(created_at) = ?)`,
        [userId, parseInt(mon), parseInt(year)]
      );

      const [dailyBreakdown] = await db.query(
        `SELECT DATE(created_at) as date,
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
         FROM tasks
         WHERE assigned_to = ? AND is_deleted = 0
           AND MONTH(created_at) = ? AND YEAR(created_at) = ?
         GROUP BY DATE(created_at)
         ORDER BY date`,
        [userId, parseInt(mon), parseInt(year)]
      );

      return ApiResponse.success(res, { stats, dailyBreakdown, month });
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async updateLeave(req, res) {
    try {
      const { user_id, leave_status } = req.body;
      await UserModel.update(user_id, { leave_status });
      return ApiResponse.success(res, {}, 'Leave status updated');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }
}

module.exports = UserController;
