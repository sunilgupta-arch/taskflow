const TaskModel = require('../models/Task');
const TaskService = require('../services/taskService');
const { ApiResponse, getPagination, getPaginationMeta } = require('../utils/response');
const db = require('../config/db');

class TaskController {
  // GET /tasks
  static async index(req, res) {
    try {
      const { page = 1, limit = 20, status, type, search } = req.query;
      const role = req.user.role_name;

      const filters = { status, type, search, page, limit };
      if (role === 'OUR_USER') {
        filters.user = req.user.id;
        filters.role = role;
      }

      const { rows, total } = await TaskModel.getAll(filters);
      
      // Get users for assignment dropdown
      const [ourUsers] = await db.query(
        `SELECT u.id, u.name, r.name as role_name FROM users u 
         JOIN roles r ON u.role_id = r.id
         JOIN organizations o ON u.organization_id = o.id
         WHERE o.org_type = 'OUR' AND u.is_active = 1`
      );

      res.render('tasks/index', {
        title: 'Task Management',
        tasks: rows,
        pagination: getPaginationMeta(total, page, limit),
        ourUsers,
        filters: { status, type, search },
        role
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  // GET /tasks/create
  static async showCreate(req, res) {
    const [ourUsers] = await db.query(
      `SELECT u.id, u.name FROM users u 
       JOIN organizations o ON u.organization_id = o.id
       WHERE o.org_type = 'OUR' AND u.is_active = 1`
    );
    res.render('tasks/create', { title: 'Create Task', ourUsers });
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

  // GET /tasks/:id
  static async show(req, res) {
    try {
      const task = await TaskModel.findById(req.params.id);
      if (!task) return res.status(404).render('error', { title: 'Not Found', message: 'Task not found', code: 404, layout: false });

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

      res.render('tasks/show', { title: task.title, task, attachments, comments, role: req.user.role_name });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
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
      await TaskService.assignTask(task_id, assigned_to, req.user.role_name);
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

  // POST /tasks/complete/:id
  static async complete(req, res) {
    try {
      const task = await TaskService.completeTask(req.params.id, req.user.id);
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

  // DELETE /tasks/:id
  static async destroy(req, res) {
    try {
      await TaskModel.softDelete(req.params.id);
      return ApiResponse.success(res, {}, 'Task deleted');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }
}

module.exports = TaskController;
