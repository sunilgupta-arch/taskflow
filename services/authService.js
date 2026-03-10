const jwt = require('jsonwebtoken');
const UserModel = require('../models/User');
const db = require('../config/db');
const { getToday } = require('../utils/timezone');

class AuthService {
  static generateToken(user) {
    return jwt.sign(
      { id: user.id, email: user.email, role: user.role_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    );
  }

  static async login(email, password) {
    const user = await UserModel.findByEmail(email);
    if (!user) throw new Error('Invalid credentials');
    if (!user.is_active) throw new Error('Account is deactivated');

    const valid = await UserModel.verifyPassword(password, user.password);
    if (!valid) throw new Error('Invalid credentials');

    // Record attendance using user's org timezone
    await this.recordAttendance(user.id, user.org_timezone || 'UTC');

    const token = this.generateToken(user);

    // Remove password from response
    const { password: _, ...userData } = user;
    return { token, user: userData };
  }

  static async recordAttendance(userId, timezone = 'UTC') {
    const today = getToday(timezone);

    // Check if already logged today (in user's timezone)
    const [existing] = await db.query(
      `SELECT id FROM attendance_logs WHERE user_id = ? AND date = ?`, [userId, today]
    );

    if (!existing.length) {
      await db.query(
        `INSERT INTO attendance_logs (user_id, login_time, date) VALUES (?, NOW(), ?)`,
        [userId, today]
      );
    }
  }

  static async recordLogout(userId, timezone = 'UTC') {
    const today = getToday(timezone);
    await db.query(
      `UPDATE attendance_logs SET logout_time = NOW()
       WHERE user_id = ? AND date = ? AND logout_time IS NULL`,
      [userId, today]
    );
  }
}

module.exports = AuthService;
