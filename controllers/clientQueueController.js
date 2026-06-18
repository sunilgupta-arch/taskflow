const ClientRequest = require('../models/ClientRequest');
const { ApiResponse } = require('../utils/response');
const { getIO } = require('../config/socket');
const GoogleDriveService = require('../services/googleDriveService');
const EmailService = require('../services/emailService');
const { getOnlineClientIds } = require('../portal/socket/portalSocket');

function isValidDate(str) {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(Date.parse(str));
}

class ClientQueueController {

  static async index(req, res) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dateStr = (req.query.date && isValidDate(req.query.date)) ? req.query.date : today;
      const { instances, cancelledInstances, stats } = await ClientRequest.getQueueForDate(dateStr);
      const localUsers = await ClientRequest.getLocalUsers();

      res.render('queue/index', {
        title: 'Client Queue',
        layout: 'layouts/main',
        instances,
        cancelledInstances,
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
      const dateStr = (req.query.date && isValidDate(req.query.date)) ? req.query.date : today;
      const { instances, cancelledInstances, stats } = await ClientRequest.getQueueForDate(dateStr);
      return ApiResponse.success(res, { instances, cancelledInstances, stats, date: dateStr });
    } catch (err) {
      console.error('ClientQueue getQueue error:', err);
      return ApiResponse.error(res, 'Failed to load queue');
    }
  }

  static async pick(req, res) {
    try {
      const instanceId = parseInt(req.params.id);

      // Re-picking a rejected task requires admin or manager
      const [[cur]] = await (require('../config/db')).query(
        'SELECT status FROM client_request_instances WHERE id = ?', [instanceId]
      );
      if (cur && cur.status === 'rejected') {
        const role = req.user.role_name || '';
        if (!['LOCAL_ADMIN', 'LOCAL_MANAGER'].includes(role)) {
          return ApiResponse.error(res, 'Only admins and managers can re-pick a rejected task', 403);
        }
      }

      await ClientRequest.pick(instanceId, req.user.id);
      const instance = await ClientRequest.getInstanceById(instanceId);
      try {
        const io = getIO();
        io.emit('queue:updated', { instance });
        io.of('/portal').emit('queue:updated', { instance });

        // Clear the client_request_new notification for all managers/admins
        const Notification = require('../models/Notification');
        const db2 = require('../config/db');
        const [[inst]] = await db2.query('SELECT request_id FROM client_request_instances WHERE id = ?', [instanceId]);
        if (inst && inst.request_id) {
          const [managers] = await db2.query(
            `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id
             WHERE r.name IN ('LOCAL_ADMIN','LOCAL_MANAGER') AND u.is_active = 1`
          );
          const mgrIds = managers.map(m => m.id);
          await Notification.clearByRef(mgrIds, 'client_request', inst.request_id);
          mgrIds.forEach(uid => io.to(`user:${uid}`).emit('notification:cleared', { ref_type: 'client_request', ref_id: inst.request_id }));
        }

        // Notify the portal user (request creator) that their request was picked up
        if (instance && instance.created_by) {
          const nTitle = 'Request Picked Up';
          const nBody = `"${(instance.title || '').substring(0, 55)}" is now being handled by ${req.user.name}`;
          const nLink = '/portal/requests';
          const nid = await Notification.createIfNotExists(instance.created_by, 'portal_req_picked', nTitle, nBody, nLink, 'client_request_instance', instanceId);
          io.of('/portal').to(`portal:user:${instance.created_by}`).emit('notification:new', {
            id: nid, type: 'portal_req_picked', title: nTitle, body: nBody,
            link: nLink, ref_type: 'client_request_instance', ref_id: instanceId,
            is_read: 0, created_at: new Date()
          });
        }
      } catch (_) {}
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

      const [[cur]] = await (require('../config/db')).query(
        'SELECT picked_by FROM client_request_instances WHERE id = ?', [instanceId]
      );
      const role = req.user.role_name || '';
      const isAdmin = ['LOCAL_ADMIN', 'LOCAL_MANAGER'].includes(role);
      if (cur && cur.picked_by !== req.user.id && !isAdmin) {
        return ApiResponse.error(res, 'You can only release tasks you picked', 403);
      }

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
      const { remark } = req.body;
      const trimmedRemark = (remark || '').trim();
      if (!trimmedRemark) {
        const existingComments = await ClientRequest.getComments(instanceId);
        if (!existingComments.length) return ApiResponse.error(res, 'A completion remark is required', 400);
      }
      await ClientRequest.complete(instanceId, req.user.id);
      if (trimmedRemark) await ClientRequest.addComment(instanceId, req.user.id, trimmedRemark);
      const instance = await ClientRequest.getInstanceById(instanceId);
      try {
        const io = getIO();
        io.emit('queue:updated', { instance });
        io.of('/portal').emit('queue:updated', { instance });

        // Notify portal user: clear the "picked" notification, create a "done" notification
        if (instance && instance.created_by) {
          const Notification = require('../models/Notification');
          await Notification.clearByRef([instance.created_by], 'client_request_instance', instanceId);
          io.of('/portal').to(`portal:user:${instance.created_by}`).emit('notification:cleared', { ref_type: 'client_request_instance', ref_id: instanceId });
          const nTitle = 'Request Completed';
          const nBody = `"${(instance.title || '').substring(0, 55)}" has been completed by ${req.user.name}`;
          const nLink = '/portal/requests';
          const nid = await Notification.create(instance.created_by, 'portal_req_done', nTitle, nBody, nLink, 'client_request_instance', instanceId);
          io.of('/portal').to(`portal:user:${instance.created_by}`).emit('notification:new', {
            id: nid, type: 'portal_req_done', title: nTitle, body: nBody,
            link: nLink, ref_type: 'client_request_instance', ref_id: instanceId,
            is_read: 0, created_at: new Date()
          });
        }
      } catch (_) {}
      return ApiResponse.success(res, { instance });
    } catch (err) {
      console.error('ClientQueue complete error:', err);
      return ApiResponse.error(res, err.message || 'Failed to complete task', 400);
    }
  }

