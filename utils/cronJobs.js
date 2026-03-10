const cron = require('node-cron');
const db = require('../config/db');

/**
 * NOTE: Daily/weekly task regeneration crons have been removed.
 * Recurring tasks (daily/weekly) are now permanent single rows with status 'active'.
 * Users log completions via the task_completions table instead of creating new task rows.
 */

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
  attendanceCleanupJob.start();
  console.log('⏰ Cron jobs started');
};

module.exports = { startCronJobs };
