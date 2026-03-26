const cron = require('node-cron');
const db = require('../config/db');
const { getToday } = require('./timezone');

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
    const [[org]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
    const tz = (org && org.timezone) || 'UTC';
    const today = getToday(tz);
    await db.query(
      `UPDATE attendance_logs SET logout_time = '23:59:59'
       WHERE date = ? AND logout_time IS NULL`, [today]
    );
    console.log('[CRON] Attendance cleanup done');
  } catch (err) {
    console.error('[CRON] Attendance cleanup error:', err.message);
  }
}, { scheduled: false });

/**
 * Scheduled database backup - runs every minute to check if it's time.
 * Compares current HH:MM with the scheduled_time in backup_settings.
 */
let lastBackupDate = null; // Prevent duplicate runs on the same day

const scheduledBackupJob = cron.schedule('* * * * *', async () => {
  try {
    const [[settings]] = await db.query('SELECT scheduled_time FROM backup_settings WHERE id = 1');
    if (!settings || !settings.scheduled_time) return;

    const now = new Date();
    const currentHHMM = now.toTimeString().substring(0, 5); // "HH:MM"
    const scheduledHHMM = settings.scheduled_time.substring(0, 5);
    const todayStr = now.toISOString().split('T')[0];

    if (currentHHMM === scheduledHHMM && lastBackupDate !== todayStr) {
      lastBackupDate = todayStr;
      console.log('[CRON] Starting scheduled database backup...');
      const backupService = require('../services/backupService');
      await backupService.createBackup(null, 'scheduled');
      console.log('[CRON] Scheduled backup completed');
    }
  } catch (err) {
    console.error('[CRON] Scheduled backup error:', err.message);
  }
}, { scheduled: false });

const startCronJobs = () => {
  attendanceCleanupJob.start();
  scheduledBackupJob.start();
  console.log('⏰ Cron jobs started');
};

module.exports = { startCronJobs };
