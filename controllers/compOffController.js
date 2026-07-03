const CompOff = require('../models/CompOff');
const Roster = require('../models/Roster');
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
      const effectiveOff = await Roster.getWeekOffForDate(user.id, today, user.weekly_off_day);

      if (effectiveOff !== dayName) {
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
        // Mark attendance so calendar shows comp_off instead of week-off
        await db.query(
          `INSERT INTO attendance_logs (user_id, date, is_manual, manual_status, manual_remark, updated_by)
           VALUES (?, ?, 1, 'comp_off', 'Worked on off day — earned comp-off', ?)
           ON DUPLICATE KEY UPDATE
             is_manual = 1, manual_status = 'comp_off',
             manual_remark = 'Worked on off day — earned comp-off', updated_by = ?`,
          [userId, today, userId, userId]
        );

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

  static async revokeCredit(req, res) {
    try {
      const creditId = parseInt(req.params.creditId);
      if (!creditId) return ApiResponse.error(res, 'Invalid credit ID', 400);

      const credit = await CompOff.revokeCredit(creditId);
      return ApiResponse.success(res, { credit }, 'Credit revoked — attendance corrected');
    } catch (err) {
      return ApiResponse.error(res, err.message || 'Failed to revoke credit');
    }
  }

  static async cancelCompOff(req, res) {
    try {
      const creditId = parseInt(req.params.creditId);
      const userId   = req.user.id;

      if (!creditId) return ApiResponse.error(res, 'Invalid credit ID', 400);

      const cancelledDate = await CompOff.cancelCredit(creditId, userId);
      const balance = await CompOff.getBalance(userId);

      return ApiResponse.success(res, { balance, cancelledDate }, 'Comp-off cancelled — credit restored');
    } catch (err) {
      return ApiResponse.error(res, err.message || 'Failed to cancel comp-off');
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

  static async getUserHistory(req, res) {
    try {
      const userId = parseInt(req.params.userId);
      const [[user]] = await db.query('SELECT id, name FROM users WHERE id = ? AND is_active = 1', [userId]);
      if (!user) return ApiResponse.error(res, 'User not found', 404);
      const history = await CompOff.getHistory(userId);
      return ApiResponse.success(res, { history, user });
    } catch (err) {
      return ApiResponse.error(res, 'Failed to load history');
    }
  }

  static async _notifyManagers(userId, userName, compOffDate, type) {
    // Comp-off / half-day are informational — no action required from managers.
    // Removed notifications here to avoid inbox noise. Visible in attendance view.
  }
}

module.exports = CompOffController;
