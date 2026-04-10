const db = require('../../config/db');
const { getToday, getNow, getDayOfWeek } = require('../../utils/timezone');

class PortalTeamStatusController {

  // Render the Team India page
  static async index(req, res) {
    res.render('portal/team-status', {
      title: 'Team India - Client Portal',
      layout: 'portal/layout',
      section: 'team-status'
    });
  }

  // API: Get live status data
  static async getData(req, res) {
    try {
      const [[org]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      const tz = (org && org.timezone) || 'America/New_York';
      const today = getToday(tz);
      const dayName = getDayOfWeek(tz);

      const now = new Date(getNow(tz));
      const currentH = now.getUTCHours();
      const currentM = now.getUTCMinutes();
      const currentDec = currentH + currentM / 60;

      // Fetch all active LOCAL team employees
      const [users] = await db.query(
        `SELECT u.id, u.name, u.shift_start, u.shift_hours, u.weekly_off_day
         FROM users u
         JOIN roles r ON u.role_id = r.id
         JOIN organizations o ON u.organization_id = o.id
         WHERE u.is_active = 1 AND o.org_type = 'LOCAL'
           AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
         ORDER BY u.name`
      );

      // Fetch approved leaves for today
      const [leaves] = await db.query(
        `SELECT user_id FROM leave_requests WHERE status = 'approved' AND from_date <= ? AND to_date >= ?`,
        [today, today]
      );
      const leaveSet = new Set(leaves.map(l => l.user_id));

      // Fetch active task sessions
      const yesterday = new Date(new Date(today + 'T12:00:00').getTime() - 86400000).toISOString().split('T')[0];
      const [activeSessions] = await db.query(
        `SELECT tc.user_id, tc.started_at, t.title as task_name
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

      // Fetch today's attendance
      const [attendance] = await db.query(
        `SELECT user_id, login_time, logout_time FROM attendance_logs
         WHERE date = ? AND login_time IS NOT NULL
         ORDER BY login_time DESC`,
        [today]
      );
      const attendanceMap = new Map();
      attendance.forEach(a => {
        if (!attendanceMap.has(a.user_id)) attendanceMap.set(a.user_id, a);
      });

      // Batch-fetch effective shifts
      const userIds = users.map(u => u.id);
      const shiftMap = new Map();
      if (userIds.length) {
        const [shiftRows] = await db.query(
          `SELECT sh.user_id, sh.shift_start, sh.shift_hours
           FROM shift_history sh
           INNER JOIN (
             SELECT user_id, MAX(effective_date) as max_date
             FROM shift_history
             WHERE user_id IN (?) AND effective_date <= ?
             GROUP BY user_id
           ) latest ON sh.user_id = latest.user_id AND sh.effective_date = latest.max_date
           WHERE sh.user_id IN (?)
           ORDER BY sh.id DESC`,
          [userIds, today, userIds]
        );
        shiftRows.forEach(r => {
          if (!shiftMap.has(r.user_id)) shiftMap.set(r.user_id, r);
        });
      }

      // Classify each employee
      const employees = users.map(user => {
        const effectiveShift = shiftMap.get(user.id) || { shift_start: user.shift_start, shift_hours: user.shift_hours };
        const result = {
          id: user.id,
          name: user.name,
          shiftStart: effectiveShift.shift_start,
          shiftHours: effectiveShift.shift_hours,
          status: '',
          statusType: '',
          taskName: null,
          startedAt: null,
        };

        // Weekly off
        if (user.weekly_off_day === dayName) {
          result.status = 'Week Off';
          result.statusType = 'off';
          return result;
        }

        // On leave
        if (leaveSet.has(user.id)) {
          result.status = 'On Leave';
          result.statusType = 'leave';
          return result;
        }

        // Shift boundaries
        const userShiftStart = effectiveShift.shift_start;
        const userShiftHours = effectiveShift.shift_hours;
        if (!userShiftStart || !userShiftHours) {
          result.status = 'No Shift Info';
          result.statusType = 'off';
          return result;
        }

        const [sh, sm] = userShiftStart.split(':').map(Number);
        const shiftStartDec = sh + (sm || 0) / 60;
        const shiftHours = parseFloat(userShiftHours);
        const shiftEndDec = shiftStartDec + shiftHours;

        let onShift = false;
        if (shiftEndDec <= 24) {
          onShift = currentDec >= shiftStartDec && currentDec < shiftEndDec;
        } else {
          onShift = currentDec >= shiftStartDec || currentDec < (shiftEndDec - 24);
        }

        let hoursPastShift = 0;
        if (!onShift) {
          if (shiftEndDec <= 24) {
            hoursPastShift = currentDec - shiftEndDec;
            if (hoursPastShift < 0) hoursPastShift += 24;
          } else {
            hoursPastShift = currentDec - (shiftEndDec - 24);
            if (hoursPastShift < 0) hoursPastShift += 24;
          }
        }

        const session = sessionMap.get(user.id);
        const att = attendanceMap.get(user.id);
        const isLoggedIn = att && !att.logout_time;

        if (onShift) {
          if (session) {
            result.status = 'Working';
            result.statusType = 'working';
            result.taskName = session.task_name;
            result.startedAt = session.started_at;
          } else if (isLoggedIn) {
            result.status = 'Idle';
            result.statusType = 'idle';
          } else {
            result.status = 'Not Logged In';
            result.statusType = 'absent';
          }
        } else {
          if (session) {
            result.status = 'Extending Shift';
            result.statusType = 'extending';
            result.taskName = session.task_name;
            result.startedAt = session.started_at;
          } else if (isLoggedIn && hoursPastShift <= 2) {
            result.status = 'Wrapping Up';
            result.statusType = 'extending';
          } else if (isLoggedIn && hoursPastShift > 2) {
            result.status = 'Forgot Logout';
            result.statusType = 'stale';
          } else {
            result.status = 'Off Shift';
            result.statusType = 'off';
          }
        }

        return result;
      });

      // Sort: Working > Extending > Idle > Absent > Stale > Off > Leave
      const order = { working: 0, extending: 1, idle: 2, absent: 3, stale: 4, off: 5, leave: 6 };
      employees.sort((a, b) => (order[a.statusType] ?? 7) - (order[b.statusType] ?? 7));

      const counts = {
        total: employees.length,
        working: employees.filter(e => e.statusType === 'working').length,
        idle: employees.filter(e => e.statusType === 'idle').length,
        absent: employees.filter(e => e.statusType === 'absent').length,
        off: employees.filter(e => ['off', 'leave'].includes(e.statusType)).length,
      };

      return res.json({ success: true, data: { employees, counts } });
    } catch (err) {
      console.error('Portal team status error:', err);
      return res.status(500).json({ success: false, message: 'Failed to load team status' });
    }
  }
  // API: Get today's tasks for a specific local employee
  static async getEmployeeTasks(req, res) {
    try {
      const userId = parseInt(req.params.userId);
      const [[org]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      const tz = (org && org.timezone) || 'America/New_York';
      const today = getToday(tz);

      // Get active recurring tasks scheduled for today
      const [recurringTasks] = await db.query(
        `SELECT t.id, t.title, t.type, t.recurrence_pattern,
                CASE
                  WHEN tc.completed_at IS NOT NULL THEN 'completed'
                  WHEN tc.started_at IS NOT NULL THEN 'in_progress'
                  ELSE 'pending'
                END as status
         FROM tasks t
         LEFT JOIN task_completions tc ON tc.task_id = t.id AND tc.user_id = t.assigned_to AND tc.completion_date = ?
         WHERE t.assigned_to = ? AND t.type = 'recurring' AND t.status = 'active' AND t.is_deleted = 0
           AND (
             t.recurrence_pattern = 'daily'
             OR (t.recurrence_pattern = 'weekly' AND FIND_IN_SET(DAYOFWEEK(?) - 1, t.recurrence_days) > 0)
             OR (t.recurrence_pattern = 'monthly' AND FIND_IN_SET(DAY(?), t.recurrence_days) > 0)
           )
           AND (t.recurrence_end_date IS NULL OR t.recurrence_end_date >= ?)
         ORDER BY t.title`,
        [today, userId, today, today, today]
      );

      // Get adhoc tasks for today
      const [adhocTasks] = await db.query(
        `SELECT t.id, t.title, t.type, t.status
         FROM tasks t
         WHERE t.assigned_to = ? AND t.type = 'once' AND t.is_deleted = 0
           AND (DATE(t.created_at) = ? OR DATE(t.completed_at) = ? OR DATE(t.due_date) = ? OR t.status IN ('pending', 'in_progress'))
         ORDER BY FIELD(t.status, 'in_progress', 'pending', 'completed'), t.created_at DESC`,
        [userId, today, today, today]
      );

      const tasks = [...recurringTasks, ...adhocTasks];
      return res.json({ success: true, data: { tasks } });
    } catch (err) {
      console.error('Employee tasks error:', err);
      return res.status(500).json({ success: false, message: 'Failed to load tasks' });
    }
  }
}

module.exports = PortalTeamStatusController;
