const TaskModel = require('../models/Task');
const RewardModel = require('../models/Reward');
const db = require('../config/db');

class TaskService {
  static async createTask(data, creator) {
    // Only CFC can create tasks
    if (creator.organization_type !== 'CFC') {
      throw new Error('Only CFC organization can create tasks');
    }

    const assignees = Array.isArray(data.assigned_to) ? data.assigned_to : [];
    const baseData = { ...data, created_by: creator.id };

    // Multiple assignees: create one task row per person, linked by group_id
    if (assignees.length > 1) {
      const firstTaskId = await TaskModel.create({ ...baseData, assigned_to: assignees[0] });
      // Use first task's ID as the group_id for all rows
      await TaskModel.update(firstTaskId, { group_id: firstTaskId });
      for (let i = 1; i < assignees.length; i++) {
        await TaskModel.create({ ...baseData, assigned_to: assignees[i], group_id: firstTaskId });
      }
      return TaskModel.findById(firstTaskId);
    }

    // Single or no assignee: no group needed
    if (assignees.length === 1) baseData.assigned_to = assignees[0];
    const taskId = await TaskModel.create(baseData);
    return TaskModel.findById(taskId);
  }

  static async assignTask(taskId, assigneeId, assignerRole) {
    const task = await TaskModel.findById(taskId);
    if (!task) throw new Error('Task not found');

    // CFC can assign, OUR can reassign
    const allowedRoles = ['CFC_ADMIN', 'CFC_MANAGER', 'OUR_ADMIN', 'OUR_MANAGER'];
    if (!allowedRoles.includes(assignerRole)) {
      throw new Error('Not authorized to assign tasks');
    }

    // If reassigning within OUR, validate assignee is OUR team
    if (['OUR_ADMIN', 'OUR_MANAGER'].includes(assignerRole)) {
      const [users] = await db.query(
        `SELECT u.id FROM users u JOIN organizations o ON u.organization_id = o.id
         WHERE u.id = ? AND o.org_type = 'OUR'`, [assigneeId]
      );
      if (!users.length) throw new Error('Can only reassign to OUR team members');
    }

    return TaskModel.update(taskId, { assigned_to: assigneeId, status: 'in_progress' });
  }

  static async pickTask(taskId, user) {
    const task = await TaskModel.findById(taskId);
    if (!task) throw new Error('Task not found');
    if (task.assigned_to) throw new Error('Task is already assigned');
    if (task.status !== 'pending') throw new Error('Task is not available for picking');
    if (user.organization_type !== 'OUR') throw new Error('Only OUR team can pick tasks');

    return TaskModel.update(taskId, { assigned_to: user.id, status: 'in_progress' });
  }

