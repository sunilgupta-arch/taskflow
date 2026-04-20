const ClientRequest = require('../../models/ClientRequest');
const { ApiResponse } = require('../../utils/response');

class ClientRequestController {

  static async index(req, res) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dateStr = req.query.date || today;
      const orgId = req.user.organization_id;

      // Ensure instances are generated for this date
      await ClientRequest.getQueueForDate(dateStr);

      const [instances, requests, taskTypes, localUsers, stats] = await Promise.all([
        ClientRequest.getInstancesForOrg(orgId, dateStr),
        ClientRequest.getRequestsForOrg(orgId),
        ClientRequest.getTaskTypes(orgId),
        ClientRequest.getLocalUsers(),
        ClientRequest.getDateStats(dateStr)
      ]);

      res.render('portal/requests', {
        title: 'Work Requests',
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
      const [instances, stats] = await Promise.all([
        ClientRequest.getInstancesForOrg(orgId, dateStr),
        ClientRequest.getDateStats(dateStr)
      ]);
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
      if (!start_date) return ApiResponse.error(res, 'Start date is required', 400);

      const id = await ClientRequest.create({
        org_id: req.user.organization_id,
        created_by: req.user.id,
        title: title.trim(),
        task_type: (task_type || 'General').trim(),
        description: description || null,
        priority: priority || 'normal',
        recurrence: recurrence || 'none',
        recurrence_days: recurrence === 'weekly' ? (recurrence_days || null) : null,
        start_date,
        recurrence_end_date: recurrence !== 'none' ? (recurrence_end_date || null) : null,
        due_time: due_time || null,
        assigned_to: assigned_to ? parseInt(assigned_to) : null
      });

      // Immediately generate instance for start_date if it matches today or future
      await ClientRequest.getQueueForDate(start_date);

      const io = req.app.get('io');
      if (io) io.emit('queue:new_request', { id, title: title.trim(), date: start_date });

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
      const [history, comments] = await Promise.all([
        ClientRequest.getReleaseHistory(instanceId),
        ClientRequest.getComments(instanceId)
      ]);
      return ApiResponse.success(res, { instance, history, comments });
    } catch (err) {
      console.error('ClientRequest getDetail error:', err);
      return ApiResponse.error(res, 'Failed to load detail');
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
      const comment = await ClientRequest.addComment(instanceId, req.user.id, body.trim());
      return ApiResponse.success(res, { comment });
    } catch (err) {
      console.error('ClientRequest addComment error:', err);
      return ApiResponse.error(res, 'Failed to add comment');
    }
  }
}

module.exports = ClientRequestController;
