const db = require('../../config/db');

class PortalTask {

  // Create a new task
  static async create({ title, description, priority, assigned_by, assigned_to, due_date }) {
    const [result] = await db.query(
      `INSERT INTO portal_tasks (title, description, priority, assigned_by, assigned_to, due_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, description || null, priority || 'medium', assigned_by, assigned_to, due_date || null]
    );
    return result.insertId;
  }

  // Get a single task by ID
  static async getById(taskId) {
    const [rows] = await db.query(
      `SELECT t.*,
              creator.name as assigned_by_name, cr.name as assigned_by_role,
              assignee.name as assigned_to_name, ar.name as assigned_to_role
       FROM portal_tasks t
       JOIN users creator ON creator.id = t.assigned_by
       JOIN roles cr ON creator.role_id = cr.id
       JOIN users assignee ON assignee.id = t.assigned_to
       JOIN roles ar ON assignee.role_id = ar.id
       WHERE t.id = ?`,
      [taskId]
    );
    return rows[0] || null;
  }

  // Get tasks for a user (assigned to them or created by them)
  static async getTasksForUser(userId, filters = {}) {
    let query = `SELECT t.*,
                   creator.name as assigned_by_name, cr.name as assigned_by_role,
                   assignee.name as assigned_to_name, ar.name as assigned_to_role,
                   (SELECT COUNT(*) FROM portal_task_comments tc WHERE tc.task_id = t.id) as comment_count
                 FROM portal_tasks t
                 JOIN users creator ON creator.id = t.assigned_by
                 JOIN roles cr ON creator.role_id = cr.id
                 JOIN users assignee ON assignee.id = t.assigned_to
                 JOIN roles ar ON assignee.role_id = ar.id
                 WHERE (t.assigned_to = ? OR t.assigned_by = ?)`;
    const params = [userId, userId];

    if (filters.status) {
      query += ' AND t.status = ?';
      params.push(filters.status);
    }
    if (filters.priority) {
      query += ' AND t.priority = ?';
      params.push(filters.priority);
    }

    query += ' ORDER BY t.created_at DESC';

    const [rows] = await db.query(query, params);
    return rows;
  }

  // Get all tasks (for admin view)
  static async getAllTasks(filters = {}) {
    let query = `SELECT t.*,
                   creator.name as assigned_by_name, cr.name as assigned_by_role,
                   assignee.name as assigned_to_name, ar.name as assigned_to_role,
                   (SELECT COUNT(*) FROM portal_task_comments tc WHERE tc.task_id = t.id) as comment_count
                 FROM portal_tasks t
                 JOIN users creator ON creator.id = t.assigned_by
                 JOIN roles cr ON creator.role_id = cr.id
                 JOIN users assignee ON assignee.id = t.assigned_to
                 JOIN roles ar ON assignee.role_id = ar.id
                 WHERE 1=1`;
    const params = [];

    if (filters.status) {
      query += ' AND t.status = ?';
      params.push(filters.status);
    }
    if (filters.priority) {
      query += ' AND t.priority = ?';
      params.push(filters.priority);
    }

    query += ' ORDER BY t.created_at DESC';

    const [rows] = await db.query(query, params);
    return rows;
  }

  // Update task status
  static async updateStatus(taskId, status) {
    await db.query('UPDATE portal_tasks SET status = ? WHERE id = ?', [status, taskId]);
  }

  // Update task details
  static async update(taskId, fields) {
    const allowed = ['title', 'description', 'priority', 'status', 'assigned_to', 'due_date'];
    const updates = [];
    const params = [];

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        params.push(fields[key]);
      }
    }

    if (!updates.length) return;

    params.push(taskId);
    await db.query(`UPDATE portal_tasks SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  // Add a comment to a task
  static async addComment({ task_id, user_id, content }) {
    const [result] = await db.query(
      'INSERT INTO portal_task_comments (task_id, user_id, content) VALUES (?, ?, ?)',
      [task_id, user_id, content]
    );
    return result.insertId;
  }

  // Get comments for a task (with attachments)
  static async getComments(taskId) {
    const [rows] = await db.query(
      `SELECT tc.*, u.name as user_name, r.name as role_name
       FROM portal_task_comments tc
       JOIN users u ON u.id = tc.user_id
       JOIN roles r ON u.role_id = r.id
       WHERE tc.task_id = ?
       ORDER BY tc.created_at ASC`,
      [taskId]
    );

    // Load attachments for each comment
    if (rows.length) {
      const commentIds = rows.map(c => c.id);
      const [attachments] = await db.query(
        'SELECT * FROM portal_task_attachments WHERE comment_id IN (?)',
        [commentIds]
      );
      const attachMap = {};
      for (const a of attachments) {
        if (!attachMap[a.comment_id]) attachMap[a.comment_id] = [];
        attachMap[a.comment_id].push(a);
      }
      for (const c of rows) {
        c.attachments = attachMap[c.id] || [];
      }
    }

    return rows;
  }

  // Save task comment attachment
  static async saveCommentAttachment({ comment_id, file_name, file_path, file_size, mime_type, uploaded_by }) {
    const [result] = await db.query(
      `INSERT INTO portal_task_attachments (comment_id, file_name, file_path, file_size, mime_type, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [comment_id, file_name, file_path, file_size, mime_type, uploaded_by]
    );
    return result.insertId;
  }

  // Get attachment by ID
  static async getAttachment(attachmentId) {
    const [rows] = await db.query(
      'SELECT a.*, tc.task_id FROM portal_task_attachments a JOIN portal_task_comments tc ON tc.id = a.comment_id WHERE a.id = ?',
      [attachmentId]
    );
    return rows[0] || null;
  }

  // Check if user can view a task (must be creator or assignee)
  static async canAccess(taskId, userId, roleName) {
    if (roleName === 'CLIENT_ADMIN') return true;
    const [rows] = await db.query(
      'SELECT id FROM portal_tasks WHERE id = ? AND (assigned_by = ? OR assigned_to = ?)',
      [taskId, userId, userId]
    );
    return rows.length > 0;
  }

  // Get assignable users based on role hierarchy
  static async getAssignableUsers(currentUserId, currentRole) {
    let roleFilter;
    if (currentRole === 'CLIENT_ADMIN') {
      roleFilter = "r.name IN ('CLIENT_ADMIN', 'CLIENT_MANAGER', 'CLIENT_USER')";
    } else if (currentRole === 'CLIENT_MANAGER') {
      roleFilter = "r.name IN ('CLIENT_MANAGER', 'CLIENT_USER')";
    } else {
      return [];
    }

    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email, r.name as role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE ${roleFilter} AND u.is_active = 1 AND u.id != ? AND u.email != 'system@taskflow.local'
       ORDER BY u.name`,
      [currentUserId]
    );
    return rows;
  }
}

module.exports = PortalTask;
