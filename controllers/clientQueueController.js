const ClientRequest = require('../models/ClientRequest');
const { ApiResponse } = require('../utils/response');
const { getIO } = require('../config/socket');
const GoogleDriveService = require('../services/googleDriveService');

class ClientQueueController {

  static async index(req, res) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dateStr = req.query.date || today;
      const instances = await ClientRequest.getQueueForDate(dateStr);
      const stats = await ClientRequest.getDateStats(dateStr);
      const localUsers = await ClientRequest.getLocalUsers();

      res.render('queue/index', {
        title: 'Client Queue',
        layout: 'layouts/main',
        instances,
        stats,
        localUsers,
        selectedDate: dateStr,
        today,
        section: 'queue'
      });
    } catch (err) {
      console.error('ClientQueue index error:', err);
      res.status(500).send('Server error');
    }
  }

  // API: get queue for a date (used by date navigation without full reload)
  static async getQueue(req, res) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dateStr = req.query.date || today;
      const instances = await ClientRequest.getQueueForDate(dateStr);
      const stats = await ClientRequest.getDateStats(dateStr);
      return ApiResponse.success(res, { instances, stats, date: dateStr });
    } catch (err) {
      console.error('ClientQueue getQueue error:', err);
      return ApiResponse.error(res, 'Failed to load queue');
    }
  }

  static async pick(req, res) {
    try {
      const instanceId = parseInt(req.params.id);
      await ClientRequest.pick(instanceId, req.user.id);
      const instance = await ClientRequest.getInstanceById(instanceId);
      try { const io = getIO(); io.emit('queue:updated', { instance }); io.of('/portal').emit('queue:updated', { instance }); } catch (_) {}
      return ApiResponse.success(res, { instance });
    } catch (err) {
      console.error('ClientQueue pick error:', err);
      return ApiResponse.error(res, err.message || 'Failed to pick task', 400);
    }
  }

  static async release(req, res) {
    try {
      const instanceId = parseInt(req.params.id);
      const { reason } = req.body;
      await ClientRequest.release(instanceId, req.user.id, reason);
      const instance = await ClientRequest.getInstanceById(instanceId);
      try { const io = getIO(); io.emit('queue:updated', { instance }); io.of('/portal').emit('queue:updated', { instance }); } catch (_) {}
      return ApiResponse.success(res, { instance });
    } catch (err) {
      console.error('ClientQueue release error:', err);
      return ApiResponse.error(res, err.message || 'Failed to release task', 400);
    }
  }

  static async complete(req, res) {
    try {
      const instanceId = parseInt(req.params.id);
      await ClientRequest.complete(instanceId, req.user.id);
      const instance = await ClientRequest.getInstanceById(instanceId);
      try { const io = getIO(); io.emit('queue:updated', { instance }); io.of('/portal').emit('queue:updated', { instance }); } catch (_) {}
      return ApiResponse.success(res, { instance });
    } catch (err) {
      console.error('ClientQueue complete error:', err);
      return ApiResponse.error(res, err.message || 'Failed to complete task', 400);
    }
  }

  static async getBadgeCount(req, res) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const stats = await ClientRequest.getDateStats(today);
      return ApiResponse.success(res, { count: stats.open || 0 });
    } catch (err) {
      return ApiResponse.error(res, 'Failed');
    }
  }

  static async getDetail(req, res) {
    try {
      const instanceId = parseInt(req.params.id);
      const instance = await ClientRequest.getInstanceById(instanceId);
      if (!instance) return ApiResponse.error(res, 'Not found', 404);
      const [history, comments, attachments] = await Promise.all([
        ClientRequest.getReleaseHistory(instanceId),
        ClientRequest.getComments(instanceId),
        ClientRequest.getAttachments(instance.request_id, instanceId)
      ]);
      return ApiResponse.success(res, { instance, history, comments, attachments });
    } catch (err) {
      console.error('ClientQueue getDetail error:', err);
      return ApiResponse.error(res, 'Failed to load detail');
    }
  }

  static async uploadAttachment(req, res) {
    try {
      const instanceId = parseInt(req.params.id);
      if (!req.file) return ApiResponse.error(res, 'No file provided', 400);
      const instance = await ClientRequest.getInstanceById(instanceId);
      if (!instance) return ApiResponse.error(res, 'Not found', 404);
      const driveFile = await GoogleDriveService.uploadRequestAttachment(req.file);
      await ClientRequest.addAttachment({
        request_id: null,
        instance_id: instanceId,
        uploaded_by: req.user.id,
        file_name: req.file.originalname,
        mime_type: req.file.mimetype,
        drive_file_id: driveFile.id,
        drive_view_link: driveFile.webViewLink || null,
        file_size: req.file.size
      });
      return ApiResponse.success(res, { file_name: req.file.originalname, drive_view_link: driveFile.webViewLink });
    } catch (err) {
      console.error('ClientQueue uploadAttachment error:', err);
      return ApiResponse.error(res, 'Upload failed');
    }
  }

  static async addComment(req, res) {
    try {
      const instanceId = parseInt(req.params.id);
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
          io.of('/portal').to(`portal:user:${ctx.created_by}`).emit('request:comment', payload);
        } catch (_) {}
      }
      return ApiResponse.success(res, { comment });
    } catch (err) {
      console.error('ClientQueue addComment error:', err);
      return ApiResponse.error(res, 'Failed to add comment');
    }
  }
  static async serveAttachment(req, res) {
    try {
      const db = require('../config/db');
      const attachmentId = parseInt(req.params.attachmentId);
      const [rows] = await db.query('SELECT * FROM client_request_attachments WHERE id = ?', [attachmentId]);
      if (!rows.length) return res.status(404).json({ success: false, message: 'Not found' });
      const att = rows[0];
      res.setHeader('Content-Disposition', `inline; filename="${att.file_name}"`);
      res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
      if (att.drive_file_id) {
        try {
          const { stream } = await GoogleDriveService.downloadFile(att.drive_file_id);
          stream.on('error', (e) => { console.error('Queue attachment stream error:', e.message); if (!res.headersSent) res.status(500).end(); });
          return stream.pipe(res);
        } catch (e) {
          console.error('Queue attachment Drive error:', att.drive_file_id, e.message);
          return res.status(502).json({ success: false, message: 'File unavailable' });
        }
      }
      return res.status(404).json({ success: false, message: 'Not found' });
    } catch (err) {
      console.error('Queue serveAttachment error:', err);
      return ApiResponse.error(res, 'Failed to serve file');
    }
  }
}

module.exports = ClientQueueController;
