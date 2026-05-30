const LeaveRequest = require('../models/LeaveRequest');
const db = require('../config/db');
const { ApiResponse, getPaginationMeta } = require('../utils/response');
const { getIO } = require('../config/socket');
const { getToday } = require('../utils/timezone');
const Notification = require('../models/Notification');

async function getLocalTz() {
  const [[org]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
  return (org && org.timezone) || 'America/New_York';
}

// Returns IDs of all active admins + managers except the given userId
async function getManagerIds(excludeUserId = null) {
  const [rows] = await db.query(
    `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id
     WHERE r.name IN ('LOCAL_ADMIN','LOCAL_MANAGER') AND u.is_active = 1
     ${excludeUserId ? 'AND u.id != ?' : ''}`,
    excludeUserId ? [excludeUserId] : []
  );
  return rows.map(r => r.id);
}

// Emit notification:cleared to each user whose notification was cleared
function emitCleared(io, userIds, refType, refId) {
  userIds.forEach(uid => io.to(`user:${uid}`).emit('notification:cleared', { ref_type: refType, ref_id: refId }));
}

class LeaveController {
  static async index(req, res) {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const role = req.user.role_name;
      const filters = { status, page, limit };
      if (role === 'LOCAL_USER') filters.user_id = req.user.id;

      const { rows, total } = await LeaveRequest.getAll(filters);

      let leaveUsers = [];
      if (['LOCAL_ADMIN', 'LOCAL_MANAGER'].includes(role)) {
        const [users] = await db.query(
          `SELECT u.id, u.name FROM users u JOIN roles r ON u.role_id = r.id
           WHERE u.is_active = 1 AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER') ORDER BY u.name`
        );
        leaveUsers = users;
      }

      res.render('leaves/index', {
        title: 'Leave Management', leaves: rows,
        pagination: getPaginationMeta(total, page, limit),
        filters: { status }, role, leaveUsers
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  static async apply(req, res) {
    try {
      const { from_date, to_date, reason } = req.body;

      if (!from_date || !to_date || !reason || !reason.trim())
        return ApiResponse.error(res, 'From date, to date, and reason are required', 400);
      if (new Date(from_date) > new Date(to_date))
        return ApiResponse.error(res, 'From date cannot be after to date', 400);

      const today = getToday(await getLocalTz());
      if (from_date < today)
        return ApiResponse.error(res, 'Cannot apply for leave in the past', 400);

      if (await LeaveRequest.hasOverlapping(req.user.id, from_date, to_date))
        return ApiResponse.error(res, 'You already have a leave request overlapping these dates', 400);

      const id = await LeaveRequest.create({ user_id: req.user.id, from_date, to_date, reason: reason.trim() });
      const leave = await LeaveRequest.findById(id);

      const io = getIO();
      const managerIds = await getManagerIds(req.user.id);
      const dateRange = from_date === to_date ? from_date : `${from_date} to ${to_date}`;
      const body = `${req.user.name} has requested leave (${dateRange})`;

      // Notify each manager — clears when they approve or reject
      for (const mid of managerIds) {
        const nid = await Notification.create(mid, 'leave_pending', 'Leave Request', body, '/admin/leaves', 'leave_request', id);
        io.to(`user:${mid}`).emit('notification:new', {
          id: nid, type: 'leave_pending', title: 'Leave Request',
          body, link: '/admin/leaves', ref_type: 'leave_request', ref_id: id,
          is_read: 0, created_at: new Date()
        });
      }

      // Legacy socket event for any listeners
      io.to('admins').emit('leave:new', { message: body, leaveId: id, userName: req.user.name });

      return ApiResponse.success(res, leave, 'Leave request submitted', 201);
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async grant(req, res) {
    try {
      const { user_id, from_date, to_date, reason } = req.body;

      if (!user_id || !from_date || !to_date || !reason || !reason.trim())
        return ApiResponse.error(res, 'User, from date, to date, and reason are required', 400);
      if (new Date(from_date) > new Date(to_date))
        return ApiResponse.error(res, 'From date cannot be after to date', 400);
      if (await LeaveRequest.hasOverlapping(user_id, from_date, to_date))
        return ApiResponse.error(res, 'This user already has a leave request overlapping these dates', 400);

      const id = await LeaveRequest.createApproved({ user_id, from_date, to_date, reason: reason.trim(), reviewed_by: req.user.id });

      const io = getIO();
      const grantMsg = `You have been granted leave from ${from_date} to ${to_date}`;
      io.to(`user:${user_id}`).emit('leave:approved', { message: grantMsg, leaveId: id });
      const nid = await Notification.create(user_id, 'leave_approved', 'Leave Granted', grantMsg, '/admin/leaves');
      io.to(`user:${user_id}`).emit('notification:new', { id: nid, type: 'leave_approved', title: 'Leave Granted', body: grantMsg, link: '/admin/leaves', is_read: 0, created_at: new Date() });

      return ApiResponse.success(res, { id }, 'Leave granted successfully', 201);
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async approve(req, res) {
    try {
      const leave = await LeaveRequest.findById(req.params.id);
      if (!leave) return ApiResponse.error(res, 'Leave request not found', 404);
      if (leave.status !== 'pending') return ApiResponse.error(res, 'Only pending requests can be approved', 400);

      const updated = await LeaveRequest.updateStatus(req.params.id, {
        status: 'approved', reviewed_by: req.user.id, review_remark: req.body.review_remark
      });
      if (!updated) return ApiResponse.error(res, 'Failed to approve', 400);

      const io = getIO();

      // Clear the leave_pending notification from all managers' panels
      const managerIds = await getManagerIds();
      const cleared = await Notification.clearByRef(managerIds, 'leave_request', leave.id);
      if (cleared.length) emitCleared(io, managerIds, 'leave_request', leave.id);

      // Notify the user their leave was approved
      const approveMsg = `Your leave (${leave.from_date} to ${leave.to_date}) has been approved`;
      io.to(`user:${leave.user_id}`).emit('leave:approved', { message: approveMsg, leaveId: leave.id });
      const nid = await Notification.create(leave.user_id, 'leave_approved', 'Leave Approved', approveMsg, '/admin/leaves');
      io.to(`user:${leave.user_id}`).emit('notification:new', { id: nid, type: 'leave_approved', title: 'Leave Approved', body: approveMsg, link: '/admin/leaves', is_read: 0, created_at: new Date() });

      return ApiResponse.success(res, {}, 'Leave approved');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async reject(req, res) {
    try {
      const leave = await LeaveRequest.findById(req.params.id);
      if (!leave) return ApiResponse.error(res, 'Leave request not found', 404);
      if (leave.status !== 'pending') return ApiResponse.error(res, 'Only pending requests can be rejected', 400);

      const updated = await LeaveRequest.updateStatus(req.params.id, {
        status: 'rejected', reviewed_by: req.user.id, review_remark: req.body.review_remark
      });
      if (!updated) return ApiResponse.error(res, 'Failed to reject', 400);

      const io = getIO();

      // Clear the leave_pending notification from all managers' panels
      const managerIds = await getManagerIds();
      const cleared = await Notification.clearByRef(managerIds, 'leave_request', leave.id);
      if (cleared.length) emitCleared(io, managerIds, 'leave_request', leave.id);

      // Notify the user their leave was rejected
      const rejectMsg = `Your leave request (${leave.from_date} to ${leave.to_date}) has been rejected`;
      io.to(`user:${leave.user_id}`).emit('leave:rejected', { message: rejectMsg, leaveId: leave.id });
      const nid = await Notification.create(leave.user_id, 'leave_rejected', 'Leave Rejected', rejectMsg, '/admin/leaves');
      io.to(`user:${leave.user_id}`).emit('notification:new', { id: nid, type: 'leave_rejected', title: 'Leave Rejected', body: rejectMsg, link: '/admin/leaves', is_read: 0, created_at: new Date() });

      return ApiResponse.success(res, {}, 'Leave rejected');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }
}

module.exports = LeaveController;
