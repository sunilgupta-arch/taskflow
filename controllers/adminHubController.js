const ClientRequest = require('../models/ClientRequest');
const UserModel = require('../models/User');
const LeaveRequest = require('../models/LeaveRequest');
const NoteModel = require('../models/Note');
const db = require('../config/db');
const { getToday, getNow } = require('../utils/timezone');

class AdminHubController {
  static async dashboard(req, res) {
    res.render('admin/dashboard', { title: 'Admin Hub', layout: 'admin/layout', section: 'dashboard' });
  }
  static async work(req, res) {
    res.render('admin/work', { title: 'Work', layout: 'admin/layout', section: 'work' });
  }
  static async queue(req, res) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dateStr = req.query.date || today;
      const [instances, stats] = await Promise.all([
        ClientRequest.getQueueForDate(dateStr),
        ClientRequest.getDateStats(dateStr)
      ]);
      res.render('admin/queue', { title: 'Client Queue', layout: 'admin/layout', section: 'work', instances, stats, selectedDate: dateStr, today });
    } catch (err) {
      console.error('AdminHub queue error:', err);
      res.status(500).send('Server error');
    }
  }
  static async team(req, res) {
    res.render('admin/team', { title: 'Team', layout: 'admin/layout', section: 'team' });
  }

  static async users(req, res) {
    try {
      const { rows } = await UserModel.getAll({ page: 1, limit: 500 });
      const [roles] = await db.query('SELECT * FROM roles ORDER BY name');
      const [orgs]  = await db.query('SELECT * FROM organizations ORDER BY name');
      let delegatedSupportId = null;
      if (req.user.role_name === 'LOCAL_ADMIN') {
        const [[localOrg]] = await db.query("SELECT delegated_support_id FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
        delegatedSupportId = localOrg?.delegated_support_id || null;
      }
      res.render('admin/users', {
        title: 'Users',
        layout: 'admin/layout',
        section: 'team',
        users: rows,
        roles,
        orgs,
        delegatedSupportId
      });
    } catch (err) {
      console.error('AdminHub users error:', err);
      res.status(500).send('Server error');
    }
  }
  static async leaves(req, res) {
    try {
      const { rows } = await LeaveRequest.getAll({ page: 1, limit: 500 });
      const [leaveUsers] = await db.query(
        `SELECT u.id, u.name FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.is_active = 1 AND r.name IN ('LOCAL_USER','LOCAL_MANAGER')
         ORDER BY u.name`
      );
      res.render('admin/leaves', {
        title: 'Leave Management',
        layout: 'admin/layout',
        section: 'team',
        leaves: rows,
        leaveUsers
      });
    } catch (err) {
      console.error('AdminHub leaves error:', err);
      res.status(500).send('Server error');
    }
  }

  static async notes(req, res) {
    try {
      const { rows } = await NoteModel.getAll({ user_id: req.user.id, page: 1, limit: 500 });
      res.render('admin/notes', { title: 'Notes', layout: 'admin/layout', section: 'comms', notes: rows });
    } catch (err) {
      console.error('AdminHub notes error:', err);
      res.status(500).send('Server error');
    }
  }

  static async reports(req, res) {
    res.render('admin/reports', { title: 'Reports', layout: 'admin/layout', section: 'reports' });
  }
  static async comms(req, res) {
    res.render('admin/comms', { title: 'Communications', layout: 'admin/layout', section: 'comms' });
  }
  static async tools(req, res) {
    res.render('admin/tools', { title: 'Tools', layout: 'admin/layout', section: 'tools' });
  }

  // ── Shared attendance data fetcher ───────────────────────────────────
  static async _fetchAttendanceData(tz, selectedDate, month) {
    const [yearStr, monStr] = month.split('-');
    const year  = parseInt(yearStr);
    const mon   = parseInt(monStr);
    const lastDay   = new Date(year, mon, 0).getDate();
    const startDate = `${month}-01`;
    const endDate   = `${month}-${String(lastDay).padStart(2, '0')}`;

    const [dailyLogs, activeUsers, attendanceDays, leaveData, holidayData] = await Promise.all([
      db.query(
        `SELECT al.*, u.name as user_name,
                COALESCE(sh.shift_start, u.shift_start) as shift_start,
                COALESCE(sh.shift_hours, u.shift_hours) as shift_hours,
                DATE_FORMAT(al.login_time,  '%h:%i %p') as loginFormatted,
                DATE_FORMAT(al.logout_time, '%h:%i %p') as logoutFormatted,
                TIMEDIFF(COALESCE(al.logout_time, NOW()), al.login_time) as duration
         FROM attendance_logs al
         JOIN users u ON al.user_id = u.id
         JOIN roles r ON u.role_id = r.id
         LEFT JOIN shift_history sh ON sh.user_id = u.id
           AND sh.effective_date = (
             SELECT MAX(sh2.effective_date) FROM shift_history sh2
             WHERE sh2.user_id = u.id AND sh2.effective_date <= al.date
           )
           AND sh.id = (
             SELECT MAX(sh3.id) FROM shift_history sh3
             WHERE sh3.user_id = u.id AND sh3.effective_date = sh.effective_date
           )
         WHERE al.date = ? AND r.name IN ('LOCAL_USER','LOCAL_MANAGER')
         ORDER BY u.name, al.login_time`,
        [selectedDate]
      ),
      db.query(
        `SELECT u.id, u.name, u.weekly_off_day,
                COALESCE(sh.shift_start, u.shift_start) as shift_start,
                COALESCE(sh.shift_hours, u.shift_hours) as shift_hours
         FROM users u
         JOIN organizations o ON u.organization_id = o.id
         JOIN roles r ON u.role_id = r.id
         LEFT JOIN shift_history sh ON sh.user_id = u.id
           AND sh.effective_date = (
             SELECT MAX(sh2.effective_date) FROM shift_history sh2
             WHERE sh2.user_id = u.id AND sh2.effective_date <= CURDATE()
           )
           AND sh.id = (
             SELECT MAX(sh3.id) FROM shift_history sh3
             WHERE sh3.user_id = u.id AND sh3.effective_date = sh.effective_date
           )
         WHERE u.is_active = 1 AND o.org_type = 'LOCAL' AND r.name IN ('LOCAL_USER','LOCAL_MANAGER')
         ORDER BY u.name`
      ),
      db.query(
        `SELECT user_id, date, DATE_FORMAT(login_time, '%h:%i %p') as login_formatted,
                is_manual, manual_status, manual_remark
         FROM attendance_logs
         WHERE date >= ? AND date <= ?`,
        [startDate, endDate]
      ),
      db.query(
        `SELECT user_id, from_date, to_date, status FROM leave_requests
         WHERE from_date <= ? AND to_date >= ? AND status IN ('approved','pending')`,
        [endDate, startDate]
      ),
      db.query(
        `SELECT id, date, name FROM holidays
         WHERE date >= ? AND date <= ?
           AND organization_id = (SELECT id FROM organizations WHERE org_type = 'LOCAL' LIMIT 1)
         ORDER BY date`,
        [startDate, endDate]
      )
    ]);

    // Build helpers
    const today = getToday(tz);
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    const attendanceSet = new Set();
    const loginTimeMap  = {};
    const overrideMap   = {};
    attendanceDays[0].forEach(row => {
      const d = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).split('T')[0];
      attendanceSet.add(`${row.user_id}-${d}`);
      if (row.login_formatted) loginTimeMap[`${row.user_id}-${d}`] = row.login_formatted;
      if (row.is_manual && row.manual_status) overrideMap[`${row.user_id}-${d}`] = { status: row.manual_status, remark: row.manual_remark };
    });

    const holidayMap = {};
    const holidays   = [];
    holidayData[0].forEach(h => {
      const d = h.date instanceof Date ? h.date.toISOString().split('T')[0] : String(h.date).split('T')[0];
      holidayMap[d] = h.name;
      holidays.push({ id: h.id, date: d, name: h.name });
    });

    // Build calendar data
    const calendarData = {};
    activeUsers[0].forEach(u => {
      calendarData[u.id] = {};
      for (let d = 1; d <= lastDay; d++) {
        const dateObj = new Date(year, mon - 1, d);
        const dateStr = `${year}-${String(mon).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const dayName = dayNames[dateObj.getDay()];

        if (dateStr > today) {
          let st = 'future';
          for (const lv of leaveData[0]) {
            const from = lv.from_date instanceof Date ? lv.from_date.toISOString().split('T')[0] : String(lv.from_date).split('T')[0];
            const to   = lv.to_date   instanceof Date ? lv.to_date.toISOString().split('T')[0]   : String(lv.to_date).split('T')[0];
            if (lv.user_id === u.id && dateStr >= from && dateStr <= to) {
              st = lv.status === 'approved' ? 'approved_leave' : 'pending_leave'; break;
            }
          }
          calendarData[u.id][d] = st;
        } else if (dayName === u.weekly_off_day) {
          calendarData[u.id][d] = 'weekoff';
        } else if (holidayMap[dateStr]) {
          calendarData[u.id][d] = 'holiday';
        } else {
          let onLeave = false;
          for (const lv of leaveData[0]) {
            const from = lv.from_date instanceof Date ? lv.from_date.toISOString().split('T')[0] : String(lv.from_date).split('T')[0];
            const to   = lv.to_date   instanceof Date ? lv.to_date.toISOString().split('T')[0]   : String(lv.to_date).split('T')[0];
            if (lv.user_id === u.id && dateStr >= from && dateStr <= to) {
              calendarData[u.id][d] = lv.status === 'approved' ? 'approved_leave' : 'pending_leave';
              onLeave = true; break;
            }
          }
          if (!onLeave) {
            const ov = overrideMap[`${u.id}-${dateStr}`];
            if (ov) {
              calendarData[u.id][d] = ov.status === 'leave' ? 'approved_leave' : ov.status;
            } else if (attendanceSet.has(`${u.id}-${dateStr}`)) {
              calendarData[u.id][d] = 'present';
            } else {
              calendarData[u.id][d] = 'absent';
            }
          }
        }
      }
    });

    const prevMonth = mon === 1  ? `${year-1}-12`                              : `${year}-${String(mon-1).padStart(2,'0')}`;
    const nextMonth = mon === 12 ? `${year+1}-01`                              : `${year}-${String(mon+1).padStart(2,'0')}`;

    return {
      dailyLogs:   dailyLogs[0],
      users:       activeUsers[0],
      calendarData,
      loginTimeMap,
      overrideMap,
      holidays,
      holidayMap,
      month, year, mon, lastDay, prevMonth, nextMonth, today
    };
  }

  static async attendance(req, res) {
    try {
      const [orgs] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      const tz           = (orgs.length && orgs[0].timezone) || req.user.org_timezone || 'America/New_York';
      const today        = getToday(tz);
      const month        = req.query.month || today.slice(0, 7);
      const selectedDate = req.query.date  || today;

      const data = await AdminHubController._fetchAttendanceData(tz, selectedDate, month);

      res.render('admin/attendance', {
        title: 'Attendance',
        layout: 'admin/layout',
        section: 'team',
        ...data,
        selectedDate,
        isAdmin: req.user.role_name === 'LOCAL_ADMIN',
        timezone: tz
      });
    } catch (err) {
      console.error('AdminHub attendance error:', err);
      res.status(500).send('Server error');
    }
  }

  static async attendanceDailyData(req, res) {
    try {
      const [orgs] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      const tz           = (orgs.length && orgs[0].timezone) || req.user.org_timezone || 'America/New_York';
      const today        = getToday(tz);
      const selectedDate = req.query.date || today;
      const month        = selectedDate.slice(0, 7);

      const data = await AdminHubController._fetchAttendanceData(tz, selectedDate, month);

      return res.json({ success: true, data: { ...data, selectedDate } });
    } catch (err) {
      console.error('AdminHub attendanceDailyData error:', err);
      return res.json({ success: false });
    }
  }

  static async attendanceMonthlyData(req, res) {
    try {
      const [orgs] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      const tz    = (orgs.length && orgs[0].timezone) || req.user.org_timezone || 'America/New_York';
      const today = getToday(tz);
      const month = req.query.month || today.slice(0, 7);

      const data = await AdminHubController._fetchAttendanceData(tz, today, month);

      return res.json({ success: true, data });
    } catch (err) {
      console.error('AdminHub attendanceMonthlyData error:', err);
      return res.json({ success: false });
    }
  }
}

module.exports = AdminHubController;
