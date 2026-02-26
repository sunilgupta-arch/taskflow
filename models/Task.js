const db = require('../config/db');

class TaskModel {
  static async findById(id) {
    const [rows] = await db.query(
      `SELECT t.*, 
              u1.name as assigned_to_name, u1.email as assigned_to_email,
              u2.name as created_by_name, u2.email as created_by_email
       FROM tasks t
       LEFT JOIN users u1 ON t.assigned_to = u1.id
       LEFT JOIN users u2 ON t.created_by = u2.id
       WHERE t.id = ? AND t.is_deleted = 0`, [id]
    );
    return rows[0] || null;
  }

  static async create(data) {
    const [result] = await db.query(
      `INSERT INTO tasks (title, description, type, assigned_to, created_by, due_date, reward_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.title, data.description, data.type, data.assigned_to || null, data.created_by,
       data.due_date || null, data.reward_amount || null, data.status || 'pending']
    );
    return result.insertId;
  }

  static async update(id, data) {
    const fields = [];
    const values = [];

    const allowed = ['title', 'description', 'type', 'assigned_to', 'due_date', 'reward_amount', 'status', 'completed_at'];
    allowed.forEach(f => {
      if (data[f] !== undefined) {
        fields.push(`${f} = ?`);
        values.push(data[f]);
      }
    });

    if (!fields.length) return false;
    values.push(id);

    const [result] = await db.query(
      `UPDATE tasks SET ${fields.join(', ')} WHERE id = ? AND is_deleted = 0`, values
    );
    return result.affectedRows > 0;
  }

  static async softDelete(id) {
    const [result] = await db.query(
      `UPDATE tasks SET is_deleted = 1 WHERE id = ?`, [id]
    );
    return result.affectedRows > 0;
  }

  static async getAll({ status, type, assigned_to, created_by, search, page = 1, limit = 20, user, role } = {}) {
    let where = ['t.is_deleted = 0'];
    let params = [];

    // Role-based filtering
    if (role === 'OUR_USER' && user) {
      where.push('t.assigned_to = ?');
      params.push(user);
    }

    if (status) { where.push('t.status = ?'); params.push(status); }
    if (type) { where.push('t.type = ?'); params.push(type); }
    if (assigned_to) { where.push('t.assigned_to = ?'); params.push(assigned_to); }
    if (created_by) { where.push('t.created_by = ?'); params.push(created_by); }
    if (search) { where.push('(t.title LIKE ? OR t.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

    const whereClause = `WHERE ${where.join(' AND ')}`;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [rows] = await db.query(
      `SELECT t.*, 
              u1.name as assigned_to_name,
              u2.name as created_by_name,
              (SELECT COUNT(*) FROM task_attachments ta WHERE ta.task_id = t.id) as attachment_count
       FROM tasks t
       LEFT JOIN users u1 ON t.assigned_to = u1.id
       LEFT JOIN users u2 ON t.created_by = u2.id
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM tasks t ${whereClause}`, params
    );

    return { rows, total };
  }

  static async getUnassigned(page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const [rows] = await db.query(
      `SELECT t.*, u.name as created_by_name 
       FROM tasks t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE t.assigned_to IS NULL AND t.is_deleted = 0 AND t.status = 'pending'
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?`,
      [parseInt(limit), parseInt(offset)]
    );
    return rows;
  }

  static async getCompletionStats(period = 'today') {
    let dateFilter;
    switch (period) {
      case 'today': dateFilter = 'DATE(completed_at) = CURDATE()'; break;
      case 'week': dateFilter = 'YEARWEEK(completed_at) = YEARWEEK(NOW())'; break;
      case 'month': dateFilter = 'MONTH(completed_at) = MONTH(NOW()) AND YEAR(completed_at) = YEAR(NOW())'; break;
      case 'year': dateFilter = 'YEAR(completed_at) = YEAR(NOW())'; break;
      default: dateFilter = '1=1';
    }

    const [[stats]] = await db.query(
      `SELECT COUNT(*) as total FROM tasks 
       WHERE status = 'completed' AND is_deleted = 0 AND ${dateFilter}`
    );
    return stats.total;
  }
}

module.exports = TaskModel;