  static async reschedule(req, res) {
    try {
      const instanceId = parseInt(req.params.id);
      const { new_date, reason, assigned_to } = req.body;
      if (!new_date || !isValidDate(new_date)) return ApiResponse.error(res, 'A valid date is required (YYYY-MM-DD)', 400);
      if (!reason || !reason.trim()) return ApiResponse.error(res, 'A reason for rescheduling is required', 400);
      const today = new Date().toISOString().split('T')[0];
      if (new_date <= today) return ApiResponse.error(res, 'Reschedule date must be in the future', 400);
      const assignedTo = assigned_to ? parseInt(assigned_to) || null : null;
      await ClientRequest.rescheduleInstance(instanceId, req.user.id, new_date, reason.trim(), assignedTo);
      const instance = await ClientRequest.getInstanceById(instanceId);
      try { const io = getIO(); io.emit('queue:updated', { instance }); io.of('/portal').emit('queue:updated', { instance }); } catch (_) {}

      // Email the creator if they have a 123cfc.com workspace address
      if (instance && instance.creator_email && instance.creator_email.endsWith('@123cfc.com')) {
        EmailService.send({
          to: instance.creator_email,
          templateName: 'requestRescheduled',
          templateData: {
            creatorName: instance.created_by_name || 'there',
            requestTitle: instance.title,
            newDate: new_date,
            rescheduledBy: req.user.name,
            reason: reason.trim()
          }
        });
      }

      // Notify portal user that their request was rescheduled
      if (instance && instance.created_by) {
        try {
          const Notification = require('../models/Notification');
          const io2 = getIO();
          const nTitle = 'Request Rescheduled';
          const nBody = `"${(instance.title || '').substring(0, 50)}" moved to ${new_date} — ${reason.trim().substring(0, 40)}`;
          const nLink = '/portal/requests';
          const nid = await Notification.createIfNotExists(instance.created_by, 'portal_req_rescheduled', nTitle, nBody, nLink, 'client_request_instance', instanceId);
          io2.of('/portal').to(`portal:user:${instance.created_by}`).emit('notification:new', {
            id: nid, type: 'portal_req_rescheduled', title: nTitle, body: nBody,
            link: nLink, ref_type: 'client_request_instance', ref_id: instanceId,
            is_read: 0, created_at: new Date()
          });
        } catch (_) {}
      }

      return ApiResponse.success(res, { instance }, 'Request rescheduled');
    } catch (err) {
      console.error('ClientQueue reschedule error:', err);
      return ApiResponse.error(res, err.message || 'Failed to reschedule', 400);
    }
  }

