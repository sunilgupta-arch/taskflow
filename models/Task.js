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
      `INSERT INTO tasks (title, description, type, recurrence_pattern, recurrence_days, deadline_time, recurrence_end_date, assigned_to, created_by, created_by_org, group_id, due_date, reward_amount, status, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.title, data.description, data.type, data.recurrence_pattern || null, data.recurrence_days || null,
       data.deadline_time || null, data.recurrence_end_date || null,
       data.assigned_to || null, data.created_by,
       data.created_by_org || 'CLIENT', data.group_id || null, data.due_date || null, data.reward_amount || null, data.status || 'pending', data.priority || 'medium']
    );
    return result.insertId;
  }

  static async update(id, data) {
    const fields = [];
    const values = [];

    const allowed = ['title', 'description', 'type', 'recurrence_pattern', 'recurrence_days', 'deadline_time', 'recurrence_end_date', 'assigned_to', 'group_id', 'due_date', 'reward_amount', 'status', 'completed_at', 'created_by_org', 'is_deleted', 'priority'];
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

  static async getAll({ status, type, assigned_to, created_by, search, completed_period, schedule, for_date, page = 1, limit = 20, user, role, orgType, todayDate } = {}) {
    let where = ['t.is_deleted = 0'];
    let params = [];
    // Use timezone-aware date passed from controller, fallback to UTC CURDATE()
    const todaySql = todayDate ? '?' : 'CURDATE()';
    const todayParam = todayDate || null;

    // Visibility filtering: CLIENT users should NOT see LOCAL-created tasks
    if (orgType === 'CLIENT') {
      where.push("t.created_by_org = 'CLIENT'");
    }

    // Role-based filtering: LOCAL_USER sees only their own tasks (no grouping)
    if (role === 'LOCAL_USER' && user) {
      where.push('t.assigned_to = ?');
      params.push(user);
    }

    if (status) {
      if (status === 'pending') {
        // "Pending" should include actual pending tasks AND active recurring tasks (shown as "Pending Today")
        where.push("(t.status = 'pending' OR (t.status = 'active' AND t.type = 'recurring'))");
      } else if (status === 'completed') {
        // "Completed" should only match truly completed one-time tasks (not active recurring)
        where.push('t.status = ?'); params.push(status);
      } else {
        where.push('t.status = ?'); params.push(status);
      }
    }
    if (type) { where.push('t.type = ?'); params.push(type); }
    if (assigned_to) { where.push('t.assigned_to = ?'); params.push(assigned_to); }
    if (created_by) { where.push('t.created_by = ?'); params.push(created_by); }
    if (search) { where.push('(t.title LIKE ? OR t.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

    // Completed period filter for dashboard drill-down
    if (completed_period) {
      switch (completed_period) {
        case 'today': where.push(`DATE(t.completed_at) = ${todaySql}`); if (todayParam) params.push(todayParam); break;
        case 'week': where.push(`YEARWEEK(t.completed_at) = YEARWEEK(${todaySql})`); if (todayParam) params.push(todayParam); break;
        case 'month': where.push(`MONTH(t.completed_at) = MONTH(${todaySql}) AND YEAR(t.completed_at) = YEAR(${todaySql})`); if (todayParam) { params.push(todayParam); params.push(todayParam); } break;
        case 'year': where.push(`YEAR(t.completed_at) = YEAR(${todaySql})`); if (todayParam) params.push(todayParam); break;
      }
    }

    // Schedule filter: today / daily / weekly
    if (schedule === 'daily') {
      where.push("t.type = 'recurring' AND t.recurrence_pattern = 'daily'");
    } else if (schedule === 'weekly') {
      where.push("t.type = 'recurring' AND t.recurrence_pattern = 'weekly'");
    } else if (schedule === 'today') {
      // Daily recurring active tasks + weekly recurring scheduled for today's day + one-time tasks due today
      // Exclude users who are on their weekly off today
      where.push(`(
        (t.type = 'recurring' AND t.recurrence_pattern = 'daily' AND t.status = 'active')
        OR (t.type = 'recurring' AND t.recurrence_pattern = 'weekly' AND t.status = 'active'
            AND FIND_IN_SET(DAYOFWEEK(${todaySql}) - 1, t.recurrence_days) > 0)
        OR (t.type = 'once' AND t.due_date = ${todaySql} AND t.status IN ('pending', 'in_progress'))
      )`);
      if (todayParam) { params.push(todayParam); params.push(todayParam); }
      where.push(`(SELECT weekly_off_day FROM users WHERE id = t.assigned_to) != DAYNAME(${todaySql})`);
      if (todayParam) params.push(todayParam);
    }

    // Date filter: show tasks scheduled for a specific date (any day, past/today/future)
    if (for_date) {
      where.push(`(
        (t.type = 'recurring' AND t.recurrence_pattern = 'daily' AND t.status = 'active'
          AND (t.recurrence_end_date IS NULL OR t.recurrence_end_date >= ?))
        OR (t.type = 'recurring' AND t.recurrence_pattern = 'weekly' AND t.status = 'active'
            AND FIND_IN_SET(DAYOFWEEK(?) - 1, t.recurrence_days) > 0
            AND (t.recurrence_end_date IS NULL OR t.recurrence_end_date >= ?))
        OR (t.type = 'recurring' AND t.recurrence_pattern = 'monthly' AND t.status = 'active'
            AND FIND_IN_SET(DAY(?), t.recurrence_days) > 0
            AND (t.recurrence_end_date IS NULL OR t.recurrence_end_date >= ?))
        OR (t.type = 'once' AND t.due_date = ?)
      )`);
      params.push(for_date, for_date, for_date, for_date, for_date, for_date);
      // Exclude employees on weekly off on that day
      where.push(`(t.assigned_to IS NULL OR (SELECT weekly_off_day FROM users WHERE id = t.assigned_to) != DAYNAME(?))`);
      params.push(for_date);
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // For LOCAL_USER: show individual rows (they only see their own tasks)
    if (role === 'LOCAL_USER') {
      const [rows] = await db.query(
        `SELECT t.*,
                u1.name as assigned_to_name,
                u2.name as created_by_name,
                u1.name as assignee_names,
                (SELECT COUNT(*) FROM task_attachments ta WHERE ta.task_id = t.id) as attachment_count,
                (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) as comment_count
         FROM tasks t
         LEFT JOIN users u1 ON t.assigned_to = u1.id
         LEFT JOIN users u2 ON t.created_by = u2.id
         ${whereClause}
         ORDER BY FIELD(t.status, 'in_progress', 'pending', 'active', 'completed', 'deactivated'), FIELD(t.priority, 'urgent', 'high', 'medium', 'low'), t.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), parseInt(offset)]
      );

      const [[{ total }]] = await db.query(
        `SELECT COUNT(*) as total FROM tasks t ${whereClause}`, params
      );

      return { rows, total };
    }

    // For admins/managers: group tasks by group_id so multi-assigned tasks show as one row
    const [rows] = await db.query(
      `SELECT MIN(t.id) as id,
              ANY_VALUE(t.title) as title,
              ANY_VALUE(t.description) as description,
              ANY_VALUE(t.type) as type,
              ANY_VALUE(t.recurrence_pattern) as recurrence_pattern,
              ANY_VALUE(t.recurrence_days) as recurrence_days,
              ANY_VALUE(t.deadline_time) as deadline_time,
              ANY_VALUE(t.recurrence_end_date) as recurrence_end_date,
              ANY_VALUE(t.assigned_to) as assigned_to,
              ANY_VALUE(t.created_by) as created_by,
              ANY_VALUE(t.group_id) as group_id,
              ANY_VALUE(t.due_date) as due_date,
              ANY_VALUE(t.reward_amount) as reward_amount,
              ANY_VALUE(t.status) as status,
              ANY_VALUE(t.is_deleted) as is_deleted,
              ANY_VALUE(t.created_by_org) as created_by_org,
              MAX(t.created_at) as created_at,
              ANY_VALUE(t.completed_at) as completed_at,
              ANY_VALUE(t.priority) as priority,
              ANY_VALUE(t.updated_at) as updated_at,
              ANY_VALUE(u1.name) as assigned_to_name,
              ANY_VALUE(u2.name) as created_by_name,
              GROUP_CONCAT(DISTINCT u1.name ORDER BY u1.name SEPARATOR ', ') as assignee_names,
              GROUP_CONCAT(DISTINCT CONCAT(u1.id, ':', u1.name) ORDER BY u1.name SEPARATOR ', ') as assignee_id_names,
              GROUP_CONCAT(DISTINCT t.id) as grouped_task_ids,
              COUNT(DISTINCT t.id) as assignee_count,
              (SELECT COUNT(*) FROM task_attachments ta WHERE ta.task_id = MIN(t.id)) as attachment_count,
              (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = MIN(t.id)) as comment_count
       FROM tasks t
       LEFT JOIN users u1 ON t.assigned_to = u1.id
       LEFT JOIN users u2 ON t.created_by = u2.id
       ${whereClause}
       GROUP BY COALESCE(t.group_id, t.id)
       ORDER BY FIELD(ANY_VALUE(t.status), 'in_progress', 'pending', 'active', 'completed', 'deactivated'), FIELD(ANY_VALUE(t.priority), 'urgent', 'high', 'medium', 'low'), MAX(t.created_at) DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(DISTINCT COALESCE(t.group_id, t.id)) as total FROM tasks t ${whereClause}`, params
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

  static async getCompletionStats(period = 'today', todayDate = null) {
    let adhocDateFilter, recurringDateFilter;
    const adhocParams = [];
    const recurringParams = [];
    switch (period) {
      case 'today':
        if (todayDate) {
          adhocDateFilter = 'DATE(completed_at) = ?'; adhocParams.push(todayDate);
          recurringDateFilter = 'completion_date = ?'; recurringParams.push(todayDate);
        } else {
          adhocDateFilter = 'DATE(completed_at) = CURDATE()';
          recurringDateFilter = 'completion_date = CURDATE()';
        }
        break;
      case 'week':
        if (todayDate) {
          adhocDateFilter = 'YEARWEEK(completed_at) = YEARWEEK(?)'; adhocParams.push(todayDate);
          recurringDateFilter = 'YEARWEEK(completion_date) = YEARWEEK(?)'; recurringParams.push(todayDate);
        } else {
          adhocDateFilter = 'YEARWEEK(completed_at) = YEARWEEK(NOW())';
          recurringDateFilter = 'YEARWEEK(completion_date) = YEARWEEK(NOW())';
        }
        break;
      case 'month':
        if (todayDate) {
          adhocDateFilter = 'MONTH(completed_at) = MONTH(?) AND YEAR(completed_at) = YEAR(?)'; adhocParams.push(todayDate, todayDate);
          recurringDateFilter = 'MONTH(completion_date) = MONTH(?) AND YEAR(completion_date) = YEAR(?)'; recurringParams.push(todayDate, todayDate);
        } else {
          adhocDateFilter = 'MONTH(completed_at) = MONTH(NOW()) AND YEAR(completed_at) = YEAR(NOW())';
          recurringDateFilter = 'MONTH(completion_date) = MONTH(NOW()) AND YEAR(completion_date) = YEAR(NOW())';
        }
        break;
      case 'year':
        if (todayDate) {
          adhocDateFilter = 'YEAR(completed_at) = YEAR(?)'; adhocParams.push(todayDate);
          recurringDateFilter = 'YEAR(completion_date) = YEAR(?)'; recurringParams.push(todayDate);
        } else {
          adhocDateFilter = 'YEAR(completed_at) = YEAR(NOW())';
          recurringDateFilter = 'YEAR(completion_date) = YEAR(NOW())';
        }
        break;
      default:
        adhocDateFilter = '1=1';
        recurringDateFilter = '1=1';
    }

    const [[adhoc]] = await db.query(
      `SELECT COUNT(*) as total FROM tasks
       WHERE status = 'completed' AND is_deleted = 0 AND type = 'once' AND ${adhocDateFilter}`,
      adhocParams
    );
    const [[recurring]] = await db.query(
      `SELECT COUNT(*) as total FROM task_completions tc
       JOIN tasks t ON tc.task_id = t.id
       WHERE t.is_deleted = 0 AND ${recurringDateFilter}`,
      recurringParams
    );
    return (parseInt(adhoc.total) || 0) + (parseInt(recurring.total) || 0);
  }
}

module.exports = TaskModel;
