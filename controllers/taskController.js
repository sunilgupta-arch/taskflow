const TaskModel = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');
const TaskService = require('../services/taskService');
const { ApiResponse, getPagination, getPaginationMeta } = require('../utils/response');
const db = require('../config/db');
const { getIO } = require('../config/socket');
const { getToday } = require('../utils/timezone');

class TaskController {
  // GET /tasks
  static async index(req, res) {
    try {
      const { page = 1, limit = 20, status, type, search, completed_period, assigned_to } = req.query;
      const role = req.user.role_name;

      const filters = { status, type, search, completed_period, assigned_to, page, limit, orgType: req.user.organization_type };
      if (role === 'LOCAL_USER') {
        filters.user = req.user.id;
        filters.role = role;
      }

      const { rows, total } = await TaskModel.getAll(filters);

      // For recurring tasks, attach today's session status
      const today = getToday(req.user.org_timezone || 'UTC');
      for (const task of rows) {
        if (task.type === 'recurring' && task.status === 'active' && task.assigned_to) {
          const session = await TaskCompletion.getTodaySession(task.id, task.assigned_to, today);
          task.is_started_today = !!(session && session.started_at && !session.completed_at);
          task.is_completed_today = !!(session && session.completed_at);
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
        filters: { status, type, search, completed_period },
        role
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  // GET /tasks/my
  static async myTasks(req, res) {
    try {
      const { page = 1, limit = 20, status, type, search, schedule = 'today' } = req.query;
      const filters = {
        status, type, search, schedule, page, limit,
        orgType: req.user.organization_type,
        user: req.user.id,
        role: 'LOCAL_USER' // reuse individual-row query path
      };

      const { rows, total } = await TaskModel.getAll(filters);

      // For recurring tasks, attach today's session status
      const today = getToday(req.user.org_timezone || 'UTC');
      for (const task of rows) {
        if (task.type === 'recurring' && task.status === 'active' && task.assigned_to) {
          const session = await TaskCompletion.getTodaySession(task.id, task.assigned_to, today);
          task.is_started_today = !!(session && session.started_at && !session.completed_at);
          task.is_completed_today = !!(session && session.completed_at);
        }
      }

      res.render('tasks/index', {
        title: 'My Tasks',
        tasks: rows,
        pagination: getPaginationMeta(total, page, limit),
        ourUsers: [],
        filters: { status, type, search, schedule },
        role: req.user.role_name,
        isMyTasks: true
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

      const role = req.user.role_name;
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
        const today = getToday(req.user.org_timezone || 'UTC');
        todaySession = await TaskCompletion.getTodaySession(task.id, task.assigned_to, today);
        isStartedToday = !!(todaySession && todaySession.started_at && !todaySession.completed_at);
        isCompletedToday = !!(todaySession && todaySession.completed_at);

        // Get last 30 days of completions
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        recentCompletions = await TaskCompletion.getCompletionsForTask(
          task.id, thirtyDaysAgo.toISOString().split('T')[0], today
        );
      }

      res.render('tasks/show', { title: task.title, task, attachments, comments, groupAssignees, role: req.user.role_name, isRecurring, isCompletedToday, isStartedToday, todaySession, recentCompletions });
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
      const task = await TaskService.startSession(req.params.id, req.user.id, tz);
      return ApiResponse.success(res, task, 'Task started');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // POST /tasks/:id/complete-session  (recurring tasks)
  static async completeSession(req, res) {
    try {
      const tz = req.user.org_timezone || 'UTC';
      const task = await TaskService.completeSession(req.params.id, req.user.id, tz);

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
      const task = await TaskService.completeTask(req.params.id, req.user.id);

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
      const task = await TaskService.logCompletion(req.params.id, req.user.id, date || null, tz);

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
      const task = await TaskService.undoCompletion(req.params.id, req.user.id, date || null, tz);
      return ApiResponse.success(res, task, 'Completion undone');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // DELETE /tasks/:id
  static async destroy(req, res) {
    try {
      await TaskService.deleteTask(req.params.id);
      return ApiResponse.success(res, {}, 'Task deleted');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }
}

module.exports = TaskController;
