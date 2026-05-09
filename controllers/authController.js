const AuthService = require('../services/authService');
const { ApiResponse } = require('../utils/response');
const db = require('../config/db');
const { getToday, getEffectiveWorkDate } = require('../utils/timezone');
const ShiftHistory = require('../models/ShiftHistory');
const crypto = require('crypto');
const logger = require('../utils/logger');

class AuthController {
  static showLogin(req, res) {
    if (req.cookies?.token) return res.redirect('/admin');
    const ts = Math.floor(Date.now() / 1000);
    const rand = crypto.randomBytes(12).toString('hex');
    const sig = crypto.createHmac('sha256', process.env.JWT_SECRET)
      .update(`${rand}:${ts}`)
      .digest('hex');
    const loginToken = `${rand}.${ts}.${sig}`;
    res.render('auth/login', { title: 'Login - TaskFlow', layout: false, loginToken });
  }

  static async login(req, res) {
    try {
      // Verify the request originated from our login page
      const lt = req.body._lt;
      const ltValid = (() => {
        if (!lt || typeof lt !== 'string') return false;
        const parts = lt.split('.');
        if (parts.length !== 3) return false;
        const [rand, ts, sig] = parts;
        const tsNum = parseInt(ts, 10);
        if (isNaN(tsNum) || Math.floor(Date.now() / 1000) - tsNum > 7200) return false;
        const expected = crypto.createHmac('sha256', process.env.JWT_SECRET)
          .update(`${rand}:${ts}`)
          .digest('hex');
        try {
          return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
        } catch { return false; }
      })();

      if (!ltValid) {
        logger.warn('[SECURITY] Login blocked — invalid or missing page token', {
          ip: req.ip,
          email: req.body?.email || '(unknown)',
          ua: req.headers['user-agent'] || '(none)',
        });
        return res.status(403).json({
          success: false,
          message: 'Invalid login request. Please use the login page.'
        });
      }

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

      // Client roles go to portal; all local roles go to new admin hub
      let redirectUrl;
      if (user.role_name.startsWith('CLIENT_')) {
        redirectUrl = '/portal';
      } else {
        redirectUrl = '/admin';
      }
      return ApiResponse.success(res, { user, redirectUrl }, 'Login successful');
    } catch (err) {
      return res.status(401).json({ success: false, message: err.message });
    }
  }

  static googleAuth(req, res) {
    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALLBACK_URL
    );
    const url = oauth2Client.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      prompt: 'select_account'
    });
    res.redirect(url);
  }

  static async googleCallback(req, res) {
    try {
      const { code, error } = req.query;
      if (error || !code) return res.redirect('/auth/login?error=google_cancelled');

      const { google } = require('googleapis');
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_CALLBACK_URL
      );

      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data: googleUser } = await oauth2.userinfo.get();

      const { token, user, persistent } = await AuthService.loginWithGoogle(googleUser.email, googleUser.id);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: persistent ? 365 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000
      });

      const redirectUrl = user.role_name.startsWith('CLIENT_') ? '/portal' : '/admin';
      return res.redirect(redirectUrl);
    } catch (err) {
      const code = ['not_registered', 'inactive'].includes(err.message) ? err.message : 'google_error';
      return res.redirect(`/auth/login?error=${code}`);
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

      // Use the shift that was effective on this date
      const shift = await ShiftHistory.getShiftForDate(req.user.id, today);
      const shiftStart = shift.shift_start;
      const shiftHours = parseFloat(shift.shift_hours || 0);
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
