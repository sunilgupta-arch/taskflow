const db = require('../config/db');
const bcrypt = require('bcryptjs');
const ShiftHistory = require('./ShiftHistory');

class UserModel {
  static async findById(id) {
    const [rows] = await db.query(
      `SELECT u.*, r.name as role_name, r.organization_type, o.name as org_name, o.org_type, o.timezone as org_timezone
       FROM users u 
       JOIN roles r ON u.role_id = r.id
       JOIN organizations o ON u.organization_id = o.id
       WHERE u.id = ?`, [id]
    );
    return rows[0] || null;
  }

  static async findByEmail(email) {
    const [rows] = await db.query(
      `SELECT u.*, r.name as role_name, r.organization_type, o.name as org_name, o.org_type, o.timezone as org_timezone
       FROM users u 
       JOIN roles r ON u.role_id = r.id
       JOIN organizations o ON u.organization_id = o.id
       WHERE u.email = ?`, [email]
    );
    return rows[0] || null;
  }

  static async create(data) {
    const hashed = await bcrypt.hash(data.password, 12);
    const shiftStart = data.shift_start || '10:00:00';
    const shiftHours = data.shift_hours || 8.5;
    const [result] = await db.query(
      `INSERT INTO users (organization_id, role_id, name, email, password, weekly_off_day, shift_start, shift_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.organization_id, data.role_id, data.name, data.email, hashed,
       data.weekly_off_day || 'Sunday', shiftStart, shiftHours]
    );

    // Record initial shift in history
    const today = new Date().toISOString().split('T')[0];
    await ShiftHistory.record({
      userId: result.insertId,
      shiftStart,
      shiftHours,
      effectiveDate: today,
      changedBy: data.changed_by || null
    });

    return result.insertId;
  }

  static async update(id, data) {
    const fields = [];
    const values = [];

    const allowedFields = ['name', 'email', 'organization_id', 'role_id', 'weekly_off_day', 'shift_start', 'shift_hours', 'leave_status', 'is_active', 'avatar', 'visible_to_client'];
    allowedFields.forEach(f => {
      if (data[f] !== undefined) {
        fields.push(`${f} = ?`);
        values.push(data[f]);
      }
    });

    if (data.password) {
      fields.push('password = ?');
      values.push(await bcrypt.hash(data.password, 12));
    }

    if (!fields.length) return false;

    // Detect shift changes and record in history
    const shiftChanged = data.shift_start !== undefined || data.shift_hours !== undefined;
    if (shiftChanged) {
      const [current] = await db.query('SELECT shift_start, shift_hours FROM users WHERE id = ?', [id]);
      if (current.length) {
        const newShiftStart = data.shift_start !== undefined ? data.shift_start : current[0].shift_start;
        const newShiftHours = data.shift_hours !== undefined ? data.shift_hours : current[0].shift_hours;
        const oldStart = current[0].shift_start;
        const oldHours = parseFloat(current[0].shift_hours);
        if (newShiftStart !== oldStart || parseFloat(newShiftHours) !== oldHours) {
          const today = new Date().toISOString().split('T')[0];
          await ShiftHistory.record({
            userId: id,
            shiftStart: newShiftStart,
            shiftHours: newShiftHours,
            effectiveDate: today,
            changedBy: data.changed_by || null
          });
        }
      }
    }

    values.push(id);

    const [result] = await db.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values
    );
    return result.affectedRows > 0;
  }

  static async getAll({ org_type, role_id, is_active, search, page = 1, limit = 20 } = {}) {
    let where = [];
    let params = [];

    if (org_type) { where.push('o.org_type = ?'); params.push(org_type); }
    if (role_id) { where.push('u.role_id = ?'); params.push(role_id); }
    if (is_active !== undefined) { where.push('u.is_active = ?'); params.push(is_active); }
    if (search) { where.push('(u.name LIKE ? OR u.email LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email, u.organization_id, u.role_id, u.weekly_off_day, u.shift_start, u.shift_hours, u.leave_status, u.is_active, u.visible_to_client, u.created_at,
              r.name as role_name, o.name as org_name, o.org_type
       FROM users u
       JOIN roles r ON u.role_id = r.id
       JOIN organizations o ON u.organization_id = o.id
       ${whereClause}
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM users u 
       JOIN roles r ON u.role_id = r.id
       JOIN organizations o ON u.organization_id = o.id ${whereClause}`,
      params
    );

    return { rows, total };
  }

  static async verifyPassword(plain, hashed) {
    return bcrypt.compare(plain, hashed);
  }
}

module.exports = UserModel;
