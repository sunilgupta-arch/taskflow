const ClientRequest = require('../../models/ClientRequest');
const { ApiResponse } = require('../../utils/response');
const { getIO } = require('../../config/socket');
const GoogleDriveService = require('../../services/googleDriveService');

function statsFromInstances(instances) {
  const s = { total: 0, open: 0, picked: 0, done: 0, missed: 0, cancelled: 0 };
  for (const inst of instances) {
    if (inst.status in s) s[inst.status]++;
    if (inst.status !== 'cancelled') s.total++;
  }
  return s;
}

class ClientRequestController {

  static async index(req, res) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dateStr = req.query.date || today;
      const orgId = req.user.organization_id;

      // Ensure instances are generated for this date
      await ClientRequest.getQueueForDate(dateStr);

      const isSales = req.user.role_name === 'CLIENT_SALES';
      const [instances, requests, taskTypes, localUsers] = await Promise.all([
        ClientRequest.getInstancesForOrg(orgId, dateStr, req.user.id, isSales),
        ClientRequest.getRequestsForOrg(orgId, false, req.user.id, isSales),
        ClientRequest.getTaskTypes(orgId),
        ClientRequest.getLocalUsers()
      ]);
      const stats = statsFromInstances(instances);

      res.render('portal/requests', {
        title: 'Allocate Task TI',
        layout: 'portal/layout',
        section: 'requests',
        instances,
        requests,
        taskTypes,
        localUsers,
        selectedDate: dateStr,
        today,
        stats
      });
    } catch (err) {
      console.error('ClientRequest index error:', err);
      res.status(500).send('Server error');
    }
  }

  static async getInstances(req, res) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dateStr = req.query.date || today;
      const orgId = req.user.organization_id;
      await ClientRequest.getQueueForDate(dateStr);
      const isSales = req.user.role_name === 'CLIENT_SALES';
      const instances = await ClientRequest.getInstancesForOrg(orgId, dateStr, req.user.id, isSales);
      const stats = statsFromInstances(instances);
      return ApiResponse.success(res, { instances, stats, date: dateStr });
    } catch (err) {
      console.error('ClientRequest getInstances error:', err);
      return ApiResponse.error(res, 'Failed to load requests');
    }
  }

  static async create(req, res) {
    try {
      const { title, task_type, description, priority, recurrence, recurrence_days,
              start_date, recurrence_end_date, due_time, assigned_to } = req.body;
      if (!title || !title.trim()) return ApiResponse.error(res, 'Title is required', 400);
      const effectiveStartDate = start_date || new Date().toISOString().split('T')[0];
      const effectiveTaskType = (task_type && task_type.trim()) ? task_type.trim() : 'General';

      const id = await ClientRequest.create({
        org_id: req.user.organization_id,
        created_by: req.user.id,
        title: title.trim(),
        task_type: effectiveTaskType,
        description: description || null,
        priority: priority || 'normal',
        recurrence: recurrence || 'none',
        recurrence_days: recurrence === 'weekly' ? (recurrence_days || null) : null,
        start_date: effectiveStartDate,
        recurrence_end_date: recurrence !== 'none' ? (recurrence_end_date || null) : null,
        due_time: due_time || null,
        assigned_to: assigned_to ? parseInt(assigned_to) : null
      });

      await ClientRequest.getQueueForDate(effectiveStartDate);

      try { const io = getIO(); io.emit('queue:new_request', { id, date: effectiveStartDate }); io.of('/portal').emit('queue:new_request', { id, date: effectiveStartDate }); } catch (_) {}

      return ApiResponse.success(res, { id }, 'Request created');
    } catch (err) {
      console.error('ClientRequest create error:', err);
      return ApiResponse.error(res, 'Failed to create request');
    }
  }

  static async deactivate(req, res) {
    try {
      const requestId = parseInt(req.params.id);
      const orgId = req.user.organization_id;
      const isAdmin = ['CLIENT_ADMIN', 'CLIENT_TOP_MGMT'].includes(req.user.role_name);
      if (!isAdmin) return ApiResponse.error(res, 'Not authorized', 403);
      await ClientRequest.deactivate(requestId, orgId);
      return ApiResponse.success(res, {}, 'Request deactivated');
    } catch (err) {
      console.error('ClientRequest deactivate error:', err);
      return ApiResponse.error(res, 'Failed to deactivate');
    }
  }

  static async update(req, res) {
    try {
      const requestId = parseInt(req.params.id);
      const orgId = req.user.organization_id;
      const isAdmin = ['CLIENT_ADMIN', 'CLIENT_TOP_MGMT', 'CLIENT_MGMT', 'CLIENT_MANAGER'].includes(req.user.role_name);
      if (!isAdmin) return ApiResponse.error(res, 'Not authorized', 403);
      const { title, task_type, description, priority, due_time, recurrence_end_date, assigned_to, recurrence, recurrence_days } = req.body;
      if (title !== undefined && !title.trim()) return ApiResponse.error(res, 'Title cannot be empty', 400);
      if (recurrence === 'weekly' && recurrence_days !== undefined && !recurrence_days) {
        return ApiResponse.error(res, 'Select at least one day for weekly recurrence', 400);
      }
      await ClientRequest.update(requestId, orgId, {
        ...(title !== undefined && { title: title.trim() }),
        ...(task_type !== undefined && { task_type: task_type.trim() || 'General' }),
        ...(description !== undefined && { description }),
        ...(priority !== undefined && { priority }),
        ...(due_time !== undefined && { due_time }),
        ...(recurrence_end_date !== undefined && { recurrence_end_date }),
        ...(assigned_to !== undefined && { assigned_to: assigned_to || null }),
        ...(recurrence !== undefined && { recurrence }),
        ...(recurrence_days !== undefined && { recurrence_days: recurrence_days || null })
      });
      if (recurrence !== undefined || recurrence_days !== undefined) {
        await ClientRequest.deleteFutureOpenInstances(requestId);
      }
      try { const io = getIO(); io.emit('queue:new_request', {}); io.of('/portal').emit('queue:new_request', {}); } catch (_) {}
      return ApiResponse.success(res, {}, 'Request updated');
    } catch (err) {
      console.error('ClientRequest update error:', err);
      return ApiResponse.error(res, err.message || 'Failed to update');
    }
  }

  static async cancelInstance(req, res) {
    try {
      const instanceId = parseInt(req.params.id);
      await ClientRequest.cancelInstance(instanceId, req.user.organization_id);
      try { const io = getIO(); io.emit('queue:updated', { cancelled: instanceId }); io.of('/portal').emit('queue:updated', { cancelled: instanceId }); } catch (_) {}
      return ApiResponse.success(res, {}, 'Request cancelled');
    } catch (err) {
      console.error('ClientRequest cancelInstance error:', err);
      return ApiResponse.error(res, err.message || 'Failed to cancel', 400);
    }
  }

  static async uncancelInstance(req, res) {
    try {
      const instanceId = parseInt(req.params.id);
      const instance = await ClientRequest.getInstanceById(instanceId);
      if (!instance || instance.org_id !== req.user.organization_id)
        return ApiResponse.error(res, 'Not found', 404);
      if (instance.created_by !== req.user.id)
        return ApiResponse.error(res, 'Only the request creator can restore it', 403);
      await ClientRequest.uncancelInstance(instanceId);
      const updated = await ClientRequest.getInstanceById(instanceId);
      try { const io = getIO(); io.emit('queue:updated', { instance: updated }); io.of('/portal').emit('queue:updated', { instance: updated }); } catch (_) {}
      return ApiResponse.success(res, { instance: updated }, 'Request restored to open');
    } catch (err) {
      console.error('ClientRequest uncancelInstance error:', err);
      return ApiResponse.error(res, err.message || 'Failed to restore', 400);
    }
  }

  static async getBadgeCount(req, res) {
    try {
      const isSales = req.user.role_name === 'CLIENT_SALES';
      const count = await ClientRequest.getOpenCountForOrg(req.user.organization_id, req.user.id, isSales);
      return ApiResponse.success(res, { count });
    } catch (err) {
      return ApiResponse.error(res, 'Failed');
    }
  }

  static async getTaskTypes(req, res) {
    try {
      const types = await ClientRequest.getTaskTypes(req.user.organization_id);
      return ApiResponse.success(res, { types });
    } catch (err) {
      return ApiResponse.error(res, 'Failed to load task types');
    }
  }

  static async getDetail(req, res) {
    try {
      const instanceId = parseInt(req.params.id);
      const instance = await ClientRequest.getInstanceById(instanceId);
      if (!instance) return ApiResponse.error(res, 'Not found', 404);
      if (instance.org_id !== req.user.organization_id) return ApiResponse.error(res, 'Not authorized', 403);
      const [history, comments, attachments] = await Promise.all([
        ClientRequest.getReleaseHistory(instanceId),
        ClientRequest.getComments(instanceId),
        ClientRequest.getAttachments(instance.request_id, instanceId)
      ]);
      return ApiResponse.success(res, { instance, history, comments, attachments });
    } catch (err) {
      console.error('ClientRequest getDetail error:', err);
      return ApiResponse.error(res, 'Failed to load detail');
    }
  }

  static async uploadAttachment(req, res) {
    try {
      const requestId = parseInt(req.params.id);
      if (!req.file) return ApiResponse.error(res, 'No file provided', 400);
      const request = await ClientRequest.getRequestById(requestId);
      if (!request || request.org_id !== req.user.organization_id)
        return ApiResponse.error(res, 'Not found', 404);
      const driveFile = await GoogleDriveService.uploadRequestAttachment(req.file);
      await ClientRequest.addAttachment({
        request_id: requestId,
        instance_id: null,
        uploaded_by: req.user.id,
        file_name: req.file.originalname,
        mime_type: req.file.mimetype,
        drive_file_id: driveFile.id,
        drive_view_link: driveFile.webViewLink || null,
        file_size: req.file.size
      });
      return ApiResponse.success(res, { file_name: req.file.originalname, drive_view_link: driveFile.webViewLink });
    } catch (err) {
      console.error('ClientRequest uploadAttachment error:', err);
      return ApiResponse.error(res, 'Upload failed');
    }
  }

  static async addComment(req, res) {
    try {
      const instanceId = parseInt(req.params.id);
      const instance = await ClientRequest.getInstanceById(instanceId);
      if (!instance || instance.org_id !== req.user.organization_id)
        return ApiResponse.error(res, 'Not found or not authorized', 404);
      const { body } = req.body;
      if (!body || !body.trim()) return ApiResponse.error(res, 'Comment cannot be empty', 400);
      const [comment, ctx] = await Promise.all([
        ClientRequest.addComment(instanceId, req.user.id, body.trim()),
        ClientRequest.getInstanceContext(instanceId)
      ]);
      if (ctx) {
        try {
          const io = getIO();
          const payload = {
            instance_id: instanceId,
            instance_date: ctx.instance_date,
            title: ctx.title,
            body: body.trim(),
            commenter_name: req.user.name,
            commenter_role: req.user.role_name
          };
          if (ctx.picked_by) {
            io.to(`user:${ctx.picked_by}`).emit('request:comment', payload);
          } else {
            io.to('admins').emit('request:comment', payload);
          }
        } catch (_) {}
      }
      return ApiResponse.success(res, { comment });
    } catch (err) {
      console.error('ClientRequest addComment error:', err);
      return ApiResponse.error(res, 'Failed to add comment');
    }
  }

  static async serveAttachment(req, res) {
    try {
      const db = require('../../config/db');
      const attachmentId = parseInt(req.params.attachmentId);
      const [rows] = await db.query('SELECT * FROM client_request_attachments WHERE id = ?', [attachmentId]);
      if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
      const att = rows[0];
      res.setHeader('Content-Disposition', `inline; filename="${att.file_name}"`);
      res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
      if (att.drive_file_id) {
        try {
          const { stream } = await GoogleDriveService.downloadFile(att.drive_file_id);
          stream.on('error', (e) => { console.error('Portal request attachment stream error:', e.message); if (!res.headersSent) res.status(500).end(); });
          return stream.pipe(res);
        } catch (e) {
          console.error('Portal request attachment Drive error:', att.drive_file_id, e.message);
          return res.status(502).json({ success: false, message: 'File unavailable' });
        }
      }
      return res.status(404).json({ success: false, message: 'Not found' });
    } catch (err) {
      console.error('Portal serveAttachment error:', err);
      return ApiResponse.error(res, 'Failed to serve file');
    }
  }
}

module.exports = ClientRequestController;
