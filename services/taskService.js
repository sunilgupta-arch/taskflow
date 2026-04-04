const TaskModel = require('../models/Task');
const TaskCompletion = require('../models/TaskCompletion');
const RewardModel = require('../models/Reward');
const db = require('../config/db');
const { getToday, getUTCNow, getEffectiveWorkDate, getEffectiveWorkDateWithSession } = require('../utils/timezone');
const ChatModel = require('../models/Chat');

// Helper: send system notification (non-blocking)
async function notifyUser(userId, message) {
  try { await ChatModel.sendSystemMessage(userId, message); } catch (e) {}
}

// Helper: get user name by ID
async function getUserName(userId) {
  const [[u]] = await db.query('SELECT name FROM users WHERE id = ?', [userId]);
  return u ? u.name : 'Someone';
}

// Helper: check if user completed ALL tasks today and notify streak
async function checkStreakAndNotify(userId, timezone) {
  try {
    const today = getToday(timezone);

    // Count total vs done for today
    const [[rTotal]] = await db.query(
      'SELECT COUNT(*) as cnt FROM tasks WHERE is_deleted = 0 AND assigned_to = ? AND type = "recurring" AND status = "active"',
      [userId]
    );
    const [[rDone]] = await db.query(
      'SELECT COUNT(*) as cnt FROM task_completions tc JOIN tasks t ON tc.task_id = t.id WHERE t.assigned_to = ? AND tc.user_id = ? AND tc.completion_date = ? AND tc.completed_at IS NOT NULL',
      [userId, userId, today]
    );
    const [[oTotal]] = await db.query(
      'SELECT COUNT(*) as cnt FROM tasks WHERE is_deleted = 0 AND assigned_to = ? AND type = "once" AND (due_date = ? OR (due_date IS NULL AND DATE(created_at) = ?)) AND status IN ("pending","in_progress","completed")',
      [userId, today, today]
    );
    const [[oDone]] = await db.query(
      'SELECT COUNT(*) as cnt FROM tasks WHERE is_deleted = 0 AND assigned_to = ? AND type = "once" AND status = "completed" AND DATE(completed_at) = ?',
      [userId, today]
    );

    const total = (rTotal.cnt || 0) + (oTotal.cnt || 0);
    const done = (rDone.cnt || 0) + (oDone.cnt || 0);

    if (total > 0 && done >= total) {
      // All tasks done today! Check consecutive days streak
      let streak = 1;
      for (let i = 1; i <= 30; i++) {
        const prevDate = new Date(new Date(today + 'T12:00:00').getTime() - i * 86400000).toISOString().split('T')[0];
        const [[prevDone]] = await db.query(
          'SELECT COUNT(*) as cnt FROM task_completions WHERE user_id = ? AND completion_date = ? AND completed_at IS NOT NULL',
          [userId, prevDate]
        );
        if (prevDone.cnt > 0) streak++;
        else break;
      }

      if (streak >= 3) {
        await ChatModel.sendSystemMessage(userId,
          `🔥 ${streak}-day streak! You've completed all your tasks on time for ${streak} consecutive days. Keep it going!`
        );
      } else {
        await ChatModel.sendSystemMessage(userId,
          `🎉 All tasks done for today! Great job — you've completed all ${total} tasks.`
        );
      }
    }
  } catch (e) { /* non-critical */ }
}

/**
 * Get the effective work date for a specific user, using their shift info from DB.
 */
async function getUserWorkDate(userId, timezone) {
  const [[user]] = await db.query(`SELECT shift_start, shift_hours FROM users WHERE id = ?`, [userId]);
  if (!user) return getToday(timezone);
  return getEffectiveWorkDateWithSession(db, userId, timezone, user.shift_start, user.shift_hours);
}

