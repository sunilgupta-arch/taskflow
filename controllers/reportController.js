const TaskService = require('../services/taskService');
const RewardModel = require('../models/Reward');
const db = require('../config/db');
const { ApiResponse } = require('../utils/response');
const { getToday } = require('../utils/timezone');

class ReportController {
  static async completionReport(req, res) {
    try {
      const [stats, perUser] = await Promise.all([
        TaskService.getTaskStats(),
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

      const [dailyLogs, weeklyStats, activeUsers, attendanceDays, leaveData] = await Promise.all([
        db.query(
          `SELECT al.*, u.name as user_name, u.email, u.shift_start, u.shift_hours,
                  TIMEDIFF(COALESCE(al.logout_time, NOW()), al.login_time) as duration
           FROM attendance_logs al
           JOIN users u ON al.user_id = u.id
           JOIN roles r ON u.role_id = r.id
           WHERE al.date = ? AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
           ORDER BY al.login_time`, [today]
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
          `SELECT user_id, date, login_time FROM attendance_logs
           WHERE date >= ? AND date <= ?`,
          [startDate, endDate]
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
        if (row.login_time) {
          const lt = new Date(row.login_time);
          loginTimeMap.set(`${row.user_id}-${d}`, lt.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true }));
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
}

module.exports = ReportController;