  static async uncancel(req, res) {
    try {
      const instanceId = parseInt(req.params.id);
      await ClientRequest.uncancelInstance(instanceId, req.user.id);
      const instance = await ClientRequest.getInstanceById(instanceId);
      try { const io = getIO(); io.emit('queue:updated', { instance }); io.of('/portal').emit('queue:updated', { instance }); } catch (_) {}
      return ApiResponse.success(res, { instance }, 'Request restored to open');
    } catch (err) {
      console.error('ClientQueue uncancel error:', err);
      return ApiResponse.error(res, err.message || 'Failed to restore request', 400);
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

  static getOnlineClients(req, res) {
    return ApiResponse.success(res, { online: getOnlineClientIds() });
  }

  static async getAvailableMonths(req, res) {
    try {
      const months = await ClientRequest.getAvailableMonths();
      return ApiResponse.success(res, { months });
    } catch (err) {
      return ApiResponse.error(res, 'Failed to load months');
    }
  }

  static async sendMonthlyReport(req, res) {
    try {
      const { year_month } = req.body;
      if (!year_month || !/^\d{4}-\d{2}$/.test(year_month)) {
        return ApiResponse.error(res, 'Invalid month format', 400);
      }
      if (!req.user.email) {
        return ApiResponse.error(res, 'Your account has no email address configured', 400);
      }
      const { stats, requests, employees } = await ClientRequest.getMonthlyReport(year_month);
      if (!stats.total && !stats.cancelled && !stats.rescheduled && !requests.length) {
        return ApiResponse.error(res, 'No data found for the selected month', 404);
      }
      await EmailService.send({
        to: req.user.email,
        templateName: 'monthlyRequestsReport',
        templateData: { yearMonth: year_month, stats, requests, employees }
      });
      return ApiResponse.success(res, null, `Monthly report sent to ${req.user.email}`);
    } catch (err) {
      return ApiResponse.error(res, 'Failed to send report');
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

          // Also create a portal notification for the comment
          const Notification = require('../models/Notification');
          const nTitle = 'New Comment on Request';
          const nBody = `${req.user.name}: "${body.trim().substring(0, 55)}"`;
          const nLink = '/portal/requests';
          const nid = await Notification.createIfNotExists(ctx.created_by, 'portal_req_comment', nTitle, nBody, nLink, 'client_request_instance', instanceId);
          io.of('/portal').to(`portal:user:${ctx.created_by}`).emit('notification:new', {
            id: nid, type: 'portal_req_comment', title: nTitle, body: nBody,
            link: nLink, ref_type: 'client_request_instance', ref_id: instanceId,
            is_read: 0, created_at: new Date()
          });
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

  static async sendChatMessage(req, res) {
    try {
      const instanceId = parseInt(req.params.id);
      const body = (req.body.body || '').trim();
      const files = req.files || [];
      if (!body && !files.length) return ApiResponse.error(res, 'Message cannot be empty', 400);

      const [comment, ctx] = await Promise.all([
        ClientRequest.addComment(instanceId, req.user.id, body),
        ClientRequest.getInstanceContext(instanceId)
      ]);

      if (files.length) {
        const fileRows = [];
        for (const file of files) {
          const driveFile = await GoogleDriveService.uploadRequestAttachment(file);
          fileRows.push({
            uploaded_by: req.user.id,
            file_name: file.originalname,
            mime_type: file.mimetype,
            drive_file_id: driveFile.id,
            drive_view_link: driveFile.webViewLink || null,
            file_size: file.size
          });
        }
        await ClientRequest.addCommentFiles(comment.id, fileRows);
      }

      if (ctx) {
        try {
          const io = getIO();
          const notifBody = body || `${files.length} file${files.length > 1 ? 's' : ''} shared`;
          const payload = {
            instance_id: instanceId, instance_date: ctx.instance_date,
            title: ctx.title, body: notifBody,
            commenter_name: req.user.name, commenter_role: req.user.role_name
          };
          io.of('/portal').to(`portal:user:${ctx.created_by}`).emit('request:comment', payload);
          const Notification = require('../models/Notification');
          const nTitle = 'New Message on Request';
          const nBody = `${req.user.name}: "${notifBody.substring(0, 55)}"`;
          const nLink = '/portal/requests';
          const nid = await Notification.createIfNotExists(ctx.created_by, 'portal_req_comment', nTitle, nBody, nLink, 'client_request_instance', instanceId);
          io.of('/portal').to(`portal:user:${ctx.created_by}`).emit('notification:new', {
            id: nid, type: 'portal_req_comment', title: nTitle, body: nBody,
            link: nLink, ref_type: 'client_request_instance', ref_id: instanceId,
            is_read: 0, created_at: new Date()
          });
        } catch (_) {}
      }
      return ApiResponse.success(res, { comment });
    } catch (err) {
      console.error('sendChatMessage error:', err);
      return ApiResponse.error(res, 'Server error');
    }
  }

  static async serveChatFile(req, res) {
    try {
      const fileId = parseInt(req.params.fileId);
      const file = await ClientRequest.getChatFile(fileId);
      if (!file) return res.status(404).json({ success: false, message: 'Not found' });
      if (!file.drive_file_id) return res.status(404).json({ success: false, message: 'File unavailable' });
      const { stream, mimeType } = await GoogleDriveService.downloadFile(file.drive_file_id);
      res.setHeader('Content-Type', mimeType || file.mime_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${file.file_name}"`);
      stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
      stream.pipe(res);
    } catch (err) {
      console.error('serveChatFile error:', err);
      if (!res.headersSent) res.status(500).end();
    }
  }

  static async getFilterOptions(req, res) {
    try {
      const [clients, localUsers] = await Promise.all([
        ClientRequest.getPortalClients(),
        ClientRequest.getLocalUsers(),
      ]);
      return ApiResponse.success(res, { clients, localUsers });
    } catch (err) {
      console.error('Queue getFilterOptions error:', err);
      return ApiResponse.error(res, 'Failed to load filter options');
    }
  }

  static async searchFilter(req, res) {
    try {
      const clientId  = req.query.client_id  ? parseInt(req.query.client_id)  : null;
      const pickedBy  = req.query.picked_by  ? parseInt(req.query.picked_by)  : null;
      const q         = (req.query.q || '').trim().substring(0, 200) || null;
      const page      = Math.max(1, parseInt(req.query.page) || 1);
      const result    = await ClientRequest.searchFilter({ clientId, pickedBy, q, page, limit: 20 });
      return ApiResponse.success(res, result);
    } catch (err) {
      console.error('Queue searchFilter error:', err);
      return ApiResponse.error(res, 'Search failed');
    }
  }

  static async exportFilter(req, res) {
    try {
      const clientId = req.query.client_id ? parseInt(req.query.client_id) : null;
      const pickedBy = req.query.picked_by ? parseInt(req.query.picked_by) : null;
      const q        = (req.query.q || '').trim().substring(0, 200) || null;

      const rows = await ClientRequest.searchFilterAll({ clientId, pickedBy, q });

      function csvCell(v) {
        if (v === null || v === undefined) return '';
        const s = String(v).replace(/"/g, '""');
        return /[",\n\r]/.test(s) ? '"' + s + '"' : s;
      }

      const headers = ['Instance ID','Date','Status','Title','Org','Priority','Task Type','Recurrence','Created By','Picked By','Picked At','Completed At','Late','Comments'];
      const lines = [headers.join(',')];
      for (const r of rows) {
        lines.push([
          r.instance_id, r.instance_date, r.status,
          csvCell(r.title), csvCell(r.org_name),
          r.priority, r.task_type, r.recurrence,
          csvCell(r.created_by_name), csvCell(r.picked_by_name),
          r.picked_at || '', r.completed_at || '',
          r.completed_late ? 'Yes' : 'No',
          r.comment_count,
        ].join(','));
      }

      const csv = lines.join('\r\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="queue-export.csv"');
      return res.send(csv);
    } catch (err) {
      console.error('Queue exportFilter error:', err);
      return ApiResponse.error(res, 'Export failed');
    }
  }
}

module.exports = ClientQueueController;
