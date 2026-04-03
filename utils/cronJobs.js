const cron = require('node-cron');
const db = require('../config/db');
const { getToday, getNow } = require('./timezone');
const ChatModel = require('../models/Chat');

/**
 * NOTE: Daily/weekly task regeneration crons have been removed.
 * Recurring tasks (daily/weekly) are now permanent single rows with status 'active'.
 * Users log completions via the task_completions table instead of creating new task rows.
 */

/**
 * Auto-logout attendance cleanup - runs at 11:59 PM in LOCAL org timezone
 */
let attendanceCleanupJob = null;

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

/**
 * System chat reminder — runs every 15 minutes.
 * Sends a system message listing pending tasks to users
 * who are 2 hours before their shift end time.
 */
const sentReminders = {}; // Track: { "userId-date": true }

const taskReminderJob = cron.schedule('*/15 * * * *', async () => {
  try {
    const [[org]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
    const tz = (org && org.timezone) || 'UTC';
    const today = getToday(tz);

    // Get all active LOCAL users with shift info
    const [users] = await db.query(
      `SELECT u.id, u.name, u.shift_start, u.shift_hours, u.weekly_off_day
       FROM users u
       JOIN roles r ON u.role_id = r.id
       JOIN organizations o ON u.organization_id = o.id
       WHERE u.is_active = 1 AND o.org_type = 'LOCAL' AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
         AND u.shift_start IS NOT NULL AND u.shift_hours IS NOT NULL`
    );

    // Current time in org timezone
    const now = new Date(getNow(tz));
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });

    for (const user of users) {
      // Skip if weekly off
      if (user.weekly_off_day === dayName) continue;

      // Skip if already sent today
      const key = `${user.id}-${today}`;
      if (sentReminders[key]) continue;

      // Calculate shift end in minutes from midnight
      const [sh, sm] = user.shift_start.split(':').map(Number);
      const shiftStartMin = sh * 60 + (sm || 0);
      const shiftHours = parseFloat(user.shift_hours) || 8;
      let shiftEndMin = shiftStartMin + Math.round(shiftHours * 60);
      // Handle overnight shifts (shift_end > 1440 means next day)
      // For reminder, only trigger if we're within the same calendar day portion
      if (shiftEndMin > 1440) shiftEndMin = 1440; // cap at midnight for same-day check

      const reminderMin = shiftEndMin - 120; // 2 hours before shift end

      // Check if current time is within the reminder window (±15 min of the 2hr mark)
      if (nowMinutes < reminderMin || nowMinutes > reminderMin + 15) continue;

      // Get incomplete tasks for today
      const [pendingTasks] = await db.query(
        `SELECT t.id, t.title, t.type, t.recurrence_pattern
         FROM tasks t
         WHERE t.is_deleted = 0 AND t.assigned_to = ?
           AND (
             (t.type = 'recurring' AND t.status = 'active'
               AND NOT EXISTS (
                 SELECT 1 FROM task_completions tc
                 WHERE tc.task_id = t.id AND tc.user_id = ? AND tc.completion_date = ? AND tc.completed_at IS NOT NULL
               )
             )
             OR (t.type = 'once' AND t.status IN ('pending', 'in_progress')
               AND (t.due_date = ? OR (t.due_date IS NULL AND DATE(t.created_at) = ?))
             )
           )
         ORDER BY t.title`,
        [user.id, user.id, today, today, today]
      );

      // Also check fallback tasks (where user is secondary/tertiary and effective doer today)
      // Skip for now — primary assigned tasks are the main concern

      if (pendingTasks.length === 0) {
        sentReminders[key] = true;
        continue;
      }

      // Build the reminder message
      let msg = `You have ${pendingTasks.length} incomplete task${pendingTasks.length > 1 ? 's' : ''} for today (${today}):\n\n`;
      pendingTasks.forEach((t, i) => {
        const typeLabel = t.type === 'recurring' ? `${t.recurrence_pattern || 'recurring'}` : 'one-time';
        msg += `${i + 1}. ${t.title} (${typeLabel})\n`;
      });
      msg += `\nYour shift ends in ~2 hours. Please complete them before signing off.`;

      // Send system message
      await ChatModel.sendSystemMessage(user.id, msg);
      sentReminders[key] = true;

      // Emit via socket so user sees it in real-time
      try {
        const { getIO } = require('../config/socket');
        const io = getIO();
        if (io) {
          io.to(`user:${user.id}`).emit('chat:system', { type: 'task_reminder' });
        }
      } catch (e) { /* socket not ready */ }

      console.log(`[CRON] Task reminder sent to ${user.name} (${pendingTasks.length} tasks)`);
    }
  } catch (err) {
    console.error('[CRON] Task reminder error:', err.message);
  }
}, { scheduled: false });

