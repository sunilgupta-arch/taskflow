const TaskModel = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');
const TaskService = require('../services/taskService');
const DashboardService = require('../services/dashboardService');
const { ApiResponse, getPagination, getPaginationMeta } = require('../utils/response');
const db = require('../config/db');
const { getIO } = require('../config/socket');
const { getToday, getEffectiveWorkDate, getEffectiveWorkDateWithSession, isScheduledForDate } = require('../utils/timezone');

// Helper: fetch the LOCAL org timezone (for employee date calculations)
async function getLocalOrgTimezone() {
  const [[org]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
  return (org && org.timezone) || 'UTC';
}
const XLSX = require('xlsx');

class TaskController {
  // GET /tasks
  static async index(req, res) {
    try {
      const { page = 1, limit = 20, status, type, search, completed_period, assigned_to, for_date } = req.query;
      const role = req.user.role_name;

      const tz = req.user.org_timezone || 'UTC';
      // Always use LOCAL org timezone for employee date calculations
      const empTz = req.user.organization_type === 'LOCAL' ? tz : await getLocalOrgTimezone();
      const today = await getEffectiveWorkDateWithSession(db, req.user.id, tz, req.user.shift_start, req.user.shift_hours);
      const filters = { status, type, search, completed_period, assigned_to, for_date, page, limit, orgType: req.user.organization_type, todayDate: today };
      if (role === 'LOCAL_USER') {
        filters.user = req.user.id;
        filters.role = role;
      }

      const { rows, total } = await TaskModel.getAll(filters);

      // Build a map of each user's effective work date (accounts for night shifts)
      const [allLocalUsers] = await db.query(
        `SELECT id, shift_start, shift_hours FROM users WHERE is_active = 1`
      );
      const userShiftMap = {};
      allLocalUsers.forEach(u => { userShiftMap[u.id] = u; });

      // When filtering by a specific date, use that date; otherwise compute per-employee effective date
      const adminCheckDate = for_date || today;

      // For recurring tasks, attach session status and schedule check for the relevant date
      for (const task of rows) {
        if (task.type === 'recurring' && task.status === 'active') {
          task.is_scheduled_today = isScheduledForDate(task, adminCheckDate);
          if (task.assigned_to) {
            // Use the employee's org timezone (LOCAL), not the viewer's
            const empShift = userShiftMap[task.assigned_to];
            const empCheckDate = for_date || await getEffectiveWorkDateWithSession(db, task.assigned_to, empTz, empShift ? empShift.shift_start : null, empShift ? empShift.shift_hours : null);
            const session = await TaskCompletion.getTodaySession(task.id, task.assigned_to, empCheckDate);
            task.is_started_today = !!(session && session.started_at && !session.completed_at);
            task.is_completed_today = !!(session && session.completed_at);
            task.session_started_at = session ? session.started_at : null;
            task.session_completed_at = session ? session.completed_at : null;
          }
        }
      }

      // Get users for assignment dropdown
      const [ourUsers] = await db.query(
        `SELECT u.id, u.name, r.name as role_name FROM users u 
         JOIN roles r ON u.role_id = r.id
         JOIN organizations o ON u.organization_id = o.id
         WHERE o.org_type = 'LOCAL' AND u.is_active = 1`
      );

      res.render('tasks/index', {
        title: 'Task Management',
        tasks: rows,
        pagination: getPaginationMeta(total, page, limit),
        ourUsers,
        filters: { status, type, search, completed_period, assigned_to, for_date },
        role,
        todayDate: today,
        orgTimezone: tz
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  // GET /tasks/my
  static async myTasks(req, res) {
    try {
      const { page = 1, limit = 20, status, type, search, schedule = 'today', for_date } = req.query;
      const tz = req.user.org_timezone || 'UTC';
      const today = await getEffectiveWorkDateWithSession(db, req.user.id, tz, req.user.shift_start, req.user.shift_hours);
      const checkDate = for_date || today;
      const filters = {
        status, type, search, for_date, page, limit,
        orgType: req.user.organization_type,
        user: req.user.id,
        role: 'LOCAL_USER', // reuse individual-row query path
        todayDate: today
      };
      // Only apply schedule filter when no specific date is selected
      if (!for_date) {
        filters.schedule = schedule;
      }

      const { rows, total } = await TaskModel.getAll(filters);

      // For recurring tasks, attach session status and schedule check for the relevant date
      for (const task of rows) {
        if (task.type === 'recurring' && task.status === 'active') {
          task.is_scheduled_today = isScheduledForDate(task, checkDate);
          if (task.assigned_to) {
            const session = await TaskCompletion.getTodaySession(task.id, task.assigned_to, checkDate);
            task.is_started_today = !!(session && session.started_at && !session.completed_at);
            task.is_completed_today = !!(session && session.completed_at);
          }
        }
      }

      res.render('tasks/index', {
        title: 'My Tasks',
        tasks: rows,
        pagination: getPaginationMeta(total, page, limit),
        ourUsers: [],
        filters: { status, type, search, schedule, for_date },
        role: req.user.role_name,
        isMyTasks: true,
        todayDate: today
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  // GET /tasks/create
  static async showCreate(req, res) {
    const role = req.user.role_name;
    let ourUsers = [];

    // LOCAL_USER gets simplified form (no user dropdown, no reward)
    // All other roles get the full form with user dropdown
    if (role !== 'LOCAL_USER') {
      const [users] = await db.query(
        `SELECT u.id, u.name FROM users u
         JOIN organizations o ON u.organization_id = o.id
         WHERE o.org_type = 'LOCAL' AND u.is_active = 1`
      );
      ourUsers = users;
    }

    res.render('tasks/create', { title: 'Create Task', ourUsers, role, assignTo: req.query.assign_to || '' });
  }

  // POST /tasks/create
  static async create(req, res) {
    try {
      const task = await TaskService.createTask(req.body, req.user);
      return ApiResponse.success(res, task, 'Task created successfully', 201);
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // GET /tasks/:id/edit
  static async showEdit(req, res) {
    try {
      const task = await TaskModel.findById(req.params.id);
      if (!task) return res.status(404).render('error', { title: 'Not Found', message: 'Task not found', code: 404, layout: false });

      // LOCAL_USER can only edit tasks they created, within 24 hours
      const role = req.user.role_name;
      if (role === 'LOCAL_USER') {
        if (task.created_by !== req.user.id) {
          return res.status(403).render('error', { title: 'Forbidden', message: 'You can only edit tasks you created', code: 403, layout: false });
        }
        const hoursSinceCreation = (Date.now() - new Date(task.created_at).getTime()) / 3600000;
        if (hoursSinceCreation > 24) {
          return res.status(403).render('error', { title: 'Forbidden', message: 'You can only edit tasks within 24 hours of creation', code: 403, layout: false });
        }
      }
      let ourUsers = [];
      if (role !== 'LOCAL_USER') {
        const [users] = await db.query(
          `SELECT u.id, u.name FROM users u
           JOIN organizations o ON u.organization_id = o.id
           WHERE o.org_type = 'LOCAL' AND u.is_active = 1`
        );
        ourUsers = users;
      }

      // Get current assignees for grouped tasks
      let currentAssignees = [];
      if (task.group_id) {
        const [rows] = await db.query(
          `SELECT assigned_to FROM tasks WHERE group_id = ? AND is_deleted = 0`, [task.group_id]
        );
        currentAssignees = rows.map(r => r.assigned_to);
      } else if (task.assigned_to) {
        currentAssignees = [task.assigned_to];
      }

      res.render('tasks/edit', { title: 'Edit Task', task, ourUsers, role, currentAssignees });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  // PUT /tasks/:id
  static async update(req, res) {
    try {
      // LOCAL_USER can only update tasks they created, within 24 hours
      if (req.user.role_name === 'LOCAL_USER') {
        const task = await TaskModel.findById(req.params.id);
        if (!task || task.created_by !== req.user.id) {
          return ApiResponse.error(res, 'You can only edit tasks you created', 403);
        }
        const hoursSinceCreation = (Date.now() - new Date(task.created_at).getTime()) / 3600000;
        if (hoursSinceCreation > 24) {
          return ApiResponse.error(res, 'You can only edit tasks within 24 hours of creation', 403);
        }
      }

      const { title, description, type, recurrence_pattern, recurrence_days, deadline_time, recurrence_end_date, due_date, reward_amount, priority, client_visible } = req.body;
      const updateData = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (type !== undefined) updateData.type = type;
      if (due_date !== undefined) updateData.due_date = due_date || null;
      if (reward_amount !== undefined) updateData.reward_amount = reward_amount || null;
      if (priority !== undefined) updateData.priority = priority;
      if (['LOCAL_ADMIN', 'LOCAL_MANAGER'].includes(req.user.role_name)) {
        updateData.created_by_org = client_visible === '1' ? 'CLIENT' : 'LOCAL';
      }

      // Handle recurrence fields
      if (type === 'recurring') {
        updateData.status = 'active';
        updateData.recurrence_pattern = recurrence_pattern || null;
        updateData.recurrence_days = recurrence_days || null;
        updateData.deadline_time = deadline_time || null;
        updateData.recurrence_end_date = recurrence_end_date || null;
      } else if (type === 'once') {
        updateData.recurrence_pattern = null;
        updateData.recurrence_days = null;
        updateData.deadline_time = null;
        updateData.recurrence_end_date = null;
      }

      const updated = await TaskModel.update(req.params.id, updateData);
      if (!updated) return ApiResponse.error(res, 'Task not found or no changes', 404);

      // If grouped task, update all siblings too
      const task = await TaskModel.findById(req.params.id);
      if (task.group_id) {
        const [siblings] = await db.query(
          `SELECT id FROM tasks WHERE group_id = ? AND id != ? AND is_deleted = 0`,
          [task.group_id, req.params.id]
        );
        for (const s of siblings) {
          await TaskModel.update(s.id, updateData);
        }
      }

      return ApiResponse.success(res, { id: req.params.id }, 'Task updated successfully');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // GET /tasks/:id
  static async show(req, res) {
    try {
      const task = await TaskModel.findById(req.params.id);
      if (!task) return res.status(404).render('error', { title: 'Not Found', message: 'Task not found', code: 404, layout: false });

      // Visibility check: CLIENT users cannot view LOCAL-created tasks
      if (req.user.organization_type === 'CLIENT' && task.created_by_org === 'LOCAL') {
        return res.status(404).render('error', { title: 'Not Found', message: 'Task not found', code: 404, layout: false });
      }

      // Fetch all group assignees if this is a grouped task
      let groupAssignees = [];
      if (task.group_id) {
        const [rows] = await db.query(
          `SELECT t.id as task_id, t.assigned_to, t.status, u.name, u.email
           FROM tasks t
           LEFT JOIN users u ON t.assigned_to = u.id
           WHERE t.group_id = ? AND t.is_deleted = 0
           ORDER BY u.name`, [task.group_id]
        );
        groupAssignees = rows;
      }

      const [attachments] = await db.query(
        `SELECT ta.*, u.name as uploaded_by_name FROM task_attachments ta
         JOIN users u ON ta.uploaded_by = u.id
         WHERE ta.task_id = ?`, [task.id]
      );

      const [comments] = await db.query(
        `SELECT c.*, u.name as user_name, r.name as role_name, o.org_type
         FROM task_comments c
         JOIN users u ON c.user_id = u.id
         JOIN roles r ON u.role_id = r.id
         JOIN organizations o ON u.organization_id = o.id
         WHERE c.task_id = ?
         ORDER BY c.created_at ASC`, [task.id]
      );

      // For recurring tasks, check today's completion and get recent history
      let isCompletedToday = false;
      let isStartedToday = false;
      let todaySession = null;
      let recentCompletions = [];
      const isRecurring = task.type === 'recurring' && task.status === 'active';
      if (isRecurring && task.assigned_to) {
        // Use the assigned employee's shift info, not the viewing user's
        const [[empUser]] = await db.query(`SELECT shift_start, shift_hours FROM users WHERE id = ?`, [task.assigned_to]);
        const empShiftStart = (req.user.id === task.assigned_to) ? req.user.shift_start : (empUser ? empUser.shift_start : null);
        const empShiftHours = (req.user.id === task.assigned_to) ? req.user.shift_hours : (empUser ? empUser.shift_hours : null);
        const empTz = req.user.organization_type === 'LOCAL' ? (req.user.org_timezone || 'UTC') : await getLocalOrgTimezone();
        const today = await getEffectiveWorkDateWithSession(db, task.assigned_to, empTz, empShiftStart, empShiftHours);
        todaySession = await TaskCompletion.getTodaySession(task.id, task.assigned_to, today);
        isStartedToday = !!(todaySession && todaySession.started_at && !todaySession.completed_at);
        isCompletedToday = !!(todaySession && todaySession.completed_at);

        // Get last 30 days of completions (completed only — for the RECENT COMPLETIONS card)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        recentCompletions = await TaskCompletion.getCompletionsForTask(
          task.id, thirtyDaysAgo.toISOString().split('T')[0], today
        );

        // Get all session logs (including started-but-not-completed) for TASK LOGS card
        var [sessionLogs] = await db.query(
          `SELECT tc.*, u.name as user_name
           FROM task_completions tc
           JOIN users u ON tc.user_id = u.id
           WHERE tc.task_id = ? AND tc.completion_date >= ? AND tc.completion_date <= ?
             AND (tc.started_at IS NOT NULL OR tc.completed_at IS NOT NULL)
           ORDER BY tc.completion_date DESC, tc.started_at DESC`,
          [task.id, thirtyDaysAgo.toISOString().split('T')[0], today]
        );
      }

      const showTz = isRecurring ? (req.user.organization_type === 'LOCAL' ? (req.user.org_timezone || 'UTC') : await getLocalOrgTimezone()) : 'UTC';
      if (!isRecurring) var sessionLogs = [];
      res.render('tasks/show', { title: task.title, task, attachments, comments, groupAssignees, role: req.user.role_name, isRecurring, isCompletedToday, isStartedToday, todaySession, recentCompletions, sessionLogs, empTimezone: showTz });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  // GET /tasks/:id/comments
  static async getComments(req, res) {
    try {
      const task = await TaskModel.findById(req.params.id);
      if (!task) return ApiResponse.error(res, 'Task not found', 404);

      const [comments] = await db.query(
        `SELECT c.*, u.name as user_name, r.name as role_name, o.org_type
         FROM task_comments c
         JOIN users u ON c.user_id = u.id
         JOIN roles r ON u.role_id = r.id
         JOIN organizations o ON u.organization_id = o.id
         WHERE c.task_id = ?
         ORDER BY c.created_at ASC`, [req.params.id]
      );

      return ApiResponse.success(res, { comments, task_title: task.title });
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // POST /tasks/:id/comments
  static async addComment(req, res) {
    try {
      const { comment, parent_id } = req.body;
      if (!comment || !comment.trim()) {
        return ApiResponse.error(res, 'Comment cannot be empty', 400);
      }
      const task = await TaskModel.findById(req.params.id);
      if (!task) return ApiResponse.error(res, 'Task not found', 404);

      const [result] = await db.query(
        `INSERT INTO task_comments (task_id, user_id, comment, parent_id) VALUES (?, ?, ?, ?)`,
        [req.params.id, req.user.id, comment.trim(), parent_id || null]
      );

      return ApiResponse.success(res, { id: result.insertId }, 'Comment added');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // POST /tasks/assign
  static async assign(req, res) {
    try {
      const { task_id, assigned_to } = req.body;
      // If assigned_to is an array, this is a group assignee update
      if (Array.isArray(assigned_to)) {
        await TaskService.updateGroupAssignees(task_id, assigned_to);

        // Notify each assigned user via socket
        const task = await TaskModel.findById(task_id);
        const io = getIO();
        assigned_to.forEach(userId => {
          io.to(`user:${userId}`).emit('task:assigned', {
            message: `You have been assigned to "${task.title}"`,
            taskId: task_id,
            taskTitle: task.title
          });
        });

        return ApiResponse.success(res, {}, 'Task assignees updated successfully');
      }
      await TaskService.assignTask(task_id, assigned_to, req.user.role_name);

      // Notify the assigned user via socket
      const task = await TaskModel.findById(task_id);
      const io = getIO();
      io.to(`user:${assigned_to}`).emit('task:assigned', {
        message: `You have been assigned to "${task.title}"`,
        taskId: task_id,
        taskTitle: task.title
      });

      return ApiResponse.success(res, {}, 'Task assigned successfully');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // POST /tasks/pick/:id
  static async pick(req, res) {
    try {
      await TaskService.pickTask(req.params.id, req.user);
      return ApiResponse.success(res, {}, 'Task picked successfully');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // POST /tasks/start/:id
  static async start(req, res) {
    try {
      const task = await TaskService.startTask(req.params.id, req.user.id);
      return ApiResponse.success(res, task, 'Task started');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // POST /tasks/:id/start-session  (recurring tasks)
  static async startSession(req, res) {
    try {
      const tz = req.user.org_timezone || 'UTC';
      const workDate = await getEffectiveWorkDateWithSession(db, req.user.id, tz, req.user.shift_start, req.user.shift_hours);
      const task = await TaskService.startSession(req.params.id, req.user.id, tz, workDate);
      return ApiResponse.success(res, task, 'Task started');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // POST /tasks/:id/complete-session  (recurring tasks)
  static async completeSession(req, res) {
    try {
      const tz = req.user.org_timezone || 'UTC';
      const workDate = await getEffectiveWorkDateWithSession(db, req.user.id, tz, req.user.shift_start, req.user.shift_hours);
      const task = await TaskService.completeSession(req.params.id, req.user.id, tz, workDate);

      const io = getIO();
      io.to('admins').emit('task:completed', {
        message: `${req.user.name} completed "${task.title}"`,
        taskId: task.id, taskTitle: task.title, completedBy: req.user.name
      });

      return ApiResponse.success(res, task, 'Task completed');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // POST /tasks/complete/:id
  static async complete(req, res) {
    try {
      const tz = req.user.org_timezone || 'UTC';
      const workDate = await getEffectiveWorkDateWithSession(db, req.user.id, tz, req.user.shift_start, req.user.shift_hours);
      const task = await TaskService.completeTask(req.params.id, req.user.id, workDate);

      // Notify all admins/managers via socket
      const io = getIO();
      io.to('admins').emit('task:completed', {
        message: `${req.user.name} completed "${task.title}"`,
        taskId: task.id,
        taskTitle: task.title,
        completedBy: req.user.name
      });

      return ApiResponse.success(res, task, 'Task marked as completed');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // POST /tasks/:id/upload
  static async uploadAttachments(req, res) {
    try {
      if (!req.files?.length) return ApiResponse.error(res, 'No files uploaded', 400);
      const attachments = await TaskService.uploadAttachments(req.params.id, req.files, req.user.id);
      return ApiResponse.success(res, { attachments }, 'Files uploaded successfully');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // POST /tasks/deactivate/:id
  static async deactivate(req, res) {
    try {
      // LOCAL_USER can only deactivate tasks they created, within 24 hours
      if (req.user.role_name === 'LOCAL_USER') {
        const task = await TaskModel.findById(req.params.id);
        if (!task || task.created_by !== req.user.id) {
          return ApiResponse.error(res, 'You can only deactivate tasks you created', 403);
        }
        const hoursSinceCreation = (Date.now() - new Date(task.created_at).getTime()) / 3600000;
        if (hoursSinceCreation > 24) {
          return ApiResponse.error(res, 'You can only modify tasks within 24 hours of creation', 403);
        }
      }
      await TaskService.deactivateTask(req.params.id);
      return ApiResponse.success(res, {}, 'Task deactivated successfully');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // POST /tasks/:id/log-completion
  static async logCompletion(req, res) {
    try {
      const { date } = req.body;
      const tz = req.user.org_timezone || 'UTC';
      const workDate = date || await getEffectiveWorkDateWithSession(db, req.user.id, tz, req.user.shift_start, req.user.shift_hours);
      const task = await TaskService.logCompletion(req.params.id, req.user.id, workDate, tz);

      const io = getIO();
      io.to('admins').emit('task:completion-logged', {
        message: `${req.user.name} logged completion for "${task.title}"`,
        taskId: task.id,
        taskTitle: task.title,
        completedBy: req.user.name
      });

      return ApiResponse.success(res, task, 'Completion logged successfully');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // POST /tasks/:id/undo-completion
  static async undoCompletion(req, res) {
    try {
      const { date } = req.body;
      const tz = req.user.org_timezone || 'UTC';
      const workDate = date || await getEffectiveWorkDateWithSession(db, req.user.id, tz, req.user.shift_start, req.user.shift_hours);
      const task = await TaskService.undoCompletion(req.params.id, req.user.id, workDate, tz);
      return ApiResponse.success(res, task, 'Completion undone');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // GET /tasks/pending-today (JSON API for pending tasks reminder)
  static async pendingToday(req, res) {
    try {
      const userId = req.user.id;
      const tz = req.user.org_timezone || 'UTC';
      const today = await getEffectiveWorkDateWithSession(db, userId, tz, req.user.shift_start, req.user.shift_hours);
      const tasks = await DashboardService.getTasksForDate(userId, today, today);

      // Filter to only incomplete tasks for today
      const pending = tasks.filter(t => {
        if (t.type === 'recurring' && t.is_completed_for_date) return false;
        if (t.type === 'recurring' && !isScheduledForDate(t, today)) return false;
        if (t.type === 'once' && t.status === 'completed') return false;
        return true;
      });

      return ApiResponse.success(res, { tasks: pending, count: pending.length });
    } catch (err) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  // DELETE /tasks/:id
  static async destroy(req, res) {
    try {
      // LOCAL_USER can only delete tasks they created, within 24 hours
      if (req.user.role_name === 'LOCAL_USER') {
        const task = await TaskModel.findById(req.params.id);
        if (!task || task.created_by !== req.user.id) {
          return ApiResponse.error(res, 'You can only delete tasks you created', 403);
        }
        const hoursSinceCreation = (Date.now() - new Date(task.created_at).getTime()) / 3600000;
        if (hoursSinceCreation > 24) {
          return ApiResponse.error(res, 'You can only delete tasks within 24 hours of creation', 403);
        }
      }
      await TaskService.deleteTask(req.params.id);
      return ApiResponse.success(res, {}, 'Task deleted');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // GET /tasks/board — Task Board (Today + All Tasks)
  static async board(req, res) {
    try {
      const tz = req.user.org_timezone || 'UTC';
      // Board shows LOCAL team tasks — default date should use LOCAL timezone
      const localTz = req.user.organization_type === 'LOCAL' ? tz : await getLocalOrgTimezone();
      const selectedDate = req.query.date || getToday(localTz);
      const tab = req.query.tab || 'today';

      // Get all LOCAL users
      const [localUsers] = await db.query(
        `SELECT u.id, u.name, u.shift_start, u.weekly_off_day
         FROM users u JOIN roles r ON u.role_id = r.id JOIN organizations o ON u.organization_id = o.id
         WHERE u.is_active = 1 AND o.org_type = 'LOCAL' AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
         ORDER BY u.name`
      );

      if (tab === 'today') {
        // ── TODAY TAB ──
        // Get all active recurring tasks (individual rows, not grouped)
        const [recurringTasks] = await db.query(
          `SELECT t.id, t.title, t.type, t.recurrence_pattern, t.recurrence_days,
                  t.recurrence_end_date, t.reward_amount, t.priority, t.status,
                  t.assigned_to, t.secondary_assignee, t.tertiary_assignee,
                  t.group_id, t.deadline_time,
                  u.name as assigned_to_name, u.shift_start,
                  u2.name as secondary_name, u2.shift_start as secondary_shift,
                  u3.name as tertiary_name, u3.shift_start as tertiary_shift
           FROM tasks t
           LEFT JOIN users u ON t.assigned_to = u.id
           LEFT JOIN users u2 ON t.secondary_assignee = u2.id
           LEFT JOIN users u3 ON t.tertiary_assignee = u3.id
           WHERE t.is_deleted = 0 AND t.type = 'recurring' AND t.status = 'active'
           ORDER BY t.title, u.name`
        );

        // Get one-time tasks for the selected date
        const [onceTasks] = await db.query(
          `SELECT t.id, t.title, t.type, t.reward_amount, t.priority, t.status,
                  t.assigned_to, t.secondary_assignee, t.tertiary_assignee,
                  t.group_id, t.due_date, t.completed_at,
                  u.name as assigned_to_name, u.shift_start,
                  u2.name as secondary_name, u2.shift_start as secondary_shift,
                  u3.name as tertiary_name, u3.shift_start as tertiary_shift
           FROM tasks t
           LEFT JOIN users u ON t.assigned_to = u.id
           LEFT JOIN users u2 ON t.secondary_assignee = u2.id
           LEFT JOIN users u3 ON t.tertiary_assignee = u3.id
           WHERE t.is_deleted = 0 AND t.type = 'once'
             AND (t.due_date = ? OR DATE(t.completed_at) = ? OR (DATE(t.created_at) = ? AND t.due_date IS NULL))
           ORDER BY t.title, u.name`,
          [selectedDate, selectedDate, selectedDate]
        );

        // Filter recurring tasks scheduled for selectedDate
        const scheduledRecurring = recurringTasks.filter(t => isScheduledForDate(t, selectedDate));

        // Build unavailable user set: weekly off + approved leaves
        const dayName = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
        const offUserIds = new Set(localUsers.filter(u => u.weekly_off_day === dayName).map(u => u.id));

        // Fetch approved leaves overlapping selectedDate
        const [leaves] = await db.query(
          `SELECT user_id FROM leave_requests
           WHERE status = 'approved' AND from_date <= ? AND to_date >= ?`,
          [selectedDate, selectedDate]
        );
        const onLeaveUserIds = new Set(leaves.map(l => l.user_id));

        // Combined unavailable set (weekly off OR on approved leave)
        const unavailableUserIds = new Set([...offUserIds, ...onLeaveUserIds]);

        // Build user name/shift lookup
        const userLookup = {};
        localUsers.forEach(u => { userLookup[u.id] = { name: u.name, shift_start: u.shift_start }; });

        // Resolve effective assignee for a task based on fallback chain
        const resolveEffectiveAssignee = (t) => {
          const primary = { id: t.assigned_to, name: t.assigned_to_name, shift: t.shift_start };
          const secondary = t.secondary_assignee ? { id: t.secondary_assignee, name: t.secondary_name, shift: t.secondary_shift } : null;
          const tertiary = t.tertiary_assignee ? { id: t.tertiary_assignee, name: t.tertiary_name, shift: t.tertiary_shift } : null;

          // If primary is available, use primary
          if (primary.id && !unavailableUserIds.has(primary.id)) {
            return { ...primary, role: 'primary', original_assignee: primary.name };
          }
          // Primary unavailable — try secondary
          if (secondary && secondary.id && !unavailableUserIds.has(secondary.id)) {
            return { ...secondary, role: 'secondary', original_assignee: primary.name };
          }
          // Secondary also unavailable — try tertiary
          if (tertiary && tertiary.id && !unavailableUserIds.has(tertiary.id)) {
            return { ...tertiary, role: 'tertiary', original_assignee: primary.name };
          }
          // All unavailable — return primary anyway (task will show as unattended)
          // But only if task has no fallback chain, keep original behavior (filter out)
          if (!secondary && !tertiary) {
            return null; // no fallback, will be filtered out like before
          }
          // Has fallback chain but all unavailable — show as unattended
          return { id: primary.id, name: primary.name, shift: primary.shift, role: 'all_unavailable', original_assignee: primary.name };
        };

        // Filter recurring tasks: keep if primary available OR has fallback chain
        const filteredRecurring = scheduledRecurring.filter(t => {
          if (t.secondary_assignee || t.tertiary_assignee) return true; // has fallback, always include
          return !unavailableUserIds.has(t.assigned_to); // original behavior for non-fallback tasks
        });

        // Get completions for the date AND previous day (to handle night shift crossovers)
        const prevDate = new Date(new Date(selectedDate + 'T12:00:00').getTime() - 86400000).toISOString().split('T')[0];
        const [completions] = await db.query(
          `SELECT tc.task_id, tc.user_id, tc.completion_date, tc.started_at, tc.completed_at, tc.duration_minutes
           FROM task_completions tc
           WHERE tc.completion_date IN (?, ?)`,
          [selectedDate, prevDate]
        );
        // Build completion map using each employee's effective work date
        const completionMap = {};
        const userShiftMap = {};
        localUsers.forEach(u => { userShiftMap[u.id] = u; });
        completions.forEach(c => {
          const cDateStr = c.completion_date instanceof Date ? c.completion_date.toISOString().split('T')[0] : String(c.completion_date).split('T')[0];
          // Only include if the completion_date matches the selectedDate
          if (cDateStr === selectedDate) {
            completionMap[`${c.task_id}-${c.user_id}`] = c;
          }
        });

        // Group tasks by title (group_id or title for ungrouped)
        const taskGroups = {};
        const addToGroup = (t, isRecurring) => {
          const groupKey = t.group_id ? `g-${t.group_id}` : `t-${t.id}`;
          if (!taskGroups[groupKey]) {
            taskGroups[groupKey] = {
              title: t.title, type: t.type, pattern: t.recurrence_pattern,
              recurrence_days: t.recurrence_days, priority: t.priority,
              reward_amount: t.reward_amount, deadline_time: t.deadline_time,
              employees: [], doneCount: 0, totalCount: 0
            };
          }

          // Resolve effective assignee (fallback chain)
          const hasFallback = t.secondary_assignee || t.tertiary_assignee;
          let effectiveUserId = t.assigned_to;
          let effectiveUserName = t.assigned_to_name;
          let effectiveShift = t.shift_start;
          let fallbackRole = 'primary';
          let originalAssignee = null;

          if (hasFallback && !t.group_id) {
            const resolved = resolveEffectiveAssignee(t);
            if (!resolved) return; // should not happen for fallback tasks
            effectiveUserId = resolved.id;
            effectiveUserName = resolved.name;
            effectiveShift = resolved.shift;
            fallbackRole = resolved.role;
            if (resolved.role !== 'primary') {
              originalAssignee = resolved.original_assignee;
            }
          }

          const comp = completionMap[`${t.id}-${effectiveUserId}`];
          const isCompleted = isRecurring
            ? !!(comp && comp.completed_at)
            : t.status === 'completed';
          const isStarted = isRecurring
            ? !!(comp && comp.started_at && !comp.completed_at)
            : t.status === 'in_progress';

          taskGroups[groupKey].employees.push({
            task_id: t.id, user_id: effectiveUserId, user_name: effectiveUserName,
            shift_start: effectiveShift,
            status: isCompleted ? 'done' : isStarted ? 'in_progress' : (fallbackRole === 'all_unavailable' ? 'unattended' : 'pending'),
            started_at: comp ? comp.started_at : null,
            completed_at: isRecurring ? (comp ? comp.completed_at : null) : (isCompleted ? t.completed_at : null),
            duration_minutes: comp ? comp.duration_minutes : null,
            fallback_role: fallbackRole,
            original_assignee: originalAssignee,
            secondary_name: t.secondary_name || null,
            tertiary_name: t.tertiary_name || null,
            primary_name: t.assigned_to_name || null
          });
          taskGroups[groupKey].totalCount++;
          if (isCompleted) taskGroups[groupKey].doneCount++;
        };

        filteredRecurring.forEach(t => addToGroup(t, true));
        onceTasks.forEach(t => addToGroup(t, false));

        // Build employee summary — count tasks against effective doer only
        const empSummary = {};
        localUsers.filter(u => !unavailableUserIds.has(u.id)).forEach(u => {
          empSummary[u.id] = { user_id: u.id, name: u.name, shift_start: u.shift_start, assigned: 0, done: 0, in_progress: 0, pending: 0 };
        });
        Object.values(taskGroups).forEach(g => {
          g.employees.forEach(e => {
            if (empSummary[e.user_id]) {
              empSummary[e.user_id].assigned++;
              if (e.status === 'done') empSummary[e.user_id].done++;
              else if (e.status === 'in_progress') empSummary[e.user_id].in_progress++;
              else empSummary[e.user_id].pending++;
            }
          });
        });

        // Summary counts
        const totalAssignments = Object.values(taskGroups).reduce((s, g) => s + g.totalCount, 0);
        const totalDone = Object.values(taskGroups).reduce((s, g) => s + g.doneCount, 0);
        const totalInProgress = Object.values(taskGroups).reduce((s, g) => s + g.employees.filter(e => e.status === 'in_progress').length, 0);
        const totalPending = totalAssignments - totalDone - totalInProgress;

        return res.render('tasks/board', {
          title: 'Task Board',
          tab, selectedDate, orgTimezone: localTz,
          taskGroups: Object.values(taskGroups),
          empSummary: Object.values(empSummary).sort((a, b) => a.name.localeCompare(b.name)),
          summary: { tasks: Object.keys(taskGroups).length, assignments: totalAssignments, done: totalDone, inProgress: totalInProgress, pending: totalPending },
          localUsers
        });
      }

      // ── ALL TASKS TAB ──
      const [allTasks] = await db.query(
        `SELECT t.id, t.title, t.type, t.recurrence_pattern, t.recurrence_days,
                t.recurrence_end_date, t.reward_amount, t.priority, t.status,
                t.assigned_to, t.group_id, t.due_date, t.deadline_time, t.created_at,
                u.name as assigned_to_name
         FROM tasks t
         LEFT JOIN users u ON t.assigned_to = u.id
         WHERE t.is_deleted = 0 AND t.status NOT IN ('deactivated')
         ORDER BY t.title, u.name`
      );

      // Group by group_id or individual task
      const masterList = {};
      allTasks.forEach(t => {
        const groupKey = t.group_id ? `g-${t.group_id}` : `t-${t.id}`;
        if (!masterList[groupKey]) {
          masterList[groupKey] = {
            id: t.group_id || t.id, title: t.title, type: t.type,
            pattern: t.recurrence_pattern, recurrence_days: t.recurrence_days,
            priority: t.priority, reward_amount: t.reward_amount, status: t.status,
            deadline_time: t.deadline_time, due_date: t.due_date,
            recurrence_end_date: t.recurrence_end_date,
            employees: [], task_ids: []
          };
        }
        if (t.assigned_to) {
          masterList[groupKey].employees.push({ id: t.assigned_to, name: t.assigned_to_name });
        }
        masterList[groupKey].task_ids.push(t.id);
      });

      return res.render('tasks/board', {
        title: 'Task Board',
        tab, selectedDate, orgTimezone: localTz,
        masterList: Object.values(masterList),
        localUsers
      });

    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  // GET /tasks/board/export — Export tasks as Excel
  static async boardExport(req, res) {
    try {
      const [tasks] = await db.query(
        `SELECT t.id, t.title, t.type, t.recurrence_pattern, t.recurrence_days,
                t.deadline_time, t.recurrence_end_date, t.reward_amount, t.priority,
                t.status, t.group_id, t.assigned_to, u.name as assigned_to_name
         FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id
         WHERE t.is_deleted = 0 AND t.status NOT IN ('deactivated')
         ORDER BY COALESCE(t.group_id, t.id), t.title`
      );

      // Group tasks by group_id for multi-assigned
      const grouped = {};
      tasks.forEach(t => {
        const key = t.group_id ? `g-${t.group_id}` : `t-${t.id}`;
        if (!grouped[key]) {
          grouped[key] = {
            id: t.group_id || t.id, title: t.title, type: t.type,
            pattern: t.recurrence_pattern || '', days: t.recurrence_days || '',
            deadline: t.deadline_time || '', end_date: t.recurrence_end_date || '',
            reward: t.reward_amount || '', priority: t.priority,
            status: t.status, employees: []
          };
        }
        if (t.assigned_to_name) grouped[key].employees.push(t.assigned_to_name);
      });

      const rows = Object.values(grouped).map(g => ({
        'Task ID': g.id,
        'Task Name': g.title,
        'Type': g.type,
        'Pattern': g.pattern,
        'Days': g.days,
        'Deadline Time': g.deadline,
        'End Date': g.end_date ? new Date(g.end_date).toISOString().split('T')[0] : '',
        'Priority': g.priority,
        'Reward': g.reward,
        'Status': g.status,
        'Assigned To': g.employees.join(', ')
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=taskflow-tasks.xlsx');
      return res.send(buf);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  // POST /tasks/board/import — Step 1: Preview parsed Excel data
  static async boardImport(req, res) {
    try {
      if (!req.file) return res.redirect('/tasks/board?tab=all&msg=' + encodeURIComponent('No file uploaded'));

      const wb = XLSX.read(req.file.buffer || require('fs').readFileSync(req.file.path));
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);

      if (!rows.length) return res.redirect('/tasks/board?tab=all&msg=' + encodeURIComponent('Empty spreadsheet'));

      // Get user name → id map
      const [users] = await db.query(
        `SELECT u.id, u.name FROM users u JOIN organizations o ON u.organization_id = o.id
         WHERE u.is_active = 1 AND o.org_type = 'LOCAL'`
      );
      const userMap = {};
      users.forEach(u => { userMap[u.name.trim().toLowerCase()] = u.id; });

      // Parse rows and flag issues
      const preview = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const title = (row['Task Name'] || '').trim();
        if (!title) continue;

        const taskId = row['Task ID'] ? parseInt(row['Task ID']) : null;
        const type = (row['Type'] || 'recurring').toLowerCase();
        const pattern = (row['Pattern'] || 'daily').toLowerCase();
        const days = row['Days'] ? String(row['Days']).trim() : '';
        const deadline = row['Deadline Time'] ? String(row['Deadline Time']).trim() : '';
        const endDate = row['End Date'] ? String(row['End Date']).trim() : '';
        const priority = (row['Priority'] || 'medium').toLowerCase();
        const reward = row['Reward'] ? parseFloat(row['Reward']) : '';
        const assignedStr = (row['Assigned To'] || '').trim();

        const employeeNames = assignedStr ? assignedStr.split(',').map(n => n.trim()) : [];
        const matched = [];
        const unmatched = [];
        employeeNames.forEach(n => {
          if (userMap[n.toLowerCase()]) matched.push({ name: n, id: userMap[n.toLowerCase()] });
          else unmatched.push(n);
        });

        preview.push({
          rowNum: i + 2, taskId, title, type, pattern, days, deadline, endDate, priority, reward,
          action: taskId ? 'update' : 'create',
          matched, unmatched, assignedStr
        });
      }

      return res.render('tasks/import-preview', {
        title: 'Import Preview',
        preview,
        localUsers: users,
        previewJson: JSON.stringify(preview)
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  // POST /tasks/board/import/confirm — Step 2: Actually insert/update
  static async boardImportConfirm(req, res) {
    try {
      const { rows: rowsJson } = req.body;
      const rows = JSON.parse(rowsJson);

      if (!rows || !rows.length) return res.redirect('/tasks/board?tab=all&msg=' + encodeURIComponent('No data to import'));

      let created = 0, updated = 0, skipped = 0;

      for (const row of rows) {
        const title = (row.title || '').trim();
        if (!title) { skipped++; continue; }

        const taskId = row.taskId ? parseInt(row.taskId) : null;
        const type = (row.type || 'recurring').toLowerCase();
        const pattern = (row.pattern || 'daily').toLowerCase();
        const days = row.days || null;
        const deadline = row.deadline || null;
        const endDate = row.endDate || null;
        const priority = (row.priority || 'medium').toLowerCase();
        const reward = row.reward ? parseFloat(row.reward) : null;
        const employeeIds = (row.employeeIds || []).map(id => parseInt(id)).filter(Boolean);

        // Update existing task
        if (taskId) {
          const existing = await TaskModel.findById(taskId);
          if (!existing) { skipped++; continue; }

          await TaskModel.update(taskId, { title, priority, reward_amount: reward });
          if (existing.group_id) {
            await db.query(
              `UPDATE tasks SET title = ?, priority = ?, reward_amount = ? WHERE group_id = ? AND is_deleted = 0`,
              [title, priority, reward, existing.group_id]
            );
          }
          updated++;
          continue;
        }

        // Create new task
        const baseData = {
          title, type,
          recurrence_pattern: type === 'recurring' ? pattern : null,
          recurrence_days: type === 'recurring' ? days : null,
          deadline_time: deadline,
          recurrence_end_date: endDate,
          priority,
          reward_amount: reward,
          created_by: req.user.id,
          created_by_org: req.user.organization_type,
          status: type === 'recurring' ? 'active' : 'pending'
        };

        if (employeeIds.length > 1) {
          const firstId = await TaskModel.create({ ...baseData, assigned_to: employeeIds[0] });
          await TaskModel.update(firstId, { group_id: firstId });
          for (let j = 1; j < employeeIds.length; j++) {
            await TaskModel.create({ ...baseData, assigned_to: employeeIds[j], group_id: firstId });
          }
        } else {
          baseData.assigned_to = employeeIds[0] || null;
          await TaskModel.create(baseData);
        }
        created++;
      }

      const msg = encodeURIComponent(`Import complete: ${created} created, ${updated} updated, ${skipped} skipped`);
      res.redirect(`/tasks/board?tab=all&msg=${msg}`);
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  // POST /tasks/board/merge — Merge selected tasks into one group
  static async boardMerge(req, res) {
    try {
      const { task_ids, keep_title } = req.body;
      if (!task_ids || !Array.isArray(task_ids) || task_ids.length < 2) {
        return res.status(400).json({ error: 'Select at least 2 tasks to merge' });
      }

      const ids = task_ids.map(id => parseInt(id)).filter(Boolean);

      // Get all task rows (including grouped ones) for selected IDs
      const [tasks] = await db.query(
        `SELECT * FROM tasks WHERE (id IN (?) OR group_id IN (?)) AND is_deleted = 0`,
        [ids, ids]
      );
      if (tasks.length < 2) return res.status(400).json({ error: 'Not enough tasks to merge' });

      // Use the first task as the master
      const masterTitle = keep_title || tasks[0].title;
      const masterId = Math.min(...tasks.map(t => t.group_id || t.id));

      // Collect all unique assignees
      const assigneeSet = new Set();
      tasks.forEach(t => { if (t.assigned_to) assigneeSet.add(t.assigned_to); });

      // Use the first task's properties as template
      const template = tasks.find(t => t.id === masterId) || tasks[0];

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        // Soft-delete all tasks in the merge set
        await conn.query(`UPDATE tasks SET is_deleted = 1 WHERE id IN (?)`, [tasks.map(t => t.id)]);

        // Create fresh grouped tasks with all unique assignees
        const assignees = Array.from(assigneeSet);
        if (assignees.length > 0) {
          const firstId = (await conn.query(
            `INSERT INTO tasks (title, description, type, recurrence_pattern, recurrence_days, deadline_time, recurrence_end_date,
              assigned_to, created_by, created_by_org, reward_amount, priority, status, is_deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [masterTitle, template.description, template.type, template.recurrence_pattern, template.recurrence_days,
             template.deadline_time, template.recurrence_end_date, assignees[0], template.created_by,
             template.created_by_org, template.reward_amount, template.priority,
             template.type === 'recurring' ? 'active' : 'pending']
          ))[0].insertId;

          await conn.query(`UPDATE tasks SET group_id = ? WHERE id = ?`, [firstId, firstId]);
          for (let i = 1; i < assignees.length; i++) {
            await conn.query(
              `INSERT INTO tasks (title, description, type, recurrence_pattern, recurrence_days, deadline_time, recurrence_end_date,
                assigned_to, created_by, created_by_org, group_id, reward_amount, priority, status, is_deleted)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
              [masterTitle, template.description, template.type, template.recurrence_pattern, template.recurrence_days,
               template.deadline_time, template.recurrence_end_date, assignees[i], template.created_by,
               template.created_by_org, firstId, template.reward_amount, template.priority,
               template.type === 'recurring' ? 'active' : 'pending']
            );
          }
        }

        await conn.commit();
        return res.json({ success: true, message: `Merged ${tasks.length} tasks into "${masterTitle}" with ${assignees.length} assignee(s)` });
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
}

module.exports = TaskController;