  static async completeTask(taskId, userId) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        `SELECT * FROM tasks WHERE id = ? AND is_deleted = 0 FOR UPDATE`, [taskId]
      );
      const task = rows[0];
      if (!task) throw new Error('Task not found');
      if (task.assigned_to !== userId) throw new Error('You can only complete tasks assigned to you');
      if (task.status === 'completed') throw new Error('Task already completed');

      await conn.query(
        `UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = ?`, [taskId]
      );

      if (task.reward_amount && parseFloat(task.reward_amount) > 0) {
        await conn.query(
          `INSERT INTO rewards_ledger (user_id, task_id, reward_amount, status)
           VALUES (?, ?, ?, 'pending')
           ON DUPLICATE KEY UPDATE reward_amount = VALUES(reward_amount)`,
          [userId, taskId, task.reward_amount]
        );
      }

      await conn.commit();
      return TaskModel.findById(taskId);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  static async updateGroupAssignees(taskId, userIds) {
    const task = await TaskModel.findById(taskId);
    if (!task) throw new Error('Task not found');

    const groupId = task.group_id || task.id;

    // Get all current tasks in the group
    const [currentTasks] = await db.query(
      `SELECT * FROM tasks WHERE group_id = ? AND is_deleted = 0`, [groupId]
    );

    const currentUserIds = currentTasks.map(t => String(t.assigned_to));
    const newUserIds = userIds.map(String);

    // Users to remove: in current but not in new
    const toRemove = currentTasks.filter(t => !newUserIds.includes(String(t.assigned_to)));
    for (const t of toRemove) {
      await TaskModel.softDelete(t.id);
    }

    // Users to add: in new but not in current
    const toAdd = newUserIds.filter(uid => !currentUserIds.includes(uid));
    // Use the first task as a template
    const template = currentTasks[0] || task;
    for (const userId of toAdd) {
      await TaskModel.create({
        title: template.title,
        description: template.description,
        type: template.type,
        assigned_to: userId,
        created_by: template.created_by,
        group_id: groupId,
        due_date: template.due_date,
        reward_amount: template.reward_amount,
        status: 'pending'
      });
    }

    // If this was a solo task being turned into a group, set group_id on original
    if (!task.group_id && newUserIds.length > 1) {
      await TaskModel.update(task.id, { group_id: task.id });
    }
  }

  static async deactivateTask(taskId) {
    const task = await TaskModel.findById(taskId);
    if (!task) throw new Error('Task not found');

    if (task.group_id) {
      // Deactivate all tasks in the group
      await db.query(
        `UPDATE tasks SET status = 'deactivated' WHERE group_id = ? AND is_deleted = 0`,
        [task.group_id]
      );
    } else {
      await TaskModel.update(taskId, { status: 'deactivated' });
    }
  }

  static async deleteTask(taskId) {
    const task = await TaskModel.findById(taskId);
    if (!task) throw new Error('Task not found');
    if (task.status !== 'deactivated') throw new Error('Task must be deactivated before deletion');

    if (task.group_id) {
      // Delete all tasks in the group
      await db.query(
        `UPDATE tasks SET is_deleted = 1 WHERE group_id = ? AND is_deleted = 0`,
        [task.group_id]
      );
    } else {
      await TaskModel.softDelete(taskId);
    }
  }

  static async uploadAttachments(taskId, files, userId) {
    const task = await TaskModel.findById(taskId);
    if (!task) throw new Error('Task not found');

    const attachments = files.map(f => ({
      task_id: taskId,
      file_path: f.filename,
      original_name: f.originalname,
      file_size: f.size,
      uploaded_by: userId
    }));

    for (const att of attachments) {
      await db.query(
        `INSERT INTO task_attachments (task_id, file_path, original_name, file_size, uploaded_by)
         VALUES (?, ?, ?, ?, ?)`,
        [att.task_id, att.file_path, att.original_name, att.file_size, att.uploaded_by]
      );
    }

    return attachments;
  }

  static async getTaskStats(userId = null) {
    let userFilter = userId ? `AND (t.assigned_to = ${db.escape(userId)} OR t.created_by = ${db.escape(userId)})` : '';

    const [[stats]] = await db.query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'completed' AND DATE(completed_at) = CURDATE() THEN 1 ELSE 0 END) as completed_today,
        SUM(CASE WHEN status = 'completed' AND YEARWEEK(completed_at) = YEARWEEK(NOW()) THEN 1 ELSE 0 END) as completed_this_week,
        SUM(CASE WHEN status = 'completed' AND MONTH(completed_at) = MONTH(NOW()) AND YEAR(completed_at) = YEAR(NOW()) THEN 1 ELSE 0 END) as completed_this_month,
        SUM(CASE WHEN status = 'completed' AND YEAR(completed_at) = YEAR(NOW()) THEN 1 ELSE 0 END) as completed_this_year
       FROM tasks t WHERE is_deleted = 0 ${userFilter}`
    );
    return stats;
  }

  static async getCompletionPerUser() {
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email,
        COUNT(t.id) as total_tasks,
        SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) as pending
       FROM users u
       LEFT JOIN tasks t ON u.id = t.assigned_to AND t.is_deleted = 0
       WHERE u.is_active = 1
       GROUP BY u.id
       ORDER BY completed DESC`
    );
    return rows;
  }
}

module.exports = TaskService;
