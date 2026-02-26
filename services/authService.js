const jwt = require('jsonwebtoken');
const UserModel = require('../models/User');
const db = require('../config/db');

class AuthService {
  static generateToken(user) {
    return jwt.sign(
      { id: user.id, email: user.email, role: user.role_name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
  }

  static async login(email, password) {
    const user = await UserModel.findByEmail(email);
    if (!user) throw new Error('Invalid credentials');
    if (!user.is_active) throw new Error('Account is deactivated');

    const valid = await UserModel.verifyPassword(password, user.password);
    if (!valid) throw new Error('Invalid credentials');

    // Record attendance
    await this.recordAttendance(user.id);

    const token = this.generateToken(user);
    
    // Remove password from response
    const { password: _, ...userData } = user;
    return { token, user: userData };
  }

  static async recordAttendance(userId) {
    const today = new Date().toISOString().split('T')[0];
    
    // Check if already logged today
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

  static async recordLogout(userId) {
    const today = new Date().toISOString().split('T')[0];
    await db.query(
      `UPDATE attendance_logs SET logout_time = NOW() 
       WHERE user_id = ? AND date = ? AND logout_time IS NULL`,
      [userId, today]
    );
  }
}

module.exports = AuthService;