class TaskService {
  static async createTask(data, creator) {
    const role = creator.role_name;
    const orgType = creator.organization_type;

    if (!['CLIENT', 'LOCAL'].includes(orgType)) {
      throw new Error('Not authorized to create tasks');
    }

    // LOCAL admin/manager can mark task as visible to client team
    const effectiveOrg = (data.client_visible && ['LOCAL_ADMIN', 'LOCAL_MANAGER'].includes(role))
      ? 'CLIENT' : orgType;

    const isRecurring = data.type === 'recurring';

    const baseData = {
      ...data,
      created_by: creator.id,
      created_by_org: effectiveOrg,
      status: isRecurring ? 'active' : 'pending',
      recurrence_pattern: isRecurring ? (data.recurrence_pattern || null) : null,
      recurrence_days: isRecurring ? (data.recurrence_days || null) : null,
      deadline_time: data.deadline_time || null,
      recurrence_end_date: data.recurrence_end_date || null
    };
    delete baseData.client_visible;

    // LOCAL_USER: force self-assignment, no reward
    if (role === 'LOCAL_USER') {
      baseData.assigned_to = creator.id;
      baseData.reward_amount = null;
      const taskId = await TaskModel.create(baseData);
      return TaskModel.findById(taskId);
    }

    // For admins/managers: same multi-assign logic
    const assignees = Array.isArray(data.assigned_to) ? data.assigned_to : [];
    const hasSecondary = data.secondary_assignee && data.secondary_assignee !== '';
    const hasTertiary = data.tertiary_assignee && data.tertiary_assignee !== '';

    // Fallback assignees and multi-assign are mutually exclusive
    if (assignees.length > 1 && (hasSecondary || hasTertiary)) {
      throw new Error('Cannot use both multi-assign and fallback assignees. Choose one.');
    }

    // Multiple assignees: create one task row per person, linked by group_id (no fallback)
    if (assignees.length > 1) {
      baseData.secondary_assignee = null;
      baseData.tertiary_assignee = null;
      const firstTaskId = await TaskModel.create({ ...baseData, assigned_to: assignees[0] });
      await TaskModel.update(firstTaskId, { group_id: firstTaskId });
      for (let i = 1; i < assignees.length; i++) {
        await TaskModel.create({ ...baseData, assigned_to: assignees[i], group_id: firstTaskId });
      }
      // Notify all assignees
      const creatorName = await getUserName(creator.id);
      for (const uid of assignees) {
        notifyUser(parseInt(uid), `📋 New task assigned to you: "${data.title}"\nAssigned by: ${creatorName}\nType: ${data.type === 'recurring' ? 'Recurring (' + (data.recurrence_pattern || 'daily') + ')' : 'One-time'}${data.reward_amount ? '\nReward: ' + data.reward_amount + ' pts' : ''}`);
      }
      return TaskModel.findById(firstTaskId);
    }

    // Single or no assignee: allow fallback assignees
    if (assignees.length === 1) baseData.assigned_to = assignees[0];
    if (hasSecondary) baseData.secondary_assignee = data.secondary_assignee;
    if (hasTertiary) baseData.tertiary_assignee = data.tertiary_assignee;
    const taskId = await TaskModel.create(baseData);

    // Notify assignee
    if (assignees.length === 1) {
      const creatorName = await getUserName(creator.id);
      notifyUser(parseInt(assignees[0]), `📋 New task assigned to you: "${data.title}"\nAssigned by: ${creatorName}\nType: ${data.type === 'recurring' ? 'Recurring (' + (data.recurrence_pattern || 'daily') + ')' : 'One-time'}${data.reward_amount ? '\nReward: ' + data.reward_amount + ' pts' : ''}`);
    }
    return TaskModel.findById(taskId);
  }

  static async assignTask(taskId, assigneeId, assignerRole) {
    const task = await TaskModel.findById(taskId);
    if (!task) throw new Error('Task not found');

    // CLIENT can assign, LOCAL can reassign
    const allowedRoles = ['CLIENT_ADMIN', 'CLIENT_MANAGER', 'LOCAL_ADMIN', 'LOCAL_MANAGER'];
    if (!allowedRoles.includes(assignerRole)) {
      throw new Error('Not authorized to assign tasks');
    }

    // If reassigning within LOCAL, validate assignee is LOCAL team
    if (['LOCAL_ADMIN', 'LOCAL_MANAGER'].includes(assignerRole)) {
      const [users] = await db.query(
        `SELECT u.id FROM users u JOIN organizations o ON u.organization_id = o.id
         WHERE u.id = ? AND o.org_type = 'LOCAL'`, [assigneeId]
      );
      if (!users.length) throw new Error('Can only reassign to LOCAL team members');
    }

    await TaskModel.update(taskId, { assigned_to: assigneeId, status: 'in_progress' });
    // Notify new assignee
    notifyUser(assigneeId, `📋 Task reassigned to you: "${task.title}"\nThis task was reassigned to you by your manager.`);
    return true;
  }

  static async pickTask(taskId, user) {
    const task = await TaskModel.findById(taskId);
    if (!task) throw new Error('Task not found');
    if (task.assigned_to) throw new Error('Task is already assigned');
    if (task.status !== 'pending') throw new Error('Task is not available for picking');
    if (user.organization_type !== 'LOCAL') throw new Error('Only LOCAL team can pick tasks');

    return TaskModel.update(taskId, { assigned_to: user.id, status: 'in_progress' });
  }

