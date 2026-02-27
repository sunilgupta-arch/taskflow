const cron = require('node-cron');
const db = require('../config/db');

/**
 * Daily Tasks Regeneration - runs at midnight every day
 * Finds completed daily tasks and resets them for the next day
 */
const dailyTaskJob = cron.schedule('0 0 * * *', async () => {
  console.log('[CRON] Running daily task regeneration...');
  try {
    // Get all completed daily tasks
    const [tasks] = await db.query(
      `SELECT * FROM tasks WHERE type = 'daily' AND status = 'completed' AND is_deleted = 0`
    );

    const today = new Date().toISOString().split('T')[0];
    const newGroupIds = new Map(); // old group_id -> new group_id

    for (const task of tasks) {
      const [result] = await db.query(
        `INSERT INTO tasks (title, description, type, assigned_to, created_by, reward_amount, status, due_date)
         VALUES (?, ?, 'daily', ?, ?, ?, 'pending', ?)`,
        [task.title, task.description, task.assigned_to, task.created_by, task.reward_amount, today]
      );

      // Preserve grouping for multi-assigned tasks
      if (task.group_id) {
        if (!newGroupIds.has(task.group_id)) {
          // First task in this group — use its new ID as the new group_id
          newGroupIds.set(task.group_id, result.insertId);
        }
        await db.query(`UPDATE tasks SET group_id = ? WHERE id = ?`, [newGroupIds.get(task.group_id), result.insertId]);
      }
    }

    console.log(`[CRON] Created ${tasks.length} daily task(s)`);
  } catch (err) {
    console.error('[CRON] Daily task error:', err.message);
  }
}, { scheduled: false });

/**
 * Weekly Tasks Regeneration - runs at midnight every Monday
 */
const weeklyTaskJob = cron.schedule('0 0 * * 1', async () => {
  console.log('[CRON] Running weekly task regeneration...');
  try {
    const [tasks] = await db.query(
      `SELECT * FROM tasks WHERE type = 'weekly' AND status = 'completed' AND is_deleted = 0`
    );

    const newGroupIds = new Map();

    for (const task of tasks) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 6); // End of week

      const [result] = await db.query(
        `INSERT INTO tasks (title, description, type, assigned_to, created_by, reward_amount, status, due_date)
         VALUES (?, ?, 'weekly', ?, ?, ?, 'pending', ?)`,
        [task.title, task.description, task.assigned_to, task.created_by, task.reward_amount, dueDate.toISOString().split('T')[0]]
      );

      // Preserve grouping for multi-assigned tasks
      if (task.group_id) {
        if (!newGroupIds.has(task.group_id)) {
          newGroupIds.set(task.group_id, result.insertId);
        }
        await db.query(`UPDATE tasks SET group_id = ? WHERE id = ?`, [newGroupIds.get(task.group_id), result.insertId]);
      }
    }

    console.log(`[CRON] Created ${tasks.length} weekly task(s)`);
  } catch (err) {
    console.error('[CRON] Weekly task error:', err.message);
  }
}, { scheduled: false });

/**
 * Auto-logout attendance cleanup - runs at 11:59 PM
 */
const attendanceCleanupJob = cron.schedule('59 23 * * *', async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    await db.query(
      `UPDATE attendance_logs SET logout_time = '23:59:59'
       WHERE date = ? AND logout_time IS NULL`, [today]
    );
    console.log('[CRON] Attendance cleanup done');
  } catch (err) {
    console.error('[CRON] Attendance cleanup error:', err.message);
  }
}, { scheduled: false });

const startCronJobs = () => {
  dailyTaskJob.start();
  weeklyTaskJob.start();
  attendanceCleanupJob.start();
  console.log('⏰ Cron jobs started');
};

module.exports = { startCronJobs };
