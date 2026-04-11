const PortalTask = require('../models/Task');
const { ApiResponse } = require('../../utils/response');
const path = require('path');
const fs = require('fs');

class PortalTaskController {

  // Render tasks page
  static async index(req, res) {
    try {
      const assignableUsers = await PortalTask.getAssignableUsers(req.user.id, req.user.role_name);
      res.render('portal/tasks', {
        title: 'Tasks - Client Portal',
        layout: 'portal/layout',
        section: 'tasks',
        assignableUsers
      });
    } catch (err) {
      console.error('Portal tasks index error:', err);
      res.status(500).render('error', { title: 'Error', message: 'Failed to load tasks', code: 500, layout: false });
    }
  }

  // List tasks (API)
  static async list(req, res) {
    try {
      const { status, priority, archived, search, page, limit } = req.query;
      const filters = {};
      if (status) filters.status = status;
      if (priority) filters.priority = priority;
      if (archived) filters.archived = archived;
      if (search) filters.search = search;
      if (limit) {
        filters.limit = parseInt(limit) || 100;
        filters.offset = ((parseInt(page) || 1) - 1) * filters.limit;
      }

      let result;
      if (['CLIENT_ADMIN', 'CLIENT_TOP_MGMT'].includes(req.user.role_name)) {
        result = await PortalTask.getAllTasks(filters);
      } else {
        result = await PortalTask.getTasksForUser(req.user.id, filters);
      }

      // If paginated, result is { rows, total }; otherwise it's an array
      if (filters.limit && result.rows) {
        return ApiResponse.success(res, {
          tasks: result.rows,
          total: result.total,
          page: parseInt(page) || 1,
          limit: filters.limit,
          totalPages: Math.ceil(result.total / filters.limit)
        });
      }

      return ApiResponse.success(res, { tasks: result });
    } catch (err) {
      console.error('Portal list tasks error:', err);
      return ApiResponse.error(res, 'Failed to load tasks');
    }
  }

  // Archive / Unarchive task
  static async toggleArchive(req, res) {
    try {
      const taskId = parseInt(req.params.id);
      const task = await PortalTask.getById(taskId);
      if (!task) return ApiResponse.error(res, 'Task not found', 404);

      const canAccess = await PortalTask.canAccess(taskId, req.user.id, req.user.role_name);
      if (!canAccess) return ApiResponse.error(res, 'Access denied', 403);

      await PortalTask.toggleArchive(taskId);
      const updated = await PortalTask.getById(taskId);
      return ApiResponse.success(res, { task: updated }, updated.is_archived ? 'Task archived' : 'Task unarchived');
    } catch (err) {
      console.error('Portal toggle archive error:', err);
      return ApiResponse.error(res, 'Failed to update archive status');
    }
  }

  // Create task
  static async create(req, res) {
    try {
      // Only admin, top_mgmt, mgmt, and managers can create
      if (!['CLIENT_ADMIN', 'CLIENT_TOP_MGMT', 'CLIENT_MGMT', 'CLIENT_MANAGER'].includes(req.user.role_name)) {
        return ApiResponse.error(res, 'You cannot create tasks', 403);
      }

      const { title, description, priority, assigned_to, due_date } = req.body;

      if (!title || !title.trim()) {
        return ApiResponse.error(res, 'Task title is required', 400);
      }
      if (!assigned_to) {
        return ApiResponse.error(res, 'Assignee is required', 400);
      }

      // Hierarchy check: can only assign to same level or below
      if (!['CLIENT_ADMIN'].includes(req.user.role_name)) {
        const assignableUsers = await PortalTask.getAssignableUsers(req.user.id, req.user.role_name);
        const canAssign = assignableUsers.some(u => u.id === parseInt(assigned_to));
        if (!canAssign) {
          return ApiResponse.error(res, 'You cannot assign tasks to this user', 403);
        }
      }

      const taskId = await PortalTask.create({
        title: title.trim(),
        description: description?.trim() || null,
        priority: priority || 'medium',
        assigned_by: req.user.id,
        assigned_to: parseInt(assigned_to),
        due_date: due_date || null
      });

      const task = await PortalTask.getById(taskId);

      // Notify assignee via Socket.IO
      const { getIO } = require('../../config/socket');
      try {
        const io = getIO();
        const portalNs = io.of('/portal');
        portalNs.to(`portal:user:${assigned_to}`).emit('portal:task:new', task);
      } catch (_) {}

      return ApiResponse.success(res, { task }, 'Task created', 201);
    } catch (err) {
      console.error('Portal create task error:', err);
      return ApiResponse.error(res, 'Failed to create task');
    }
  }

  // Get single task with comments
  static async getTask(req, res) {
    try {
      const taskId = parseInt(req.params.id);
      const task = await PortalTask.getById(taskId);

      if (!task) return ApiResponse.error(res, 'Task not found', 404);

      const canAccess = await PortalTask.canAccess(taskId, req.user.id, req.user.role_name);
      if (!canAccess) return ApiResponse.error(res, 'Access denied', 403);

      const comments = await PortalTask.getComments(taskId);
      return ApiResponse.success(res, { task, comments });
    } catch (err) {
      console.error('Portal get task error:', err);
      return ApiResponse.error(res, 'Failed to load task');
    }
  }

