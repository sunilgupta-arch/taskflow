const AuthService = require('../services/authService');
const { ApiResponse } = require('../utils/response');
const db = require('../config/db');
const { getToday, getEffectiveWorkDate } = require('../utils/timezone');

class AuthController {
  static showLogin(req, res) {
    if (req.cookies?.token) return res.redirect('/tasks');
    res.render('auth/login', { title: 'Login - TaskFlow', layout: false });
  }

  static async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
      }

      const { token, user } = await AuthService.login(email, password);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 12 * 60 * 60 * 1000 // 12 hours
      });

      // CLIENT_USER and LOCAL_USER go to tasks list; admins/managers go to task board
      const redirectUrl = ['LOCAL_USER', 'CLIENT_USER'].includes(user.role_name) ? '/tasks' : '/tasks/board';
      return ApiResponse.success(res, { user, redirectUrl }, 'Login successful');
    } catch (err) {
      return res.status(401).json({ success: false, message: err.message });
    }
  }

  static async logout(req, res) {
    try {
      if (req.user?.id) {
        const reason = req.body?.logout_reason || req.query?.reason || null;
        await AuthService.recordLogout(req.user.id, req.user.org_timezone || 'America/New_York', reason, req.user.shift_start, req.user.shift_hours);
      }
    } catch (e) {}

    res.clearCookie('token');
    if (req.method === 'POST') {
      return res.json({ success: true, redirect: '/auth/login' });
    }
    res.redirect('/auth/login');
  }

  static getProfile(req, res) {
    return ApiResponse.success(res, { user: req.user });
  }

  static async checkLateLogin(req, res) {
    try {
      const tz = req.user.org_timezone || 'America/New_York';
      const today = getEffectiveWorkDate(tz, req.user.shift_start, req.user.shift_hours);
      // Check only the first session of the day (earliest login)
      const [[attendance]] = await db.query(
        `SELECT login_time, late_login_reason FROM attendance_logs WHERE user_id = ? AND date = ? ORDER BY login_time ASC LIMIT 1`,
        [req.user.id, today]
      );
      if (!attendance) return ApiResponse.success(res, { needsReason: false });

      const shiftStart = req.user.shift_start;
      const shiftHours = parseFloat(req.user.shift_hours || 0);
      if (!shiftStart || !shiftHours) return ApiResponse.success(res, { needsReason: false });

      // Already provided reason
      if (attendance.late_login_reason) return ApiResponse.success(res, { needsReason: false });

      // Check if login was after shift start
      const loginTime = new Date(attendance.login_time);
      const [sh, sm] = shiftStart.split(':').map(Number);
      const shiftStartDate = new Date(loginTime);
      shiftStartDate.setHours(sh, sm || 0, 0, 0);

      // Grace period: 5 minutes
      const graceMs = 5 * 60 * 1000;
      if (loginTime.getTime() > shiftStartDate.getTime() + graceMs) {
        const lateByMin = Math.round((loginTime.getTime() - shiftStartDate.getTime()) / 60000);
        return ApiResponse.success(res, { needsReason: true, lateByMinutes: lateByMin });
      }

      return ApiResponse.success(res, { needsReason: false });
    } catch (err) {
      return ApiResponse.success(res, { needsReason: false });
    }
  }

  static async submitLateReason(req, res) {
    try {
      const { reason } = req.body;
      if (!reason || !reason.trim()) {
        return ApiResponse.error(res, 'Reason is required', 400);
      }
      const tz = req.user.org_timezone || 'America/New_York';
      const today = getEffectiveWorkDate(tz, req.user.shift_start, req.user.shift_hours);
      // Update only the first session of the day
      await db.query(
        `UPDATE attendance_logs SET late_login_reason = ? WHERE user_id = ? AND date = ? AND late_login_reason IS NULL ORDER BY login_time ASC LIMIT 1`,
        [reason.trim(), req.user.id, today]
      );
      return ApiResponse.success(res, {}, 'Reason saved');
    } catch (err) {
      return ApiResponse.error(res, 'Failed to save reason');
    }
  }
}

module.exports = AuthController;
