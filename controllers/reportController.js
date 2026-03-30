const TaskService = require('../services/taskService');
const RewardModel = require('../models/Reward');
const db = require('../config/db');
const { ApiResponse } = require('../utils/response');
const { getToday, formatTime, getTimezoneOffsetString, isScheduledForDate } = require('../utils/timezone');
const DashboardService = require('../services/dashboardService');

class ReportController {
  static async completionReport(req, res) {
    try {
      const todayDate = getToday(req.user.org_timezone || 'UTC');
      const [stats, perUser] = await Promise.all([
        TaskService.getTaskStats(null, null, todayDate),
        TaskService.getCompletionPerUser()
      ]);

      // Monthly breakdown (dual-source: adhoc from tasks + recurring from task_completions)
      const [adhocMonthly] = await db.query(
        `SELECT MONTH(completed_at) as month, YEAR(completed_at) as year, COUNT(*) as count
         FROM tasks WHERE status = 'completed' AND is_deleted = 0 AND type = 'once'
         AND completed_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
         GROUP BY year, month ORDER BY year, month`
      );
      const [recurringMonthly] = await db.query(
        `SELECT MONTH(tc.completion_date) as month, YEAR(tc.completion_date) as year, COUNT(*) as count
         FROM task_completions tc
         JOIN tasks t ON tc.task_id = t.id
         WHERE t.is_deleted = 0
         AND tc.completion_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
         GROUP BY year, month ORDER BY year, month`
      );

      // Merge monthly data
      const monthlyMap = new Map();
      adhocMonthly.forEach(r => {
        const key = `${r.year}-${r.month}`;
        monthlyMap.set(key, { month: r.month, year: r.year, count: parseInt(r.count) });
      });
      recurringMonthly.forEach(r => {
        const key = `${r.year}-${r.month}`;
        const existing = monthlyMap.get(key);
        if (existing) {
          existing.count += parseInt(r.count);
        } else {
          monthlyMap.set(key, { month: r.month, year: r.year, count: parseInt(r.count) });
        }
      });
      const monthly = [...monthlyMap.values()].sort((a, b) => a.year - b.year || a.month - b.month);

      res.render('reports/completion', {
        title: 'Completion Report',
        stats,
        perUser,
        monthly
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  static async rewardReport(req, res) {
    try {
      const [summary, perUser, { rows: ledger }] = await Promise.all([
        RewardModel.getGlobalSummary(),
        RewardModel.getPerUserSummary(),
        RewardModel.getAll({ page: 1, limit: 50 })
      ]);

      res.render('reports/rewards', {
        title: 'Reward Report',
        summary,
        perUser,
        ledger
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  static async attendanceReport(req, res) {
    try {
      // Always use LOCAL org timezone for attendance (data belongs to LOCAL team)
      const [orgs] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      const tz = (orgs.length && orgs[0].timezone) || req.user.org_timezone || 'UTC';
      const today = getToday(tz);
      const month = req.query.month || today.slice(0, 7); // 'YYYY-MM'
      const [yearStr, monStr] = month.split('-');
      const year = parseInt(yearStr);
      const mon = parseInt(monStr);
      const lastDay = new Date(year, mon, 0).getDate();
      const startDate = `${month}-01`;
      const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

      const tzOffset = getTimezoneOffsetString(tz);

      const [dailyLogs, weeklyStats, activeUsers, attendanceDays, leaveData] = await Promise.all([
        db.query(
          `SELECT al.*, u.name as user_name, u.email, u.shift_start, u.shift_hours,
                  DATE_FORMAT(CONVERT_TZ(al.login_time, '+00:00', ?), '%h:%i %p') as loginFormatted,
                  DATE_FORMAT(CONVERT_TZ(al.logout_time, '+00:00', ?), '%h:%i %p') as logoutFormatted,
                  TIMEDIFF(COALESCE(al.logout_time, NOW()), al.login_time) as duration
           FROM attendance_logs al
           JOIN users u ON al.user_id = u.id
           JOIN roles r ON u.role_id = r.id
           WHERE al.date = ? AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
           ORDER BY al.login_time`, [tzOffset, tzOffset, today]
        ),
        db.query(
          `SELECT u.id, u.name, COUNT(al.id) as days_present
           FROM users u
           JOIN roles r ON u.role_id = r.id
           LEFT JOIN attendance_logs al ON u.id = al.user_id
             AND al.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
           WHERE u.is_active = 1 AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
           GROUP BY u.id ORDER BY days_present DESC`
        ),
        db.query(
          `SELECT u.id, u.name, u.weekly_off_day FROM users u
           JOIN organizations o ON u.organization_id = o.id
           JOIN roles r ON u.role_id = r.id
           WHERE u.is_active = 1 AND o.org_type = 'LOCAL' AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
           ORDER BY u.name`
        ),
        db.query(
          `SELECT user_id, date, DATE_FORMAT(CONVERT_TZ(login_time, '+00:00', ?), '%h:%i %p') as login_formatted FROM attendance_logs
           WHERE date >= ? AND date <= ?`,
          [tzOffset, startDate, endDate]
        ),
        db.query(
          `SELECT user_id, from_date, to_date, status FROM leave_requests
           WHERE from_date <= ? AND to_date >= ? AND status IN ('approved', 'pending')`,
          [endDate, startDate]
        )
      ]);

      // Build calendar data
      const attendanceSet = new Set();
      const loginTimeMap = new Map();
      attendanceDays[0].forEach(row => {
        const d = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0];
        attendanceSet.add(`${row.user_id}-${d}`);
        if (row.login_formatted) {
          loginTimeMap.set(`${row.user_id}-${d}`, row.login_formatted);
        }
      });

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      const calendarData = {};
      activeUsers[0].forEach(u => {
        calendarData[u.id] = {};
        for (let d = 1; d <= lastDay; d++) {
          const dateObj = new Date(year, mon - 1, d);
          const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const dayName = dayNames[dateObj.getDay()];

          if (dateStr > today) {
            // Check if there's a pending/approved leave for future
            let futureStatus = 'future';
            for (const lv of leaveData[0]) {
              const from = lv.from_date instanceof Date ? lv.from_date.toISOString().split('T')[0] : String(lv.from_date).split('T')[0];
              const to = lv.to_date instanceof Date ? lv.to_date.toISOString().split('T')[0] : String(lv.to_date).split('T')[0];
              if (lv.user_id === u.id && dateStr >= from && dateStr <= to) {
                futureStatus = lv.status === 'approved' ? 'approved_leave' : 'pending_leave';
                break;
              }
            }
            calendarData[u.id][d] = futureStatus;
          } else if (dayName === u.weekly_off_day) {
            calendarData[u.id][d] = 'weekoff';
          } else {
            // Check leaves
            let onLeave = false;
            for (const lv of leaveData[0]) {
              const from = lv.from_date instanceof Date ? lv.from_date.toISOString().split('T')[0] : String(lv.from_date).split('T')[0];
              const to = lv.to_date instanceof Date ? lv.to_date.toISOString().split('T')[0] : String(lv.to_date).split('T')[0];
              if (lv.user_id === u.id && dateStr >= from && dateStr <= to) {
                calendarData[u.id][d] = lv.status === 'approved' ? 'approved_leave' : 'pending_leave';
                onLeave = true;
                break;
              }
            }
            if (!onLeave) {
              calendarData[u.id][d] = attendanceSet.has(`${u.id}-${dateStr}`) ? 'present' : 'absent';
            }
          }
        }
      });

      // Prev/next month
      const prevMonth = mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, '0')}`;
      const nextMonth = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, '0')}`;

      res.render('attendance/index', {
        title: 'Attendance Dashboard',
        dailyLogs: dailyLogs[0],
        weeklyStats: weeklyStats[0],
        today,
        calendarUsers: activeUsers[0],
        calendarData,
        loginTimeMap: Object.fromEntries(loginTimeMap),
        month,
        year,
        mon,
        lastDay,
        prevMonth,
        nextMonth,
        timezone: tz
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }
  /**
   * Personal attendance page for LOCAL_USER
   */
  static async myAttendance(req, res) {
    try {
      const userId = req.user.id;
      const tz = req.user.org_timezone || 'UTC';
      const tzOffset = getTimezoneOffsetString(tz);
      const today = getToday(tz);
      const month = req.query.month || today.slice(0, 7);
      const [yearStr, monStr] = month.split('-');
      const year = parseInt(yearStr);
      const mon = parseInt(monStr);
      const lastDay = new Date(year, mon, 0).getDate();
      const startDate = `${month}-01`;
      const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

      // Fetch user shift info, monthly logs, and today's log
      const [[userInfo], [monthlyLogs], [todayLog]] = await Promise.all([
        db.query(
          `SELECT shift_start, shift_hours, weekly_off_day FROM users WHERE id = ?`, [userId]
        ),
        db.query(
          `SELECT date,
                  DATE_FORMAT(CONVERT_TZ(login_time, '+00:00', ?), '%h:%i %p') as loginFormatted,
                  DATE_FORMAT(CONVERT_TZ(logout_time, '+00:00', ?), '%h:%i %p') as logoutFormatted,
                  TIMEDIFF(COALESCE(logout_time, NOW()), login_time) as duration
           FROM attendance_logs
           WHERE user_id = ? AND date >= ? AND date <= ?
           ORDER BY date DESC`,
          [tzOffset, tzOffset, userId, startDate, endDate]
        ),
        db.query(
          `SELECT DATE_FORMAT(CONVERT_TZ(login_time, '+00:00', ?), '%h:%i %p') as loginFormatted,
                  DATE_FORMAT(CONVERT_TZ(logout_time, '+00:00', ?), '%h:%i %p') as logoutFormatted,
                  TIMEDIFF(COALESCE(logout_time, NOW()), login_time) as duration
           FROM attendance_logs
           WHERE user_id = ? AND date = ?`,
          [tzOffset, tzOffset, userId, today]
        )
      ]);

      const shift = userInfo[0] || { shift_start: '10:00:00', shift_hours: 8.5, weekly_off_day: 'Sunday' };
      const ss = shift.shift_start ? shift.shift_start.substring(0, 5) : '10:00';
      const sh = parseFloat(shift.shift_hours || 8.5);

      // Count stats for the month
      const totalPresent = monthlyLogs.length;
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      // Build calendar data
      const calendarData = {};
      const logMap = {};
      monthlyLogs.forEach(row => {
        const d = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0];
        logMap[d] = row;
      });

      // Fetch leave data
      const [leaveData] = await db.query(
        `SELECT from_date, to_date, status FROM leave_requests
         WHERE user_id = ? AND from_date <= ? AND to_date >= ? AND status IN ('approved', 'pending')`,
        [userId, endDate, startDate]
      );

      const leaveSet = new Set();
      leaveData.forEach(l => {
        const from = new Date(l.from_date);
        const to = new Date(l.to_date);
        for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
          leaveSet.add(d.toISOString().split('T')[0] + '-' + l.status);
        }
      });

      for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dateObj = new Date(year, mon - 1, d);
        const dayName = dayNames[dateObj.getDay()];
        const isOff = dayName === shift.weekly_off_day;
        const log = logMap[dateStr];
        let status = 'absent';
        if (dateStr > today) status = 'future';
        else if (isOff) status = 'off';
        else if (log) status = 'present';
        else if (leaveSet.has(dateStr + '-approved')) status = 'leave';
        else if (leaveSet.has(dateStr + '-pending')) status = 'pending_leave';

        calendarData[d] = { status, dayName, log, isOff };
      }

      const prevMonth = mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, '0')}`;
      const nextMonth = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, '0')}`;

      res.render('attendance/my', {
        title: 'My Attendance',
        today,
        todayLog: todayLog[0] || null,
        shift: { start: ss, hours: sh, offDay: shift.weekly_off_day },
        calendarData,
        totalPresent,
        month,
        year,
        mon,
        lastDay,
        prevMonth,
        nextMonth,
        timezone: tz
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }
  /**
   * Task Completion Calendar — monthly grid of done/total per user per day
   */
  static async taskCompletionReport(req, res) {
    try {
      const tz = req.user.org_timezone || 'UTC';
      const today = getToday(tz);
      const month = req.query.month || today.slice(0, 7);
      const [yearStr, monStr] = month.split('-');
      const year = parseInt(yearStr);
      const mon = parseInt(monStr);
      const lastDay = new Date(year, mon, 0).getDate();
      const startDate = `${month}-01`;
      const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;

      // Get all active LOCAL users
      const [users] = await db.query(
        `SELECT u.id, u.name, u.weekly_off_day FROM users u
         JOIN organizations o ON u.organization_id = o.id
         JOIN roles r ON u.role_id = r.id
         WHERE u.is_active = 1 AND o.org_type = 'LOCAL' AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
         ORDER BY u.name`
      );

      // Get all recurring tasks per user
      const [recurringTasks] = await db.query(
        `SELECT id, assigned_to, recurrence_pattern, recurrence_days, recurrence_end_date, type, status
         FROM tasks
         WHERE type = 'recurring' AND status = 'active' AND is_deleted = 0
           AND assigned_to IN (${users.map(() => '?').join(',')})`,
        users.map(u => u.id)
      );

      // Get all task completions for the month
      const [completions] = await db.query(
        `SELECT tc.task_id, tc.user_id, tc.completion_date
         FROM task_completions tc
         JOIN tasks t ON tc.task_id = t.id
         WHERE tc.completion_date >= ? AND tc.completion_date <= ?
           AND t.is_deleted = 0`,
        [startDate, endDate]
      );

      // Get one-time tasks relevant to the month
      const [onceTasks] = await db.query(
        `SELECT id, assigned_to, status, due_date, created_at, completed_at
         FROM tasks
         WHERE type = 'once' AND is_deleted = 0 AND status != 'deactivated'
           AND assigned_to IN (${users.map(() => '?').join(',')})
           AND (
             (due_date >= ? AND due_date <= ?)
             OR (DATE(created_at) >= ? AND DATE(created_at) <= ?)
             OR (DATE(completed_at) >= ? AND DATE(completed_at) <= ?)
           )`,
        [...users.map(u => u.id), startDate, endDate, startDate, endDate, startDate, endDate]
      );

      // Build completion map: completionSet has "taskId-date"
      const completionSet = new Set();
      completions.forEach(c => {
        const d = c.completion_date instanceof Date ? c.completion_date.toISOString().split('T')[0] : String(c.completion_date).split('T')[0];
        completionSet.add(`${c.task_id}-${d}`);
      });

      // Build calendar grid data
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const gridData = {};

      users.forEach(u => {
        gridData[u.id] = {};
        const userRecurring = recurringTasks.filter(t => t.assigned_to === u.id);
        const userOnce = onceTasks.filter(t => t.assigned_to === u.id);

        for (let d = 1; d <= lastDay; d++) {
          const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const dateObj = new Date(year, mon - 1, d);
          const dayName = dayNames[dateObj.getDay()];
          const isOff = dayName === u.weekly_off_day;
          const isFuture = dateStr > today;

          if (isOff || isFuture) {
            gridData[u.id][d] = { total: 0, done: 0, isOff, isFuture };
            continue;
          }

          let total = 0;
          let done = 0;

          // Count recurring tasks scheduled for this day
          userRecurring.forEach(t => {
            if (isScheduledForDate(t, dateStr)) {
              total++;
              if (completionSet.has(`${t.id}-${dateStr}`)) done++;
            }
          });

          // Count one-time tasks for this day (due on this date or created on this date)
          userOnce.forEach(t => {
            const dueDate = t.due_date ? (t.due_date instanceof Date ? t.due_date.toISOString().split('T')[0] : String(t.due_date).split('T')[0]) : null;
            const createdDate = t.created_at ? new Date(t.created_at).toISOString().split('T')[0] : null;
            const completedDate = t.completed_at ? new Date(t.completed_at).toISOString().split('T')[0] : null;

            if (dueDate === dateStr || createdDate === dateStr) {
              total++;
              if (t.status === 'completed' && completedDate) done++;
            }
          });

          gridData[u.id][d] = { total, done, isOff: false, isFuture: false };
        }
      });

      const prevMonth = mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, '0')}`;
      const nextMonth = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, '0')}`;

      res.render('reports/task-completion', {
        title: 'Task Completion Report',
        users,
        gridData,
        today,
        month,
        year,
        mon,
        lastDay,
        prevMonth,
        nextMonth
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  /**
   * API: Get task details for a specific user on a specific date
   */
  static async taskDayDetail(req, res) {
    try {
      const { userId, date } = req.query;
      if (!userId || !date) return ApiResponse.error(res, 'userId and date required', 400);

      const tasks = await DashboardService.getTasksForDate(parseInt(userId), date, date);

      // Attach schedule check for recurring
      const result = tasks.map(t => ({
        id: t.id,
        title: t.title,
        type: t.type,
        priority: t.priority,
        status: t.type === 'recurring' ? (t.is_completed_for_date ? 'completed' : 'pending') : t.status,
        is_completed: t.type === 'recurring' ? !!t.is_completed_for_date : t.status === 'completed'
      })).filter(t => {
        if (t.type === 'recurring') return isScheduledForDate(t, date) || t.is_completed;
        return true;
      });

      // Get user name
      const [[user]] = await db.query('SELECT name FROM users WHERE id = ?', [userId]);

      return ApiResponse.success(res, { tasks: result, userName: user ? user.name : '', date });
    } catch (err) {
      return ApiResponse.error(res, err.message, 500);
    }
  }

  /**
   * Reports Hub — index page linking to all reports
   */
  static async reportsIndex(req, res) {
    res.render('reports/index', { title: 'Reports' });
  }

  /**
   * Overdue / Late Tasks Report
   */
  static async overdueReport(req, res) {
    try {
      const tz = req.user.org_timezone || 'UTC';
      const today = getToday(tz);

      // Get all active LOCAL users
      const [users] = await db.query(
        `SELECT u.id, u.name, u.weekly_off_day FROM users u
         JOIN organizations o ON u.organization_id = o.id
         JOIN roles r ON u.role_id = r.id
         WHERE u.is_active = 1 AND o.org_type = 'LOCAL' AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
         ORDER BY u.name`
      );

      // Overdue one-time tasks (past due_date, not completed)
      const [overdueOnce] = await db.query(
        `SELECT t.id, t.title, t.priority, t.due_date, t.status, u.name as user_name,
                DATEDIFF(?, t.due_date) as days_late
         FROM tasks t
         JOIN users u ON t.assigned_to = u.id
         WHERE t.type = 'once' AND t.is_deleted = 0
           AND t.status IN ('pending', 'in_progress')
           AND t.due_date IS NOT NULL AND t.due_date < ?
         ORDER BY days_late DESC`,
        [today, today]
      );

      // Missed recurring tasks (last 7 days)
      const sevenDaysAgo = new Date(new Date(today + 'T12:00:00').getTime() - 7 * 86400000).toISOString().split('T')[0];

      const [recurringTasks] = await db.query(
        `SELECT t.id, t.title, t.assigned_to, t.recurrence_pattern, t.recurrence_days, t.recurrence_end_date,
                u.name as user_name, u.weekly_off_day
         FROM tasks t
         JOIN users u ON t.assigned_to = u.id
         WHERE t.type = 'recurring' AND t.status = 'active' AND t.is_deleted = 0
           AND t.assigned_to IN (${users.map(() => '?').join(',')})`,
        users.map(u => u.id)
      );

      const [completions] = await db.query(
        `SELECT tc.task_id, tc.completion_date
         FROM task_completions tc
         JOIN tasks t ON tc.task_id = t.id
         WHERE tc.completion_date >= ? AND tc.completion_date <= ? AND t.is_deleted = 0`,
        [sevenDaysAgo, today]
      );

      const completionSet = new Set();
      completions.forEach(c => {
        const d = c.completion_date instanceof Date ? c.completion_date.toISOString().split('T')[0] : String(c.completion_date).split('T')[0];
        completionSet.add(`${c.task_id}-${d}`);
      });

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const missedRecurring = [];

      for (let i = 1; i <= 7; i++) {
        const dateObj = new Date(new Date(today + 'T12:00:00').getTime() - i * 86400000);
        const dateStr = dateObj.toISOString().split('T')[0];
        const dayName = dayNames[dateObj.getDay()];

        recurringTasks.forEach(t => {
          if (dayName === t.weekly_off_day) return;
          if (isScheduledForDate(t, dateStr) && !completionSet.has(`${t.id}-${dateStr}`)) {
            missedRecurring.push({
              id: t.id,
              title: t.title,
              user_name: t.user_name,
              missed_date: dateStr,
              recurrence_pattern: t.recurrence_pattern
            });
          }
        });
      }

      // Per-user summary
      const userMap = new Map();
      users.forEach(u => userMap.set(u.id, { id: u.id, name: u.name, overdue_once: 0, missed_recurring: 0 }));
      overdueOnce.forEach(t => {
        const userId = users.find(u => u.name === t.user_name)?.id;
        if (userId && userMap.has(userId)) userMap.get(userId).overdue_once++;
      });
      missedRecurring.forEach(t => {
        const userId = users.find(u => u.name === t.user_name)?.id;
        if (userId && userMap.has(userId)) userMap.get(userId).missed_recurring++;
      });
      const perUser = [...userMap.values()].filter(u => u.overdue_once + u.missed_recurring > 0)
        .sort((a, b) => (b.overdue_once + b.missed_recurring) - (a.overdue_once + a.missed_recurring));

      const affectedIds = new Set();
      overdueOnce.forEach(t => { const u = users.find(u => u.name === t.user_name); if (u) affectedIds.add(u.id); });
      missedRecurring.forEach(t => { const u = users.find(u => u.name === t.user_name); if (u) affectedIds.add(u.id); });

      res.render('reports/overdue', {
        title: 'Overdue Tasks',
        overdueOnce,
        missedRecurring,
        perUser,
        usersWithOverdue: affectedIds.size,
        totalUsers: users.length
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  /**
   * Punctuality Report — login time vs shift start
   */
  static async punctualityReport(req, res) {
    try {
      const [orgs] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      const tz = (orgs.length && orgs[0].timezone) || req.user.org_timezone || 'UTC';
      const today = getToday(tz);
      const month = req.query.month || today.slice(0, 7);
      const [yearStr, monStr] = month.split('-');
      const year = parseInt(yearStr);
      const mon = parseInt(monStr);
      const lastDay = new Date(year, mon, 0).getDate();
      const startDate = `${month}-01`;
      const endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
      const tzOffset = getTimezoneOffsetString(tz);

      // Get active LOCAL users with shift info
      const [activeUsers] = await db.query(
        `SELECT u.id, u.name, u.shift_start, u.shift_hours FROM users u
         JOIN organizations o ON u.organization_id = o.id
         JOIN roles r ON u.role_id = r.id
         WHERE u.is_active = 1 AND o.org_type = 'LOCAL' AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
         ORDER BY u.name`
      );

      // Get attendance logs for the month with local login time
      const [logs] = await db.query(
        `SELECT al.user_id, al.date,
                TIME(CONVERT_TZ(al.login_time, '+00:00', ?)) as local_login_time
         FROM attendance_logs al
         WHERE al.date >= ? AND al.date <= ?`,
        [tzOffset, startDate, endDate]
      );

      // Build per-user punctuality data
      const userLogMap = new Map();
      logs.forEach(l => {
        if (!userLogMap.has(l.user_id)) userLogMap.set(l.user_id, []);
        userLogMap.get(l.user_id).push(l);
      });

      let totalOnTime = 0, totalLate = 0, totalDelayMin = 0, totalDelayCount = 0;

      const usersData = activeUsers.map(u => {
        const shiftStart = u.shift_start ? u.shift_start.substring(0, 5) : '10:00';
        const [shiftH, shiftM] = shiftStart.split(':').map(Number);
        const shiftMinutes = shiftH * 60 + shiftM;
        const userLogs = userLogMap.get(u.id) || [];
        let onTime = 0, late = 0, totalLogin = 0, delaySum = 0;

        userLogs.forEach(l => {
          if (!l.local_login_time) return;
          const timeParts = String(l.local_login_time).split(':');
          const loginMinutes = parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
          totalLogin += loginMinutes;

          // Grace period of 5 minutes
          if (loginMinutes <= shiftMinutes + 5) {
            onTime++;
          } else {
            late++;
            delaySum += (loginMinutes - shiftMinutes);
          }
        });

        const daysPresent = userLogs.length;
        const avgLoginMin = daysPresent > 0 ? Math.round(totalLogin / daysPresent) : 0;
        const avgLoginH = Math.floor(avgLoginMin / 60);
        const avgLoginM = avgLoginMin % 60;
        const avgLogin = daysPresent > 0
          ? `${avgLoginH > 12 ? avgLoginH - 12 : avgLoginH || 12}:${String(avgLoginM).padStart(2, '0')} ${avgLoginH >= 12 ? 'PM' : 'AM'}`
          : '—';
        const avgDelayMin = late > 0 ? Math.round(delaySum / late) : 0;

        totalOnTime += onTime;
        totalLate += late;
        if (late > 0) { totalDelayMin += delaySum; totalDelayCount += late; }

        return {
          id: u.id,
          name: u.name,
          shiftStart: `${shiftH > 12 ? shiftH - 12 : shiftH || 12}:${String(shiftM).padStart(2, '0')} ${shiftH >= 12 ? 'PM' : 'AM'}`,
          daysPresent,
          onTime,
          late,
          avgLogin,
          avgDelayMin
        };
      });

      // Count unique working days in the data
      const uniqueDays = new Set(logs.map(l => {
        const d = l.date instanceof Date ? l.date.toISOString().split('T')[0] : String(l.date).split('T')[0];
        return d;
      }));

      const workingDays = uniqueDays.size || 1;

      const prevMonth = mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, '0')}`;
      const nextMonth = mon === 12 ? `${year + 1}-01` : `${year}-${String(mon + 1).padStart(2, '0')}`;

      res.render('reports/punctuality', {
        title: 'Punctuality Report',
        users: usersData,
        summary: {
          onTime: Math.round(totalOnTime / workingDays),
          late: Math.round(totalLate / workingDays),
          avgDelay: totalDelayCount > 0 ? Math.round(totalDelayMin / totalDelayCount) : 0,
          totalDays: workingDays
        },
        month, year, mon, lastDay, prevMonth, nextMonth
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  /**
   * Workload Distribution Report
   */
  static async workloadReport(req, res) {
    try {
      // Get all active LOCAL users
      const [users] = await db.query(
        `SELECT u.id, u.name FROM users u
         JOIN organizations o ON u.organization_id = o.id
         JOIN roles r ON u.role_id = r.id
         WHERE u.is_active = 1 AND o.org_type = 'LOCAL' AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
         ORDER BY u.name`
      );

      const userIds = users.map(u => u.id);
      if (userIds.length === 0) {
        return res.render('reports/workload', {
          title: 'Workload Distribution',
          users: [],
          summary: { totalActive: 0, totalRecurring: 0, totalOnce: 0, avgLoad: 0 }
        });
      }

      // Count recurring active tasks per user
      const [recurringCounts] = await db.query(
        `SELECT assigned_to, COUNT(*) as cnt FROM tasks
         WHERE type = 'recurring' AND status = 'active' AND is_deleted = 0
           AND assigned_to IN (${userIds.map(() => '?').join(',')})
         GROUP BY assigned_to`,
        userIds
      );

      // Count pending one-time tasks per user
      const [pendingCounts] = await db.query(
        `SELECT assigned_to, COUNT(*) as cnt FROM tasks
         WHERE type = 'once' AND status = 'pending' AND is_deleted = 0
           AND assigned_to IN (${userIds.map(() => '?').join(',')})
         GROUP BY assigned_to`,
        userIds
      );

      // Count in-progress one-time tasks per user
      const [progressCounts] = await db.query(
        `SELECT assigned_to, COUNT(*) as cnt FROM tasks
         WHERE type = 'once' AND status = 'in_progress' AND is_deleted = 0
           AND assigned_to IN (${userIds.map(() => '?').join(',')})
         GROUP BY assigned_to`,
        userIds
      );

      const recurMap = new Map(recurringCounts.map(r => [r.assigned_to, parseInt(r.cnt)]));
      const pendMap = new Map(pendingCounts.map(r => [r.assigned_to, parseInt(r.cnt)]));
      const progMap = new Map(progressCounts.map(r => [r.assigned_to, parseInt(r.cnt)]));

      let totalRecurring = 0, totalOnce = 0, totalProg = 0;

      const usersData = users.map(u => {
        const recurring = recurMap.get(u.id) || 0;
        const pending = pendMap.get(u.id) || 0;
        const inProgress = progMap.get(u.id) || 0;
        totalRecurring += recurring;
        totalOnce += pending;
        totalProg += inProgress;
        return {
          id: u.id,
          name: u.name,
          recurring,
          pending,
          inProgress,
          totalLoad: recurring + pending + inProgress
        };
      }).sort((a, b) => b.totalLoad - a.totalLoad);

      const totalActive = totalRecurring + totalOnce + totalProg;
      const avgLoad = users.length > 0 ? Math.round(totalActive / users.length) : 0;

      res.render('reports/workload', {
        title: 'Workload Distribution',
        users: usersData,
        summary: {
          totalActive,
          totalRecurring,
          totalOnce: totalOnce + totalProg,
          avgLoad
        }
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }
}

module.exports = ReportController;
