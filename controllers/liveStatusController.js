const db = require('../config/db');
const { getToday, getNow, getDayOfWeek } = require('../utils/timezone');

class LiveStatusController {
  static async show(req, res) {
    try {
      // Use LOCAL org timezone — this page is about LOCAL team employees
      const [[org]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      const tz = (org && org.timezone) || 'America/New_York';
      const today = getToday(tz);
      const dayName = getDayOfWeek(tz);

      // Current time in org timezone
      const now = new Date(getNow(tz));
      const currentH = now.getUTCHours();
      const currentM = now.getUTCMinutes();
      const currentDec = currentH + currentM / 60;

      // Fetch all active LOCAL team employees
      const [users] = await db.query(
        `SELECT u.id, u.name, u.shift_start, u.shift_hours, u.weekly_off_day, u.avatar
         FROM users u
         JOIN roles r ON u.role_id = r.id
         JOIN organizations o ON u.organization_id = o.id
         WHERE u.is_active = 1 AND o.org_type = 'LOCAL'
           AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
         ORDER BY u.name`
      );

      // Fetch approved leaves for today (batch)
      const [leaves] = await db.query(
        `SELECT user_id FROM leave_requests WHERE status = 'approved' AND from_date <= ? AND to_date >= ?`,
        [today, today]
      );
      const leaveSet = new Set(leaves.map(l => l.user_id));

      // Fetch active task sessions for today or yesterday only (handles night shifts).
      // Anything older is a stale abandoned session, not a live one.
      const yesterday = new Date(new Date(today + 'T12:00:00').getTime() - 86400000).toISOString().split('T')[0];
      const [activeSessions] = await db.query(
        `SELECT tc.user_id, tc.started_at, tc.completion_date, t.id as task_id, t.title as task_name
         FROM task_completions tc
         JOIN tasks t ON tc.task_id = t.id
         WHERE tc.started_at IS NOT NULL AND tc.completed_at IS NULL
           AND tc.completion_date IN (?, ?)
         ORDER BY tc.started_at DESC`,
        [today, yesterday]
      );
      const sessionMap = new Map();
      activeSessions.forEach(s => {
        if (!sessionMap.has(s.user_id)) sessionMap.set(s.user_id, s);
      });

      // Fetch today's attendance with login/logout info
      const [attendance] = await db.query(
        `SELECT id, user_id, login_time, logout_time FROM attendance_logs
         WHERE date = ? AND login_time IS NOT NULL
         ORDER BY login_time DESC`,
        [today]
      );
      // Map: userId → most recent attendance record
      const attendanceMap = new Map();
      attendance.forEach(a => {
        if (!attendanceMap.has(a.user_id)) attendanceMap.set(a.user_id, a);
      });

      // Classify each employee
      const employees = users.map(user => {
        const result = {
          id: user.id,
          name: user.name,
          avatar: user.avatar,
          shiftStart: user.shift_start,
          shiftHours: user.shift_hours,
          status: '',
          statusType: '',
          taskName: null,
          taskId: null,
          startedAt: null,
          attendanceId: null,
        };

        // (a) Weekly off
        if (user.weekly_off_day === dayName) {
          result.status = 'Week Off';
          result.statusType = 'off';
          return result;
        }

        // (b) On approved leave
        if (leaveSet.has(user.id)) {
          result.status = 'On Leave';
          result.statusType = 'leave';
          return result;
        }

        // (c) Compute shift boundaries
        if (!user.shift_start || !user.shift_hours) {
          result.status = 'No Shift Info';
          result.statusType = 'off';
          return result;
        }

        const [sh, sm] = user.shift_start.split(':').map(Number);
        const shiftStartDec = sh + (sm || 0) / 60;
        const shiftHours = parseFloat(user.shift_hours);
        const shiftEndDec = shiftStartDec + shiftHours;

        let onShift = false;
        if (shiftEndDec <= 24) {
          onShift = currentDec >= shiftStartDec && currentDec < shiftEndDec;
        } else {
          onShift = currentDec >= shiftStartDec || currentDec < (shiftEndDec - 24);
        }

        // How many hours past shift end?
        let hoursPastShift = 0;
        if (!onShift) {
          if (shiftEndDec <= 24) {
            hoursPastShift = currentDec - shiftEndDec;
            if (hoursPastShift < 0) hoursPastShift += 24;
          } else {
            const shiftEndNorm = shiftEndDec - 24;
            hoursPastShift = currentDec - shiftEndNorm;
            if (hoursPastShift < 0) hoursPastShift += 24;
          }
        }

        const session = sessionMap.get(user.id);
        const att = attendanceMap.get(user.id);
        const isLoggedIn = att && !att.logout_time;
        if (isLoggedIn) result.attendanceId = att.id;

        if (onShift) {
          // ON SHIFT
          if (session) {
            result.status = 'Working';
            result.statusType = 'working';
            result.taskName = session.task_name;
            result.taskId = session.task_id;
            result.startedAt = session.started_at;
          } else if (isLoggedIn) {
            result.status = 'Idle';
            result.statusType = 'idle';
          } else {
            result.status = 'Not Logged In';
            result.statusType = 'absent';
          }
        } else {
          // OFF SHIFT — but check if still working or logged in
          if (session) {
            // Active task after shift ended — extending
            result.status = 'Extending Shift';
            result.statusType = 'extending';
            result.taskName = session.task_name;
            result.taskId = session.task_id;
            result.startedAt = session.started_at;
          } else if (isLoggedIn && hoursPastShift <= 2) {
            // Logged in, within 2 hours of shift end — wrapping up
            result.status = 'Wrapping Up';
            result.statusType = 'extending';
          } else if (isLoggedIn && hoursPastShift > 2) {
            // Logged in but shift ended long ago — forgot to logout
            result.status = 'Forgot Logout';
            result.statusType = 'stale';
          } else {
            result.status = 'Off Shift';
            result.statusType = 'off';
          }
        }

        return result;
      });

      // Sort priority: Working > Extending > Idle > Absent > Stale > Off > Leave
      const order = { working: 0, extending: 1, idle: 2, absent: 3, stale: 4, off: 5, leave: 6 };
      employees.sort((a, b) => (order[a.statusType] ?? 7) - (order[b.statusType] ?? 7));

      // Counts
      const counts = {
        working: employees.filter(e => e.statusType === 'working').length,
        extending: employees.filter(e => e.statusType === 'extending').length,
        idle: employees.filter(e => e.statusType === 'idle').length,
        onShift: employees.filter(e => ['working', 'idle', 'absent'].includes(e.statusType)).length,
        offOrLeave: employees.filter(e => ['off', 'leave'].includes(e.statusType)).length,
        stale: employees.filter(e => e.statusType === 'stale').length,
      };

      res.render('live-status/index', {
        title: 'Live Status',
        employees,
        counts,
        timezone: tz,
        today,
      });
    } catch (err) {
      console.error('Live Status error:', err);
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }
}

module.exports = LiveStatusController;