/**
 * Task deadline approaching — runs every 15 minutes.
 * Notifies users about one-time tasks due within the next hour.
 */
const deadlineAlertSent = {}; // "taskId-userId" => true

const deadlineAlertJob = cron.schedule('*/15 * * * *', async () => {
  try {
    const [[org]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
    const tz = (org && org.timezone) || 'UTC';
    const today = getToday(tz);

    // Get recurring tasks with deadline_time approaching within next hour
    const now = new Date(getNow(tz));
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const targetMin = nowMin + 60; // 1 hour from now

    const [tasks] = await db.query(
      `SELECT t.id, t.title, t.assigned_to, t.deadline_time, t.type, u.name as user_name
       FROM tasks t
       JOIN users u ON t.assigned_to = u.id
       WHERE t.is_deleted = 0 AND t.assigned_to IS NOT NULL
         AND t.deadline_time IS NOT NULL
         AND (
           (t.type = 'recurring' AND t.status = 'active')
           OR (t.type = 'once' AND t.status IN ('pending', 'in_progress') AND t.due_date = ?)
         )`, [today]
    );

    for (const t of tasks) {
      const key = `${t.id}-${t.assigned_to}-${today}`;
      if (deadlineAlertSent[key]) continue;

      const [dH, dM] = t.deadline_time.split(':').map(Number);
      const deadlineMin = dH * 60 + (dM || 0);

      // Check if deadline is within next 60 minutes (and not already past)
      if (deadlineMin > nowMin && deadlineMin <= targetMin) {
        // Check if task is not yet completed today
        if (t.type === 'recurring') {
          const [[done]] = await db.query(
            'SELECT id FROM task_completions WHERE task_id = ? AND user_id = ? AND completion_date = ? AND completed_at IS NOT NULL',
            [t.id, t.assigned_to, today]
          );
          if (done) continue;
        }

        const minsLeft = deadlineMin - nowMin;
        await ChatModel.sendSystemMessage(t.assigned_to,
          `⏰ Deadline approaching: "${t.title}"\nDue in ${minsLeft} minutes. Please complete it before the deadline.`
        );
        deadlineAlertSent[key] = true;
        console.log(`[CRON] Deadline alert sent to ${t.user_name} for "${t.title}"`);
      }
    }
  } catch (err) {
    console.error('[CRON] Deadline alert error:', err.message);
  }
}, { scheduled: false });

/**
 * Task overdue alert — runs at 9:00 AM daily in LOCAL org timezone.
 * Notifies users about tasks they missed yesterday.
 */
let overdueAlertJob = null;
const overdueAlertHandler = async () => {
  try {
    const [[org]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
    const tz = (org && org.timezone) || 'UTC';
    const today = getToday(tz);
    const yesterday = new Date(new Date(today + 'T12:00:00').getTime() - 86400000).toISOString().split('T')[0];
    const dayName = new Date(yesterday + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });

    // Get active LOCAL users
    const [users] = await db.query(
      `SELECT u.id, u.name, u.weekly_off_day
       FROM users u JOIN roles r ON u.role_id = r.id JOIN organizations o ON u.organization_id = o.id
       WHERE u.is_active = 1 AND o.org_type = 'LOCAL' AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')`
    );

    for (const user of users) {
      if (user.weekly_off_day === dayName) continue;

      // Find recurring tasks that were assigned but not completed yesterday
      const [missed] = await db.query(
        `SELECT t.title FROM tasks t
         WHERE t.is_deleted = 0 AND t.assigned_to = ? AND t.type = 'recurring' AND t.status = 'active'
           AND NOT EXISTS (
             SELECT 1 FROM task_completions tc
             WHERE tc.task_id = t.id AND tc.user_id = ? AND tc.completion_date = ? AND tc.completed_at IS NOT NULL
           )`, [user.id, user.id, yesterday]
      );

      // Find one-time tasks due yesterday that weren't completed
      const [missedOnce] = await db.query(
        `SELECT title FROM tasks
         WHERE is_deleted = 0 AND assigned_to = ? AND type = 'once' AND due_date = ? AND status != 'completed'`,
        [user.id, yesterday]
      );

      const allMissed = [...missed, ...missedOnce];
      if (allMissed.length === 0) continue;

      let msg = `⚠️ You missed ${allMissed.length} task${allMissed.length > 1 ? 's' : ''} yesterday (${yesterday}):\n\n`;
      allMissed.forEach((t, i) => { msg += `${i + 1}. ${t.title}\n`; });
      msg += `\nPlease check with your manager if these need to be completed today.`;

      await ChatModel.sendSystemMessage(user.id, msg);
      console.log(`[CRON] Overdue alert sent to ${user.name} (${allMissed.length} tasks)`);
    }
  } catch (err) {
    console.error('[CRON] Overdue alert error:', err.message);
  }
};

/**
 * Daily end-of-day summary — runs every 15 minutes, triggers at shift end.
 */
const dailySummarySent = {}; // "userId-date" => true

const dailySummaryJob = cron.schedule('*/15 * * * *', async () => {
  try {
    const [[org]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
    const tz = (org && org.timezone) || 'UTC';
    const today = getToday(tz);
    const now = new Date(getNow(tz));
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const [users] = await db.query(
      `SELECT u.id, u.name, u.shift_start, u.shift_hours
       FROM users u JOIN roles r ON u.role_id = r.id JOIN organizations o ON u.organization_id = o.id
       WHERE u.is_active = 1 AND o.org_type = 'LOCAL' AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
         AND u.shift_start IS NOT NULL AND u.shift_hours IS NOT NULL`
    );

    for (const user of users) {
      const key = `summary-${user.id}-${today}`;
      if (dailySummarySent[key]) continue;

      const [sH, sM] = user.shift_start.split(':').map(Number);
      const shiftHours = parseFloat(user.shift_hours) || 8;
      let shiftEndMin = sH * 60 + (sM || 0) + Math.round(shiftHours * 60);
      if (shiftEndMin > 1440) shiftEndMin = 1440;

      // Trigger within 15 min after shift end
      if (nowMin < shiftEndMin || nowMin > shiftEndMin + 15) continue;

      // Count tasks done vs total
      const [[recurringTotal]] = await db.query(
        `SELECT COUNT(*) as cnt FROM tasks WHERE is_deleted = 0 AND assigned_to = ? AND type = 'recurring' AND status = 'active'`,
        [user.id]
      );
      const [[recurringDone]] = await db.query(
        `SELECT COUNT(*) as cnt FROM task_completions tc JOIN tasks t ON tc.task_id = t.id
         WHERE t.assigned_to = ? AND tc.user_id = ? AND tc.completion_date = ? AND tc.completed_at IS NOT NULL`,
        [user.id, user.id, today]
      );
      const [[onceTotal]] = await db.query(
        `SELECT COUNT(*) as cnt FROM tasks WHERE is_deleted = 0 AND assigned_to = ? AND type = 'once' AND (due_date = ? OR (due_date IS NULL AND DATE(created_at) = ?)) AND status IN ('pending', 'in_progress', 'completed')`,
        [user.id, today, today]
      );
      const [[onceDone]] = await db.query(
        `SELECT COUNT(*) as cnt FROM tasks WHERE is_deleted = 0 AND assigned_to = ? AND type = 'once' AND status = 'completed' AND DATE(completed_at) = ?`,
        [user.id, today]
      );

      const total = (recurringTotal.cnt || 0) + (onceTotal.cnt || 0);
      const done = (recurringDone.cnt || 0) + (onceDone.cnt || 0);
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;

      // Get total active time from attendance
      const [[timeData]] = await db.query(
        `SELECT SEC_TO_TIME(SUM(TIME_TO_SEC(TIMEDIFF(COALESCE(logout_time, NOW()), login_time)))) as total_time
         FROM attendance_logs WHERE user_id = ? AND date = ?`,
        [user.id, today]
      );
      const activeTime = timeData?.total_time ? timeData.total_time.substring(0, 5) + 'h' : '0h';

      let emoji = pct === 100 ? '🎉' : pct >= 75 ? '👍' : pct >= 50 ? '📊' : '⚠️';

      let msg = `${emoji} Daily Summary — ${today}\n\n`;
      msg += `Tasks: ${done}/${total} completed (${pct}%)\n`;
      msg += `Active Time: ${activeTime}\n`;
      if (pct === 100) msg += `\nPerfect day! All tasks completed. Great work!`;
      else if (done === 0 && total > 0) msg += `\nNo tasks completed today. Please check with your manager.`;
      else msg += `\n${total - done} task${total - done > 1 ? 's' : ''} remaining.`;

      await ChatModel.sendSystemMessage(user.id, msg);
      dailySummarySent[key] = true;
      console.log(`[CRON] Daily summary sent to ${user.name} (${done}/${total})`);
    }
  } catch (err) {
    console.error('[CRON] Daily summary error:', err.message);
  }
}, { scheduled: false });

/**
 * Weekly performance digest — runs every Monday at 9:30 AM in LOCAL org timezone.
 */
let weeklyDigestJob = null;
const weeklyDigestHandler = async () => {
  try {
    const [[org]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
    const tz = (org && org.timezone) || 'UTC';
    const today = getToday(tz);
    const weekAgo = new Date(new Date(today + 'T12:00:00').getTime() - 7 * 86400000).toISOString().split('T')[0];

    const [users] = await db.query(
      `SELECT u.id, u.name
       FROM users u JOIN roles r ON u.role_id = r.id JOIN organizations o ON u.organization_id = o.id
       WHERE u.is_active = 1 AND o.org_type = 'LOCAL' AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')`
    );

    for (const user of users) {
      // Completions this week
      const [[recurringDone]] = await db.query(
        `SELECT COUNT(*) as cnt FROM task_completions tc JOIN tasks t ON tc.task_id = t.id
         WHERE t.assigned_to = ? AND tc.user_id = ? AND tc.completion_date >= ? AND tc.completion_date <= ? AND tc.completed_at IS NOT NULL`,
        [user.id, user.id, weekAgo, today]
      );
      const [[onceDone]] = await db.query(
        `SELECT COUNT(*) as cnt FROM tasks WHERE is_deleted = 0 AND assigned_to = ? AND type = 'once' AND status = 'completed' AND DATE(completed_at) >= ? AND DATE(completed_at) <= ?`,
        [user.id, weekAgo, today]
      );
      const totalDone = (recurringDone.cnt || 0) + (onceDone.cnt || 0);

      // Attendance: days present & total active hours
      const [[attendData]] = await db.query(
        `SELECT COUNT(DISTINCT date) as days,
                SEC_TO_TIME(SUM(TIME_TO_SEC(TIMEDIFF(COALESCE(logout_time, NOW()), login_time)))) as total_time
         FROM attendance_logs WHERE user_id = ? AND date >= ? AND date <= ?`,
        [user.id, weekAgo, today]
      );
      const daysPresent = attendData?.days || 0;
      const totalHours = attendData?.total_time ? attendData.total_time.substring(0, 5) + 'h' : '0h';

      // Late logins this week
      const [[lateCount]] = await db.query(
        `SELECT COUNT(*) as cnt FROM attendance_logs WHERE user_id = ? AND date >= ? AND date <= ? AND late_login_reason IS NOT NULL AND is_manual = 0`,
        [user.id, weekAgo, today]
      );

      // Rewards earned
      const [[rewards]] = await db.query(
        `SELECT COALESCE(SUM(reward_amount), 0) as total FROM rewards_ledger WHERE user_id = ? AND created_at >= ? AND created_at <= ?`,
        [user.id, weekAgo + ' 00:00:00', today + ' 23:59:59']
      );

      let msg = `📈 Weekly Performance Digest (${weekAgo} to ${today})\n\n`;
      msg += `Tasks completed: ${totalDone}\n`;
      msg += `Days present: ${daysPresent}/7\n`;
      msg += `Total active time: ${totalHours}\n`;
      msg += `Late logins: ${lateCount.cnt || 0}\n`;
      if (rewards.total > 0) msg += `Rewards earned: ${rewards.total} pts\n`;
      msg += `\n`;
      if (lateCount.cnt === 0 && daysPresent >= 5) msg += `Great punctuality this week! 🎯`;
      else if (totalDone > 20) msg += `Impressive output! Keep it up! 💪`;
      else msg += `Keep pushing — every task counts! 🚀`;

      await ChatModel.sendSystemMessage(user.id, msg);
      console.log(`[CRON] Weekly digest sent to ${user.name}`);
    }
  } catch (err) {
    console.error('[CRON] Weekly digest error:', err.message);
  }
};

const startCronJobs = async () => {
  // Load LOCAL org timezone from DB for fixed-schedule crons
  let orgTz = 'UTC';
  try {
    const [[org]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
    if (org && org.timezone) orgTz = org.timezone;
  } catch (e) {
    console.warn('[CRON] Could not load org timezone, using UTC:', e.message);
  }

  // Create timezone-aware cron schedules for fixed-time jobs
  attendanceCleanupJob = cron.schedule('59 23 * * *', async () => {
    try {
      const tz = orgTz;
      const today = getToday(tz);
      await db.query(
        `UPDATE attendance_logs SET logout_time = '23:59:59', logout_reason = 'Auto - Session Expired'
         WHERE date = ? AND logout_time IS NULL`, [today]
      );
      console.log('[CRON] Attendance cleanup done');
    } catch (err) {
      console.error('[CRON] Attendance cleanup error:', err.message);
    }
  }, { timezone: orgTz });

  overdueAlertJob = cron.schedule('0 9 * * *', overdueAlertHandler, { timezone: orgTz });
  weeklyDigestJob = cron.schedule('30 9 * * 1', weeklyDigestHandler, { timezone: orgTz });

  // These jobs already self-check timing via getNow()/getToday(), safe with any server TZ
  scheduledBackupJob.start();
  taskReminderJob.start();
  deadlineAlertJob.start();
  dailySummaryJob.start();

  console.log(`⏰ Cron jobs started (timezone: ${orgTz}) — attendance, backup, reminders, deadline, overdue, summary, weekly`);
};

module.exports = { startCronJobs };