  static async startTask(taskId, userId) {
    const task = await TaskModel.findById(taskId);
    if (!task) throw new Error('Task not found');
    if (task.assigned_to !== userId) throw new Error('You can only start tasks assigned to you');

    // Recurring tasks don't have a start flow — they're always active
    if (task.type === 'recurring' && task.status === 'active') {
      throw new Error('Recurring tasks do not need to be started. Use "Log Completion" instead.');
    }

    if (task.status !== 'pending') throw new Error('Only pending tasks can be started');

    await TaskModel.update(taskId, { status: 'in_progress' });
    return TaskModel.findById(taskId);
  }

  static async completeTask(taskId, userId, workDate = null) {
    const task = await TaskModel.findById(taskId);
    if (!task) throw new Error('Task not found');
    if (task.assigned_to !== userId) throw new Error('You can only complete tasks assigned to you');

    // Recurring tasks use logCompletion instead
    if (task.type === 'recurring' && task.status === 'active') {
      return this.logCompletion(taskId, userId, workDate);
    }

    // Adhoc task: original flow
    if (task.status === 'completed') throw new Error('Task already completed');

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      await conn.query(
        `UPDATE tasks SET status = 'completed', completed_at = ? WHERE id = ?`, [getUTCNow(), taskId]
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
      checkStreakAndNotify(userId, 'UTC');
      return TaskModel.findById(taskId);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Log completion for a recurring task for today (or a specific date).
   */
  static async logCompletion(taskId, userId, date = null, timezone = 'UTC') {
    const task = await TaskModel.findById(taskId);
    if (!task) throw new Error('Task not found');
    if (task.assigned_to !== userId) throw new Error('You can only log completion for tasks assigned to you');
    if (task.type !== 'recurring') throw new Error('Only recurring tasks can be logged');
    if (task.status !== 'active') throw new Error('Task is not active');

    // Use employee's effective work date if no explicit date provided
    const completionDate = date || await getUserWorkDate(userId, timezone);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Check if already completed for this date
      const [[existing]] = await conn.query(
        `SELECT id FROM task_completions WHERE task_id = ? AND user_id = ? AND completion_date = ?`,
        [taskId, userId, completionDate]
      );
      if (existing) throw new Error('Already completed for this date');

      await conn.query(
        `INSERT INTO task_completions (task_id, user_id, completion_date) VALUES (?, ?, ?)`,
        [taskId, userId, completionDate]
      );

      // Create reward entry if applicable
      if (task.reward_amount && parseFloat(task.reward_amount) > 0) {
        await conn.query(
          `INSERT INTO rewards_ledger (user_id, task_id, reward_amount, status)
           VALUES (?, ?, ?, 'pending')`,
          [userId, taskId, task.reward_amount]
        );
      }

      await conn.commit();
      checkStreakAndNotify(userId, timezone);
      return task;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /**
   * Undo completion for a recurring task for today (or a specific date).
   */
  static async undoCompletion(taskId, userId, date = null, timezone = 'UTC') {
    const task = await TaskModel.findById(taskId);
    if (!task) throw new Error('Task not found');
    if (task.assigned_to !== userId) throw new Error('You can only undo completion for tasks assigned to you');

    // Use employee's effective work date if no explicit date provided
    const completionDate = date || await getUserWorkDate(userId, timezone);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        `DELETE FROM task_completions WHERE task_id = ? AND user_id = ? AND completion_date = ?`,
        [taskId, userId, completionDate]
      );
      if (result.affectedRows === 0) throw new Error('No completion found for this date');

      // Remove the reward entry for this date (latest pending one for this task)
      if (task.reward_amount && parseFloat(task.reward_amount) > 0) {
        await conn.query(
          `DELETE FROM rewards_ledger WHERE user_id = ? AND task_id = ? AND status = 'pending'
           ORDER BY created_at DESC LIMIT 1`,
          [userId, taskId]
        );
      }

      await conn.commit();
      return task;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  static async startSession(taskId, userId, timezone = 'UTC', workDate = null) {
    const task = await TaskModel.findById(taskId);
    if (!task) throw new Error('Task not found');
    if (task.assigned_to !== userId) throw new Error('You can only start tasks assigned to you');
    if (task.type !== 'recurring') throw new Error('Only recurring tasks use session tracking');
    if (task.status !== 'active') throw new Error('Task is not active');

    // Always compute from the employee's own shift info for accuracy
    const today = await getUserWorkDate(userId, timezone);

    const [[existing]] = await db.query(
      `SELECT id, started_at, completed_at FROM task_completions WHERE task_id = ? AND user_id = ? AND completion_date = ?`,
      [taskId, userId, today]
    );
    if (existing && existing.completed_at) throw new Error('Task already completed for today');
    if (existing && existing.started_at) throw new Error('Task already started for today');

    await TaskCompletion.startSession(taskId, userId, today);
    return task;
  }

  static async completeSession(taskId, userId, timezone = 'UTC', workDate = null) {
    const task = await TaskModel.findById(taskId);
    if (!task) throw new Error('Task not found');
    if (task.assigned_to !== userId) throw new Error('You can only complete tasks assigned to you');
    if (task.type !== 'recurring') throw new Error('Only recurring tasks use session tracking');
    if (task.status !== 'active') throw new Error('Task is not active');

    // Always compute from the employee's own shift info for accuracy
    const today = await getUserWorkDate(userId, timezone);

    const [[session]] = await db.query(
      `SELECT id, started_at, completed_at FROM task_completions WHERE task_id = ? AND user_id = ? AND completion_date = ?`,
      [taskId, userId, today]
    );
    if (!session) throw new Error('Task has not been started today');
    if (session.completed_at) throw new Error('Task already completed for today');

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const now = getUTCNow();
      await conn.query(
        `UPDATE task_completions SET completed_at = ?, duration_minutes = TIMESTAMPDIFF(MINUTE, started_at, ?)
         WHERE task_id = ? AND user_id = ? AND completion_date = ?`,
        [now, now, taskId, userId, today]
      );

      if (task.reward_amount && parseFloat(task.reward_amount) > 0) {
        await conn.query(
          `INSERT INTO rewards_ledger (user_id, task_id, reward_amount, status) VALUES (?, ?, ?, 'pending')`,
          [userId, taskId, task.reward_amount]
        );
      }

      await conn.commit();
      checkStreakAndNotify(userId, timezone);
      return task;
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
        recurrence_pattern: template.recurrence_pattern,
        recurrence_days: template.recurrence_days,
        deadline_time: template.deadline_time,
        recurrence_end_date: template.recurrence_end_date,
        assigned_to: userId,
        created_by: template.created_by,
        created_by_org: template.created_by_org,
        group_id: groupId,
        due_date: template.due_date,
        reward_amount: template.reward_amount,
        priority: template.priority || 'medium',
        status: template.type === 'recurring' ? 'active' : 'pending'
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
      // Get all assignees before deactivating
      const [groupTasks] = await db.query(
        'SELECT assigned_to FROM tasks WHERE group_id = ? AND is_deleted = 0 AND assigned_to IS NOT NULL',
        [task.group_id]
      );
      await db.query(
        `UPDATE tasks SET status = 'deactivated' WHERE group_id = ? AND is_deleted = 0`,
        [task.group_id]
      );
      // Notify all assignees
      groupTasks.forEach(t => {
        notifyUser(t.assigned_to, `🚫 Task deactivated: "${task.title}"\nThis recurring task has been deactivated and will no longer appear in your task list.`);
      });
    } else {
      await TaskModel.update(taskId, { status: 'deactivated' });
      if (task.assigned_to) {
        notifyUser(task.assigned_to, `🚫 Task deactivated: "${task.title}"\nThis task has been deactivated and will no longer appear in your task list.`);
      }
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

  static async getTaskStats(userId = null, orgType = null, todayDate = null) {
    let userFilter = userId ? `AND (t.assigned_to = ${db.escape(userId)} OR t.created_by = ${db.escape(userId)})` : '';
    let orgFilter = orgType === 'CLIENT' ? "AND t.created_by_org = 'CLIENT'" : '';
    // Use timezone-aware date if provided, otherwise fallback to UTC CURDATE()/NOW()
    const todayExpr = todayDate ? db.escape(todayDate) : 'CURDATE()';
    const nowExpr = todayDate ? db.escape(todayDate) : 'NOW()';

    // One-time task stats (status-based)
    const [[onceStats]] = await db.query(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'completed' AND DATE(completed_at) = ${todayExpr} THEN 1 ELSE 0 END) as completed_today,
        SUM(CASE WHEN status = 'completed' AND YEARWEEK(completed_at) = YEARWEEK(${nowExpr}) THEN 1 ELSE 0 END) as completed_this_week,
        SUM(CASE WHEN status = 'completed' AND MONTH(completed_at) = MONTH(${nowExpr}) AND YEAR(completed_at) = YEAR(${nowExpr}) THEN 1 ELSE 0 END) as completed_this_month,
        SUM(CASE WHEN status = 'completed' AND YEAR(completed_at) = YEAR(${nowExpr}) THEN 1 ELSE 0 END) as completed_this_year,
        SUM(CASE WHEN type = 'once' THEN 1 ELSE 0 END) as type_once
       FROM tasks t WHERE is_deleted = 0 AND type = 'once' ${userFilter} ${orgFilter}`
    );

    // Recurring task stats (from task_completions)
    let recurringUserFilter = userId ? `AND t.assigned_to = ${db.escape(userId)}` : '';
    const [[recurringStats]] = await db.query(
      `SELECT
        COUNT(DISTINCT t.id) as total,
        COUNT(DISTINCT CASE WHEN t.recurrence_pattern = 'daily' THEN t.id END) as type_daily,
        COUNT(DISTINCT CASE WHEN t.recurrence_pattern = 'weekly' THEN t.id END) as type_weekly,
        COUNT(DISTINCT CASE WHEN t.recurrence_pattern = 'monthly' THEN t.id END) as type_monthly
       FROM tasks t WHERE t.is_deleted = 0 AND t.type = 'recurring' AND t.status = 'active' ${recurringUserFilter} ${orgFilter}`
    );

    const [[completionStats]] = await db.query(
      `SELECT
        COUNT(*) as completed,
        SUM(CASE WHEN tc.completion_date = ${todayExpr} THEN 1 ELSE 0 END) as completed_today,
        SUM(CASE WHEN YEARWEEK(tc.completion_date) = YEARWEEK(${nowExpr}) THEN 1 ELSE 0 END) as completed_this_week,
        SUM(CASE WHEN MONTH(tc.completion_date) = MONTH(${nowExpr}) AND YEAR(tc.completion_date) = YEAR(${nowExpr}) THEN 1 ELSE 0 END) as completed_this_month,
        SUM(CASE WHEN YEAR(tc.completion_date) = YEAR(${nowExpr}) THEN 1 ELSE 0 END) as completed_this_year
       FROM task_completions tc
       JOIN tasks t ON tc.task_id = t.id
       WHERE t.is_deleted = 0 ${recurringUserFilter} ${orgFilter}`
    );

    return {
      total: (parseInt(onceStats.total) || 0) + (parseInt(recurringStats.total) || 0),
      pending: parseInt(onceStats.pending) || 0,
      in_progress: parseInt(onceStats.in_progress) || 0,
      completed: (parseInt(onceStats.completed) || 0) + (parseInt(completionStats.completed) || 0),
      completed_today: (parseInt(onceStats.completed_today) || 0) + (parseInt(completionStats.completed_today) || 0),
      completed_this_week: (parseInt(onceStats.completed_this_week) || 0) + (parseInt(completionStats.completed_this_week) || 0),
      completed_this_month: (parseInt(onceStats.completed_this_month) || 0) + (parseInt(completionStats.completed_this_month) || 0),
      completed_this_year: (parseInt(onceStats.completed_this_year) || 0) + (parseInt(completionStats.completed_this_year) || 0),
      type_daily: parseInt(recurringStats.type_daily) || 0,
      type_weekly: parseInt(recurringStats.type_weekly) || 0,
      type_monthly: parseInt(recurringStats.type_monthly) || 0,
      type_once: parseInt(onceStats.type_once) || 0
    };
  }

  static async getCompletionPerUser(orgType = null) {
    let orgFilter = orgType === 'CLIENT' ? "AND t.created_by_org = 'CLIENT'" : '';

    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email,
        (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = u.id AND t.is_deleted = 0 ${orgFilter}) as total_tasks,
        (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = u.id AND t.is_deleted = 0 AND t.type = 'once' AND t.status = 'completed' ${orgFilter})
        + (SELECT COUNT(*) FROM task_completions tc JOIN tasks t ON tc.task_id = t.id WHERE t.assigned_to = u.id AND t.is_deleted = 0 ${orgFilter}) as completed,
        (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = u.id AND t.is_deleted = 0 AND t.status = 'in_progress' ${orgFilter}) as in_progress,
        (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = u.id AND t.is_deleted = 0 AND t.status = 'pending' ${orgFilter}) as pending,
        (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = u.id AND t.is_deleted = 0 AND t.status = 'active' ${orgFilter}) as active_recurring,
        (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = u.id AND t.is_deleted = 0 AND t.status = 'deactivated' ${orgFilter}) as deactivated
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.is_active = 1 AND r.name NOT IN ('CLIENT_ADMIN', 'CLIENT_MANAGER')
       GROUP BY u.id
       ORDER BY completed DESC`
    );
    return rows;
  }
}

module.exports = TaskService;
