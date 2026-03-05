const db = require('../config/db');

class LeaveRequest {
  static async findById(id) {
    const [rows] = await db.query(
      `SELECT lr.*, u.name as user_name, u.email as user_email,
              rv.name as reviewer_name
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       LEFT JOIN users rv ON lr.reviewed_by = rv.id
       WHERE lr.id = ?`, [id]
    );
    return rows[0] || null;
  }

  static async create({ user_id, from_date, to_date, reason }) {
    const [result] = await db.query(
      'INSERT INTO leave_requests (user_id, from_date, to_date, reason) VALUES (?, ?, ?, ?)',
      [user_id, from_date, to_date, reason]
    );
    return result.insertId;
  }

  static async createApproved({ user_id, from_date, to_date, reason, reviewed_by }) {
    const [result] = await db.query(
      `INSERT INTO leave_requests (user_id, from_date, to_date, reason, status, reviewed_by, reviewed_at)
       VALUES (?, ?, ?, ?, 'approved', ?, NOW())`,
      [user_id, from_date, to_date, reason, reviewed_by]
    );
    return result.insertId;
  }

  static async updateStatus(id, { status, reviewed_by, review_remark }) {
    const [result] = await db.query(
      `UPDATE leave_requests SET status = ?, reviewed_by = ?, review_remark = ?, reviewed_at = NOW()
       WHERE id = ? AND status = 'pending'`,
      [status, reviewed_by, review_remark || null, id]
    );
    return result.affectedRows > 0;
  }

  static async getAll({ user_id, status, page = 1, limit = 20 } = {}) {
    let where = [];
    let params = [];

    if (user_id) { where.push('lr.user_id = ?'); params.push(user_id); }
    if (status) { where.push('lr.status = ?'); params.push(status); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [rows] = await db.query(
      `SELECT lr.*, u.name as user_name, u.email as user_email,
              rv.name as reviewer_name
       FROM leave_requests lr
       JOIN users u ON lr.user_id = u.id
       LEFT JOIN users rv ON lr.reviewed_by = rv.id
       ${whereClause}
       ORDER BY FIELD(lr.status, 'pending', 'approved', 'rejected'), lr.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM leave_requests lr ${whereClause}`, params
    );

    return { rows, total };
  }

  static async hasOverlapping(user_id, from_date, to_date) {
    const [[{ count }]] = await db.query(
      `SELECT COUNT(*) as count FROM leave_requests
       WHERE user_id = ? AND status != 'rejected'
         AND from_date <= ? AND to_date >= ?`,
      [user_id, to_date, from_date]
    );
    return count > 0;
  }

  static async getForRange(startDate, endDate, status = null) {
    let statusFilter = status ? 'AND lr.status = ?' : "AND lr.status IN ('approved', 'pending')";
    let params = [endDate, startDate];
    if (status) params = [endDate, startDate, status];

    const [rows] = await db.query(
      `SELECT lr.user_id, lr.from_date, lr.to_date, lr.status
       FROM leave_requests lr
       WHERE lr.from_date <= ? AND lr.to_date >= ? ${statusFilter}`,
      params
    );
    return rows;
  }
}

module.exports = LeaveRequest;
