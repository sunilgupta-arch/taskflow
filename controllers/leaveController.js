const LeaveRequest = require('../models/LeaveRequest');
const db = require('../config/db');
const { ApiResponse, getPaginationMeta } = require('../utils/response');
const { getIO } = require('../config/socket');
const { getToday } = require('../utils/timezone');

class LeaveController {
  static async index(req, res) {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const role = req.user.role_name;

      const filters = { status, page, limit };
      // LOCAL_USER sees only their own leave requests
      if (role === 'LOCAL_USER') {
        filters.user_id = req.user.id;
      }

      const { rows, total } = await LeaveRequest.getAll(filters);

      // For admin/manager: fetch LOCAL_USER + LOCAL_MANAGER users for "Grant Leave" dropdown
      let leaveUsers = [];
      if (['LOCAL_ADMIN', 'LOCAL_MANAGER'].includes(role)) {
        const [users] = await db.query(
          `SELECT u.id, u.name FROM users u
           JOIN roles r ON u.role_id = r.id
           WHERE u.is_active = 1 AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
           ORDER BY u.name`
        );
        leaveUsers = users;
      }

      res.render('leaves/index', {
        title: 'Leave Management',
        leaves: rows,
        pagination: getPaginationMeta(total, page, limit),
        filters: { status },
        role,
        leaveUsers
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  static async apply(req, res) {
    try {
      const { from_date, to_date, reason } = req.body;

      if (!from_date || !to_date || !reason || !reason.trim()) {
        return ApiResponse.error(res, 'From date, to date, and reason are required', 400);
      }

      if (new Date(from_date) > new Date(to_date)) {
        return ApiResponse.error(res, 'From date cannot be after to date', 400);
      }

      const today = getToday(req.user.org_timezone || 'UTC');
      if (from_date < today) {
        return ApiResponse.error(res, 'Cannot apply for leave in the past', 400);
      }

      const hasOverlap = await LeaveRequest.hasOverlapping(req.user.id, from_date, to_date);
      if (hasOverlap) {
        return ApiResponse.error(res, 'You already have a leave request overlapping these dates', 400);
      }

      const id = await LeaveRequest.create({
        user_id: req.user.id,
        from_date,
        to_date,
        reason: reason.trim()
      });

      const leave = await LeaveRequest.findById(id);

      // Notify admins
      const io = getIO();
      io.to('admins').emit('leave:new', {
        message: `${req.user.name} applied for leave (${from_date} to ${to_date})`,
        leaveId: id,
        userName: req.user.name
      });

      return ApiResponse.success(res, leave, 'Leave request submitted', 201);
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async grant(req, res) {
    try {
      const { user_id, from_date, to_date, reason } = req.body;

      if (!user_id || !from_date || !to_date || !reason || !reason.trim()) {
        return ApiResponse.error(res, 'User, from date, to date, and reason are required', 400);
      }

      if (new Date(from_date) > new Date(to_date)) {
        return ApiResponse.error(res, 'From date cannot be after to date', 400);
      }

      const hasOverlap = await LeaveRequest.hasOverlapping(user_id, from_date, to_date);
      if (hasOverlap) {
        return ApiResponse.error(res, 'This user already has a leave request overlapping these dates', 400);
      }

      const id = await LeaveRequest.createApproved({
        user_id,
        from_date,
        to_date,
        reason: reason.trim(),
        reviewed_by: req.user.id
      });

      // Notify the user
      const io = getIO();
      io.to(`user:${user_id}`).emit('leave:approved', {
        message: `You have been granted leave from ${from_date} to ${to_date}`,
        leaveId: id
      });

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
        status: 'approved',
        reviewed_by: req.user.id,
        review_remark: req.body.review_remark
      });

      if (!updated) return ApiResponse.error(res, 'Failed to approve', 400);

      // Notify the user
      const io = getIO();
      io.to(`user:${leave.user_id}`).emit('leave:approved', {
        message: `Your leave request (${leave.from_date} to ${leave.to_date}) has been approved`,
        leaveId: leave.id
      });

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
        status: 'rejected',
        reviewed_by: req.user.id,
        review_remark: req.body.review_remark
      });

      if (!updated) return ApiResponse.error(res, 'Failed to reject', 400);

      // Notify the user
      const io = getIO();
      io.to(`user:${leave.user_id}`).emit('leave:rejected', {
        message: `Your leave request (${leave.from_date} to ${leave.to_date}) has been rejected`,
        leaveId: leave.id
      });

      return ApiResponse.success(res, {}, 'Leave rejected');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }
}

module.exports = LeaveController;
