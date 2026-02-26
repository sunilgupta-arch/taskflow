const db = require('../config/db');
const bcrypt = require('bcryptjs');

class UserModel {
  static async findById(id) {
    const [rows] = await db.query(
      `SELECT u.*, r.name as role_name, r.organization_type, o.name as org_name, o.org_type
       FROM users u 
       JOIN roles r ON u.role_id = r.id
       JOIN organizations o ON u.organization_id = o.id
       WHERE u.id = ?`, [id]
    );
    return rows[0] || null;
  }

  static async findByEmail(email) {
    const [rows] = await db.query(
      `SELECT u.*, r.name as role_name, r.organization_type, o.name as org_name, o.org_type
       FROM users u 
       JOIN roles r ON u.role_id = r.id
       JOIN organizations o ON u.organization_id = o.id
       WHERE u.email = ?`, [email]
    );
    return rows[0] || null;
  }

  static async create(data) {
    const hashed = await bcrypt.hash(data.password, 12);
    const [result] = await db.query(
      `INSERT INTO users (organization_id, role_id, name, email, password, weekly_off_day)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.organization_id, data.role_id, data.name, data.email, hashed, data.weekly_off_day || 'Sunday']
    );
    return result.insertId;
  }

  static async update(id, data) {
    const fields = [];
    const values = [];
    
    const allowedFields = ['name', 'email', 'organization_id', 'role_id', 'weekly_off_day', 'leave_status', 'is_active', 'avatar'];
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
      `SELECT u.id, u.name, u.email, u.weekly_off_day, u.leave_status, u.is_active, u.created_at,
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
