const UserModel = require('../models/User');
const TaskService = require('../services/taskService');
const RewardModel = require('../models/Reward');
const { ApiResponse, getPaginationMeta } = require('../utils/response');
const db = require('../config/db');
const { getToday } = require('../utils/timezone');

class UserController {
  static async index(req, res) {
    try {
      const { page = 1, limit = 20, org_type, role_id, search } = req.query;
      const { rows, total } = await UserModel.getAll({ org_type, role_id, search, page, limit });
      const [roles] = await db.query('SELECT * FROM roles');
      const [orgs] = await db.query('SELECT * FROM organizations');

      // Get current delegated support user (for LOCAL_ADMIN)
      let delegatedSupportId = null;
      if (req.user.role_name === 'LOCAL_ADMIN') {
        const [[localOrg]] = await db.query("SELECT delegated_support_id FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
        delegatedSupportId = localOrg?.delegated_support_id || null;
      }

      res.render('users/index', {
        title: 'User Management',
        users: rows,
        roles,
        orgs,
        pagination: getPaginationMeta(total, page, limit),
        filters: { org_type, role_id, search },
        delegatedSupportId
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

      const userId = await UserModel.create({ ...req.body, changed_by: req.user.id });
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
      await UserModel.update(req.params.id, { ...req.body, changed_by: req.user.id });
      const user = await UserModel.findById(req.params.id);
      return ApiResponse.success(res, user, 'User updated successfully');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async toggleActive(req, res) {
    try {
      const targetId = parseInt(req.params.id);
      if (targetId === req.user.id) {
        return ApiResponse.error(res, 'You cannot deactivate your own account', 403);
      }
      const user = await UserModel.findById(targetId);
      if (!user) return ApiResponse.error(res, 'User not found', 404);
      await UserModel.update(targetId, { is_active: user.is_active ? 0 : 1 });
      return ApiResponse.success(res, { is_active: !user.is_active }, `User ${user.is_active ? 'deactivated' : 'activated'}`);
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

  // GET /my-progress — self-service progress page for any authenticated user
  static async showMyProgress(req, res) {
    req.params.id = String(req.user.id);
    return UserController.showProgress(req, res, true);
  }

  // GET /my-monthly-report — self-service monthly report for any authenticated user
  static async myMonthlyReport(req, res) {
    req.params.id = String(req.user.id);
    return UserController.monthlyReport(req, res);
  }

  static async showProgress(req, res, isSelf = false) {
    try {
      const targetUser = await UserModel.findById(req.params.id);
      if (!targetUser) return res.status(404).render('error', { title: 'Not Found', message: 'User not found', code: 404, layout: false });

      // User progress shows LOCAL employee data — use LOCAL timezone
      const [[localOrg]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      const tz = (localOrg && localOrg.timezone) || req.user.org_timezone || 'America/New_York';
      const selectedDate = req.query.date || getToday(tz);

      const todayDate = getToday(tz);
      const [taskStats, rewardSummary, activeTasks, pendingTasks, recentAdhocCompleted, adhocDayTasks, recurringTasks] = await Promise.all([
        TaskService.getTaskStats(req.params.id, null, todayDate),
        RewardModel.getUserSummary(req.params.id),
        db.query(
          `SELECT t.id, t.title, t.type, t.due_date, t.created_at, u.name as created_by_name
           FROM tasks t LEFT JOIN users u ON t.created_by = u.id
           WHERE t.assigned_to = ? AND t.status = 'in_progress' AND t.is_deleted = 0
           ORDER BY t.created_at DESC`, [req.params.id]
        ),
        db.query(
          `SELECT t.id, t.title, t.type, t.due_date, t.created_at, u.name as created_by_name
           FROM tasks t LEFT JOIN users u ON t.created_by = u.id
           WHERE t.assigned_to = ? AND t.status = 'pending' AND t.is_deleted = 0
           ORDER BY t.created_at DESC`, [req.params.id]
        ),
        // Recently completed adhoc tasks
        db.query(
          `SELECT t.id, t.title, t.type, t.due_date, t.completed_at, u.name as created_by_name
           FROM tasks t LEFT JOIN users u ON t.created_by = u.id
           WHERE t.assigned_to = ? AND t.status = 'completed' AND t.type = 'once' AND t.is_deleted = 0
           ORDER BY t.completed_at DESC LIMIT 10`, [req.params.id]
        ),
        // Adhoc day tasks (original logic)
        db.query(
          `SELECT t.id, t.title, t.type, t.status, t.due_date, t.created_at, t.completed_at, u.name as created_by_name
           FROM tasks t LEFT JOIN users u ON t.created_by = u.id
           WHERE t.assigned_to = ? AND t.type = 'once' AND t.is_deleted = 0
             AND (DATE(t.created_at) = ? OR DATE(t.completed_at) = ? OR DATE(t.due_date) = ?)
           ORDER BY t.status DESC, t.created_at DESC`,
          [req.params.id, selectedDate, selectedDate, selectedDate]
        ),
        // Active recurring tasks scheduled for the selected date (respects daily/weekly/monthly pattern)
        db.query(
          `SELECT t.id, t.title, t.type, t.created_at, t.status, t.due_date,
                  u.name as created_by_name,
                  (tc.id IS NOT NULL AND tc.completed_at IS NOT NULL) as is_completed,
                  (tc.id IS NOT NULL AND tc.started_at IS NOT NULL AND tc.completed_at IS NULL) as is_in_progress,
                  tc.completed_at as completed_at,
                  tc.started_at as started_at,
                  tc.duration_minutes as duration_minutes
           FROM tasks t
           LEFT JOIN users u ON t.created_by = u.id
           LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.user_id = t.assigned_to AND tc.completion_date = ?
           WHERE t.assigned_to = ? AND t.type = 'recurring' AND t.status = 'active' AND t.is_deleted = 0
             AND (
               t.recurrence_pattern = 'daily'
               OR (t.recurrence_pattern = 'weekly' AND FIND_IN_SET(DAYOFWEEK(?) - 1, t.recurrence_days) > 0)
               OR (t.recurrence_pattern = 'monthly' AND FIND_IN_SET(DAY(?), t.recurrence_days) > 0)
             )
             AND (t.recurrence_end_date IS NULL OR t.recurrence_end_date >= ?)
           ORDER BY t.type, t.title`,
          [selectedDate, req.params.id, selectedDate, selectedDate, selectedDate]
        )
      ]);

      // Merge recurring tasks into dayTasks with proper status display
      const recurringDayTasks = recurringTasks[0].map(t => ({
        ...t,
        status: t.is_completed ? 'completed' : t.is_in_progress ? 'in_progress' : 'active',
        is_recurring: true
      }));

      const dayTasks = [...recurringDayTasks, ...adhocDayTasks[0].map(t => ({ ...t, is_recurring: false }))];

      // Build recent completed: combine adhoc completed + recent recurring completions
      const [recentRecurringCompleted] = await db.query(
        `SELECT t.id, t.title, t.type, t.due_date, tc.created_at as completed_at, u.name as created_by_name
         FROM task_completions tc
         JOIN tasks t ON tc.task_id = t.id
         LEFT JOIN users u ON t.created_by = u.id
         WHERE tc.user_id = ? AND t.is_deleted = 0
         ORDER BY tc.completion_date DESC LIMIT 10`, [req.params.id]
      );
      const recentCompleted = [...recentAdhocCompleted[0], ...recentRecurringCompleted]
        .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
        .slice(0, 10);

      // Check if selected date is user's weekly off
      const selectedDayName = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
      const isWeekOff = targetUser.weekly_off_day === selectedDayName;

      const isPast = selectedDate < todayDate;
      const isViewingToday = selectedDate === todayDate;

      res.render('users/progress', {
        title: `${targetUser.name} - Progress`,
        targetUser,
        taskStats,
        rewardSummary,
        activeTasks: activeTasks[0],
        pendingTasks: pendingTasks[0],
        recentCompleted,
        dayTasks: isWeekOff ? [] : dayTasks,
        selectedDate,
        todayDate,
        isPast,
        isViewingToday,
        isSelf,
        isWeekOff,
        orgTimezone: tz
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  // GET /users/:id/monthly-report?month=2026-03
  static async monthlyReport(req, res) {
    try {
      const userId = req.params.id;
      const [[localOrg2]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      const month = req.query.month || getToday((localOrg2 && localOrg2.timezone) || 'America/New_York').slice(0, 7); // YYYY-MM
      const [year, mon] = month.split('-');

      // Adhoc stats for the month
      const [[adhocStats]] = await db.query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          COUNT(*) as type_once,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as once_completed
         FROM tasks
         WHERE assigned_to = ? AND is_deleted = 0 AND type = 'once'
           AND (MONTH(created_at) = ? AND YEAR(created_at) = ?)`,
        [userId, parseInt(mon), parseInt(year)]
      );

      // Recurring task counts (active recurring tasks assigned to this user)
      const [[recurringCounts]] = await db.query(
        `SELECT
          SUM(CASE WHEN recurrence_pattern = 'daily' THEN 1 ELSE 0 END) as type_daily,
          SUM(CASE WHEN recurrence_pattern = 'weekly' THEN 1 ELSE 0 END) as type_weekly,
          SUM(CASE WHEN recurrence_pattern = 'monthly' THEN 1 ELSE 0 END) as type_monthly
         FROM tasks
         WHERE assigned_to = ? AND is_deleted = 0 AND type = 'recurring' AND status = 'active'`,
        [userId]
      );

      // Recurring completions in this month
      const [[recurringCompletions]] = await db.query(
        `SELECT
          COUNT(*) as completed,
          SUM(CASE WHEN t.recurrence_pattern = 'daily' THEN 1 ELSE 0 END) as daily_completed,
          SUM(CASE WHEN t.recurrence_pattern = 'weekly' THEN 1 ELSE 0 END) as weekly_completed
         FROM task_completions tc
         JOIN tasks t ON tc.task_id = t.id
         WHERE tc.user_id = ? AND t.is_deleted = 0
           AND MONTH(tc.completion_date) = ? AND YEAR(tc.completion_date) = ?`,
        [userId, parseInt(mon), parseInt(year)]
      );

      const stats = {
        total: (parseInt(adhocStats.total) || 0) + (parseInt(recurringCounts.type_daily) || 0) + (parseInt(recurringCounts.type_weekly) || 0) + (parseInt(recurringCounts.type_monthly) || 0),
        completed: (parseInt(adhocStats.completed) || 0) + (parseInt(recurringCompletions.completed) || 0),
        in_progress: parseInt(adhocStats.in_progress) || 0,
        pending: parseInt(adhocStats.pending) || 0,
        type_daily: parseInt(recurringCounts.type_daily) || 0,
        type_weekly: parseInt(recurringCounts.type_weekly) || 0,
        type_monthly: parseInt(recurringCounts.type_monthly) || 0,
        type_once: parseInt(adhocStats.type_once) || 0,
        daily_completed: parseInt(recurringCompletions.daily_completed) || 0,
        weekly_completed: parseInt(recurringCompletions.weekly_completed) || 0,
        once_completed: parseInt(adhocStats.once_completed) || 0
      };

      // Daily breakdown: combine adhoc + recurring completions per day
      const [adhocDaily] = await db.query(
        `SELECT DATE(created_at) as date,
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
         FROM tasks
         WHERE assigned_to = ? AND is_deleted = 0 AND type = 'once'
           AND MONTH(created_at) = ? AND YEAR(created_at) = ?
         GROUP BY DATE(created_at)
         ORDER BY date`,
        [userId, parseInt(mon), parseInt(year)]
      );

      const [recurringDaily] = await db.query(
        `SELECT tc.completion_date as date, COUNT(*) as completed
         FROM task_completions tc
         JOIN tasks t ON tc.task_id = t.id
         WHERE tc.user_id = ? AND t.is_deleted = 0
           AND MONTH(tc.completion_date) = ? AND YEAR(tc.completion_date) = ?
         GROUP BY tc.completion_date
         ORDER BY date`,
        [userId, parseInt(mon), parseInt(year)]
      );

      // Merge daily breakdowns
      const dailyMap = new Map();
      for (const row of adhocDaily) {
        const d = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0];
        dailyMap.set(d, { date: row.date, total: parseInt(row.total) || 0, completed: parseInt(row.completed) || 0 });
      }
      for (const row of recurringDaily) {
        const d = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0];
        if (dailyMap.has(d)) {
          dailyMap.get(d).completed += parseInt(row.completed) || 0;
          dailyMap.get(d).total += parseInt(row.completed) || 0;
        } else {
          dailyMap.set(d, { date: row.date, total: parseInt(row.completed) || 0, completed: parseInt(row.completed) || 0 });
        }
      }
      const dailyBreakdown = [...dailyMap.values()].sort((a, b) => new Date(a.date) - new Date(b.date));

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