  // Update task
  static async update(req, res) {
    try {
      const taskId = parseInt(req.params.id);
      const task = await PortalTask.getById(taskId);

      if (!task) return ApiResponse.error(res, 'Task not found', 404);

      const oldStatus = task.status;

      // Only creator or admin can edit task details
      if (task.assigned_by !== req.user.id && req.user.role_name !== 'CLIENT_ADMIN') {
        // Assignee can only update status
        if (task.assigned_to === req.user.id) {
          const { status } = req.body;
          if (status) {
            await PortalTask.updateStatus(taskId, status);
            const updated = await PortalTask.getById(taskId);

            // Notify creator and assignee of status change
            PortalTaskController._emitStatusChange(updated, oldStatus, req.user.id);

            return ApiResponse.success(res, { task: updated }, 'Status updated');
          }
        }
        return ApiResponse.error(res, 'You cannot edit this task', 403);
      }

      const newStatus = req.body.status;
      await PortalTask.update(taskId, req.body);
      const updated = await PortalTask.getById(taskId);

      // Notify on status change
      if (newStatus && newStatus !== oldStatus) {
        PortalTaskController._emitStatusChange(updated, oldStatus, req.user.id);
      }

      return ApiResponse.success(res, { task: updated }, 'Task updated');
    } catch (err) {
      console.error('Portal update task error:', err);
      return ApiResponse.error(res, 'Failed to update task');
    }
  }

  // Emit task status change to relevant users
  static _emitStatusChange(task, oldStatus, changedByUserId) {
    const { getIO } = require('../../config/socket');
    try {
      const io = getIO();
      const portalNs = io.of('/portal');

      // Notify both creator and assignee (except the one who made the change)
      [task.assigned_by, task.assigned_to].forEach(uid => {
        if (uid !== changedByUserId) {
          portalNs.to(`portal:user:${uid}`).emit('portal:task:status', {
            task_id: task.id,
            title: task.title,
            status: task.status,
            old_status: oldStatus,
            priority: task.priority,
            assigned_by_name: task.assigned_by_name,
            assigned_to_name: task.assigned_to_name,
            changed_by_name: uid === task.assigned_by ? task.assigned_to_name : task.assigned_by_name
          });
        }
      });
    } catch (_) {}
  }

  // Add comment to task (with optional file attachment)
  static async addComment(req, res) {
    try {
      const taskId = parseInt(req.params.id);
      const content = req.body.content || '';
      const hasFile = !!req.file;

      if (!content.trim() && !hasFile) {
        return ApiResponse.error(res, 'Comment or file is required', 400);
      }

      const canAccess = await PortalTask.canAccess(taskId, req.user.id, req.user.role_name);
      if (!canAccess) return ApiResponse.error(res, 'Access denied', 403);

      const commentText = hasFile && !content.trim()
        ? `Attached file: ${req.file.originalname}`
        : content.trim();

      const commentId = await PortalTask.addComment({
        task_id: taskId,
        user_id: req.user.id,
        content: commentText
      });

      // Save file attachment if present
      if (hasFile) {
        const uploadsDir = path.join(__dirname, '../../uploads/portal/tasks');
        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

        const uniqueName = `${Date.now()}_${req.file.originalname}`;
        const filePath = path.join(uploadsDir, uniqueName);
        fs.writeFileSync(filePath, req.file.buffer);

        await PortalTask.saveCommentAttachment({
          comment_id: commentId,
          file_name: req.file.originalname,
          file_path: `portal/tasks/${uniqueName}`,
          file_size: req.file.size,
          mime_type: req.file.mimetype,
          uploaded_by: req.user.id
        });
      }

      const comments = await PortalTask.getComments(taskId);
      const comment = comments.find(c => c.id === commentId);

      // Notify task participants via Socket.IO
      const task = await PortalTask.getById(taskId);
      const { getIO } = require('../../config/socket');
      try {
        const io = getIO();
        const portalNs = io.of('/portal');
        [task.assigned_by, task.assigned_to].forEach(uid => {
          if (uid !== req.user.id) {
            portalNs.to(`portal:user:${uid}`).emit('portal:task:comment', {
              task_id: taskId,
              task_title: task.title,
              task_priority: task.priority,
              commenter_name: req.user.name,
              comment
            });
          }
        });
      } catch (_) {}

      return ApiResponse.success(res, { comment }, 'Comment added');
    } catch (err) {
      console.error('Portal add comment error:', err);
      return ApiResponse.error(res, 'Failed to add comment');
    }
  }

  // Edit a comment
  static async editComment(req, res) {
    try {
      const commentId = parseInt(req.params.commentId);
      const { content } = req.body;
      if (!content || !content.trim()) return ApiResponse.error(res, 'Content required', 400);

      const db = require('../../config/db');
      const [[existing]] = await db.query('SELECT * FROM portal_task_comments WHERE id = ?', [commentId]);
      if (!existing) return ApiResponse.error(res, 'Comment not found', 404);
      if (existing.user_id !== req.user.id) return ApiResponse.error(res, 'You can only edit your own comments', 403);

      await db.query('UPDATE portal_task_comments SET content = ? WHERE id = ?', [content.trim(), commentId]);
      return ApiResponse.success(res, {}, 'Comment updated');
    } catch (err) {
      return ApiResponse.error(res, 'Failed to update comment');
    }
  }

  // Serve task attachment
  static async serveAttachment(req, res) {
    try {
      const attachmentId = parseInt(req.params.attachmentId);
      const attachment = await PortalTask.getAttachment(attachmentId);

      if (!attachment) return res.status(404).json({ success: false, message: 'Attachment not found' });

      const canAccess = await PortalTask.canAccess(attachment.task_id, req.user.id, req.user.role_name);
      if (!canAccess) return res.status(403).json({ success: false, message: 'Access denied' });

      const filePath = path.join(__dirname, '../../uploads', attachment.file_path);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'File not found on disk' });
      }

      res.setHeader('Content-Disposition', `inline; filename="${attachment.file_name}"`);
      res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
      res.sendFile(filePath);
    } catch (err) {
      console.error('Portal serve task attachment error:', err);
      return res.status(500).json({ success: false, message: 'Failed to serve file' });
    }
  }
}

module.exports = PortalTaskController;
