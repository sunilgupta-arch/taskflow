const CompOff = require('../models/CompOff');
const { ApiResponse } = require('../utils/response');
const { getIO } = require('../config/socket');
const Notification = require('../models/Notification');
const db = require('../config/db');

class CompOffController {

  static async checkToday(req, res) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dayName = new Date(today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
      const user = req.user;

      if (user.weekly_off_day !== dayName) {
        return ApiResponse.success(res, { showModal: false });
      }

      const alreadyDone = await CompOff.hasActionToday(user.id, today);
      return ApiResponse.success(res, { showModal: !alreadyDone, offDay: dayName });
    } catch (err) {
      return ApiResponse.error(res, 'Failed to check');
    }
  }

  static async offDayAction(req, res) {
    try {
      const { action, comp_off_date } = req.body;
      const userId = req.user.id;
      const today = new Date().toISOString().split('T')[0];

      if (!['check_in', 'half_day', 'working'].includes(action)) {
        return ApiResponse.error(res, 'Invalid action', 400);
      }

      const alreadyDone = await CompOff.hasActionToday(userId, today);
      if (alreadyDone) return ApiResponse.error(res, 'Action already recorded for today', 400);

      if (action === 'check_in') {
        await db.query(
          `INSERT INTO attendance_logs (user_id, date, is_manual, manual_status, manual_remark, updated_by)
           VALUES (?, ?, 1, 'check_in', 'Checked in on off day', ?)
           ON DUPLICATE KEY UPDATE
             is_manual = 1, manual_status = 'check_in',
             manual_remark = 'Checked in on off day', updated_by = ?`,
          [userId, today, userId, userId]
        );
      } else if (action === 'half_day') {
        await db.query(
          `INSERT INTO attendance_logs (user_id, date, is_manual, manual_status, manual_remark, updated_by)
           VALUES (?, ?, 1, 'half_day', 'Worked half day on off day', ?)
           ON DUPLICATE KEY UPDATE
             is_manual = 1, manual_status = 'half_day',
             manual_remark = 'Worked half day on off day', updated_by = ?`,
          [userId, today, userId, userId]
        );
        await CompOffController._notifyManagers(userId, req.user.name, null, 'half_day');
      } else {
        await CompOff.earn(userId, today);

        if (comp_off_date && comp_off_date > today) {
          await CompOff.applyCredits(userId, [comp_off_date]);
          await CompOffController._notifyManagers(userId, req.user.name, comp_off_date, 'comp_off');
        }
      }

      const balance = await CompOff.getBalance(userId);
      return ApiResponse.success(res, { balance }, 'Recorded successfully');
    } catch (err) {
      console.error('CompOff offDayAction error:', err);
      return ApiResponse.error(res, err.message || 'Failed to record action');
    }
  }

  static async applyCompOff(req, res) {
    try {
      const { dates } = req.body;
      const userId = req.user.id;
      const today = new Date().toISOString().split('T')[0];

      if (!Array.isArray(dates) || !dates.length) {
        return ApiResponse.error(res, 'No dates provided', 400);
      }
      if (dates.some(d => d <= today)) {
        return ApiResponse.error(res, 'All comp-off dates must be in the future', 400);
      }

      await CompOff.applyCredits(userId, dates);

      for (const date of dates) {
        await CompOffController._notifyManagers(userId, req.user.name, date, 'comp_off');
      }

      const balance = await CompOff.getBalance(userId);
      return ApiResponse.success(res, { balance }, `${dates.length} comp-off day${dates.length > 1 ? 's' : ''} applied`);
    } catch (err) {
      console.error('CompOff applyCompOff error:', err);
      return ApiResponse.error(res, err.message || 'Failed to apply comp-off');
    }
  }

  static async getMyBalance(req, res) {
    try {
      const [balance, history] = await Promise.all([
        CompOff.getBalance(req.user.id),
        CompOff.getHistory(req.user.id)
      ]);
      return ApiResponse.success(res, { balance, history });
    } catch (err) {
      return ApiResponse.error(res, 'Failed to load comp-off data');
    }
  }

  static async getAdminSummary(req, res) {
    try {
      const summary = await CompOff.getAllBalanceSummary();
      return ApiResponse.success(res, { summary });
    } catch (err) {
      return ApiResponse.error(res, 'Failed to load summary');
    }
  }

  static async _notifyManagers(userId, userName, compOffDate, type) {
    try {
      const io = getIO();
      const [managers] = await db.query(
        `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id
         WHERE r.name IN ('LOCAL_ADMIN','LOCAL_MANAGER') AND u.is_active = 1 AND u.id != ?`,
        [userId]
      );

      let title, msg;
      if (type === 'comp_off' && compOffDate) {
        const fmt = new Date(compOffDate + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        title = 'Comp-Off Applied';
        msg   = `${userName} has applied a comp-off on ${fmt}`;
      } else if (type === 'half_day') {
        title = 'Half Day on Off Day';
        msg   = `${userName} is working a half day today (their off day)`;
      } else {
        return;
      }

      for (const mgr of managers) {
        const notifId = await Notification.create(mgr.id, type, title, msg, '/admin/attendance');
        try {
          io.to(`user:${mgr.id}`).emit('notification:new', {
            id: notifId, type, title, body: msg,
            link: '/admin/attendance', is_read: 0, created_at: new Date()
          });
        } catch (_) {}
      }
    } catch (_) {}
  }
}

module.exports = CompOffController;
