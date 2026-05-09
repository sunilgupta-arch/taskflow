const jwt = require('jsonwebtoken');
const UserModel = require('../models/User');
const db = require('../config/db');
const { getToday, getEffectiveWorkDate } = require('../utils/timezone');
const ChatModel = require('../models/Chat');

class AuthService {
  static generateToken(user, expiresIn = null) {
    return jwt.sign(
      { id: user.id, email: user.email, role: user.role_name },
      process.env.JWT_SECRET,
      { expiresIn: expiresIn || process.env.JWT_EXPIRES_IN || '12h' }
    );
  }

  static async login(email, password) {
    const user = await UserModel.findByEmail(email);
    if (!user) throw new Error('Invalid credentials');
    if (!user.is_active) throw new Error('Account is deactivated');

    const valid = await UserModel.verifyPassword(password, user.password);
    if (!valid) throw new Error('Invalid credentials');

    // Record attendance (skip for CLIENT roles — no attendance tracking)
    if (!user.role_name.startsWith('CLIENT_')) {
      await this.recordAttendance(user.id, user.org_timezone || 'America/New_York', user.shift_start, user.shift_hours);
    }

    const token = this.generateToken(user);

    // Remove password from response
    const { password: _, ...userData } = user;
    return { token, user: userData };
  }

  static async loginWithGoogle(email, googleId) {
    const user = await UserModel.findByEmail(email);
    if (!user) throw new Error('not_registered');
    if (!user.is_active) throw new Error('inactive');

    if (googleId && !user.google_id) {
      await db.query('UPDATE users SET google_id = ? WHERE id = ?', [googleId, user.id]);
    }

    if (!user.role_name.startsWith('CLIENT_')) {
      await this.recordAttendance(user.id, user.org_timezone || 'America/New_York', user.shift_start, user.shift_hours);
    }

    const isClient = user.role_name.startsWith('CLIENT_');
    const token = this.generateToken(user, isClient ? '365d' : null);
    const { password: _, ...userData } = user;
    return { token, user: userData, persistent: isClient };
  }

  static async recordAttendance(userId, timezone = 'America/New_York', shiftStart = null, shiftHours = null) {
    const today = getEffectiveWorkDate(timezone, shiftStart, shiftHours);

    // Check if any session exists for today (to detect first login)
    const [allSessions] = await db.query(
      `SELECT id, logout_time FROM attendance_logs WHERE user_id = ? AND date = ?`, [userId, today]
    );

    const hasOpenSession = allSessions.some(s => !s.logout_time);
    const isFirstLogin = allSessions.length === 0;

    if (!hasOpenSession) {
      // Create new session row (allows multiple sessions per day)
      await db.query(
        `INSERT INTO attendance_logs (user_id, login_time, date) VALUES (?, NOW(), ?)`,
        [userId, today]
      );
    }

    // Send welcome greeting on first login of the day
    if (isFirstLogin) {
      try {
        const [[userInfo]] = await db.query('SELECT name FROM users WHERE id = ?', [userId]);
        const firstName = userInfo ? userInfo.name.split(' ')[0] : 'there';
        const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const greetings = [
          `Good day, ${firstName}! Happy ${dayName} — let's make it productive!`,
          `Welcome back, ${firstName}! Wishing you a great ${dayName}.`,
          `Hi ${firstName}! Ready to crush it this ${dayName}?`,
          `Hello ${firstName}! ${dayName} is here — let's get things done!`,
          `Hey ${firstName}! Great to see you. Have a wonderful ${dayName}!`
        ];
        const msg = greetings[Math.floor(Math.random() * greetings.length)];
        await ChatModel.sendSystemMessage(userId, msg);
      } catch (e) {
        // Non-critical — don't block login if greeting fails
      }
    }
  }

  static async recordLogout(userId, timezone = 'America/New_York', reason = null, shiftStart = null, shiftHours = null) {
    const today = getEffectiveWorkDate(timezone, shiftStart, shiftHours);
    await db.query(
      `UPDATE attendance_logs SET logout_time = NOW(), logout_reason = ?
       WHERE user_id = ? AND date = ? AND logout_time IS NULL`,
      [reason, userId, today]
    );
  }
}

module.exports = AuthService;
