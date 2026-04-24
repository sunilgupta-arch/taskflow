const ClientRequest = require('../models/ClientRequest');
const UserModel = require('../models/User');
const LeaveRequest = require('../models/LeaveRequest');
const NoteModel = require('../models/Note');
const ChatModel = require('../models/Chat');
const GoogleDriveService = require('../services/googleDriveService');
const backupService = require('../services/backupService');
const db = require('../config/db');
const { getToday, getNow, getDayOfWeek, isScheduledForDate } = require('../utils/timezone');

class AdminHubController {
  static async dashboard(req, res) {
    res.render('admin/dashboard', { title: 'Admin Hub', layout: 'admin/layout', section: 'dashboard' });
  }
  static async work(req, res) {
    res.render('admin/work', { title: 'Work', layout: 'admin/layout', section: 'work' });
  }

  static async myTasks(req, res) {
    try {
      const [[localOrgRow]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      const localTz = (localOrgRow && localOrgRow.timezone) || req.user.org_timezone || 'UTC';
      const today = getToday(localTz);
      res.render('admin/my-tasks', {
        title: 'My Tasks', layout: 'admin/layout', section: 'work', today,
        currentUser: { id: req.user.id, name: req.user.name, role: req.user.role_name }
      });
    } catch (err) {
      console.error('AdminHub myTasks error:', err);
      res.status(500).send('Server error');
    }
  }

  static async myTasksData(req, res) {
    try {
      const [[localOrgRow]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      const localTz = (localOrgRow && localOrgRow.timezone) || req.user.org_timezone || 'UTC';
      const today   = getToday(localTz);
      const selectedDate = req.query.date || today;
      const schedule     = req.query.schedule || 'today'; // 'today' | 'all'
      const userId       = req.user.id;

      if (schedule === 'today') {
        /* ── TODAY: recurring scheduled for date + one-time due today ── */
        const [recurringTasks] = await db.query(
          `SELECT t.id, t.title, t.type, t.recurrence_pattern, t.recurrence_days,
                  t.recurrence_end_date, t.reward_amount, t.priority, t.deadline_time, t.group_id
           FROM tasks t
           WHERE t.is_deleted = 0 AND t.type = 'recurring' AND t.status = 'active'
             AND t.assigned_to = ?
           ORDER BY t.deadline_time, t.title`,
          [userId]
        );

        const scheduledRecurring = recurringTasks.filter(t => isScheduledForDate(t, selectedDate));

        const [onceTasks] = await db.query(
          `SELECT t.id, t.title, t.type, t.priority, t.status,
                  t.due_date, t.completed_at, t.reward_amount
           FROM tasks t
           WHERE t.is_deleted = 0 AND t.type = 'once' AND t.assigned_to = ?
             AND t.status IN ('pending', 'in_progress')
             AND (t.due_date = ? OR t.due_date IS NULL)
           ORDER BY t.due_date, t.title`,
          [userId, selectedDate]
        );

        const [completions] = await db.query(
          `SELECT task_id, started_at, completed_at, duration_minutes
           FROM task_completions WHERE user_id = ? AND completion_date = ?`,
          [userId, selectedDate]
        );
        const compMap = {};
        completions.forEach(c => { compMap[c.task_id] = c; });

        const tasks = [];

        scheduledRecurring.forEach(t => {
          const comp = compMap[t.id];
          tasks.push({
            id: t.id, title: t.title, type: 'recurring',
            pattern: t.recurrence_pattern, recurrence_days: t.recurrence_days,
            priority: t.priority, deadline_time: t.deadline_time,
            reward_amount: t.reward_amount,
            status: (comp && comp.completed_at) ? 'done' : (comp && comp.started_at) ? 'in_progress' : 'pending',
            started_at: comp ? comp.started_at : null,
            completed_at: comp ? comp.completed_at : null,
            duration_minutes: comp ? comp.duration_minutes : null
          });
        });

        onceTasks.forEach(t => {
          tasks.push({
            id: t.id, title: t.title, type: 'once', pattern: null,
            priority: t.priority, due_date: t.due_date,
            reward_amount: t.reward_amount, status: t.status,
            completed_at: t.completed_at
          });
        });

        const done       = tasks.filter(t => t.status === 'done' || t.status === 'completed').length;
        const inProgress = tasks.filter(t => t.status === 'in_progress').length;
        const pending    = tasks.filter(t => t.status === 'pending').length;

        return res.json({
          success: true, schedule, selectedDate, today,
          tasks,
          stats: { total: tasks.length, done, inProgress, pending }
        });
      }

      /* ── ALL: every active task assigned to the user ── */
      const [allTasks] = await db.query(
        `SELECT t.id, t.title, t.type, t.recurrence_pattern, t.recurrence_days,
                t.recurrence_end_date, t.reward_amount, t.priority, t.status,
                t.due_date, t.deadline_time, t.completed_at
         FROM tasks t
         WHERE t.is_deleted = 0 AND t.assigned_to = ?
           AND t.status NOT IN ('deactivated')
         ORDER BY
           FIELD(t.status, 'in_progress', 'pending', 'active', 'completed'),
           t.due_date, t.deadline_time, t.title`,
        [userId]
      );

      const done       = allTasks.filter(t => t.status === 'completed').length;
      const inProgress = allTasks.filter(t => t.status === 'in_progress').length;
      const pending    = allTasks.filter(t => ['pending','active'].includes(t.status)).length;

      return res.json({
        success: true, schedule, today,
        tasks: allTasks.map(t => ({
          id: t.id, title: t.title, type: t.type,
          pattern: t.recurrence_pattern, recurrence_days: t.recurrence_days,
          priority: t.priority, due_date: t.due_date,
          deadline_time: t.deadline_time, reward_amount: t.reward_amount,
          status: t.status, completed_at: t.completed_at
        })),
        stats: { total: allTasks.length, done, inProgress, pending }
      });
    } catch (err) {
      console.error('AdminHub myTasksData error:', err);
      return res.json({ success: false, message: 'Server error' });
    }
  }

  static async allTasks(req, res) {
    try {
      const [tasks] = await db.query(
        `SELECT t.id, t.title, t.description, t.type, t.recurrence_pattern, t.recurrence_days,
                t.recurrence_end_date, t.reward_amount, t.priority, t.status,
                t.assigned_to, t.secondary_assignee, t.tertiary_assignee,
                t.group_id, t.due_date, t.deadline_time, t.created_at,
                u1.name AS assigned_to_name,
                u2.name AS secondary_name,
                u3.name AS tertiary_name,
                u4.name AS created_by_name
         FROM tasks t
         LEFT JOIN users u1 ON t.assigned_to        = u1.id
         LEFT JOIN users u2 ON t.secondary_assignee = u2.id
         LEFT JOIN users u3 ON t.tertiary_assignee  = u3.id
         LEFT JOIN users u4 ON t.created_by         = u4.id
         WHERE t.is_deleted = 0
         ORDER BY t.created_at DESC
         LIMIT 500`
      );

      const [[stats]] = await db.query(
        `SELECT
           COUNT(*)                                                            AS total,
           SUM(type = 'recurring' AND status = 'active')                      AS active_recurring,
           SUM(type = 'once' AND status IN ('pending','in_progress'))         AS active_once,
           SUM(assigned_to IS NULL AND status NOT IN ('deactivated','completed')) AS unassigned,
           SUM(status = 'deactivated')                                        AS deactivated,
           SUM(status = 'completed')                                          AS completed
         FROM tasks WHERE is_deleted = 0`
      );

      const [localUsers] = await db.query(
        `SELECT u.id, u.name FROM users u
         JOIN roles r ON u.role_id = r.id
         JOIN organizations o ON u.organization_id = o.id
         WHERE u.is_active = 1 AND o.org_type = 'LOCAL' AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
         ORDER BY u.name`
      );

      res.render('admin/all-tasks', {
        title: 'All Tasks', layout: 'admin/layout', section: 'work',
        tasks, stats, localUsers
      });
    } catch (err) {
      console.error('AdminHub allTasks error:', err);
      res.status(500).send('Server error');
    }
  }

  static async taskboard(req, res) {
    try {
      const [[localOrgRow]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      const localTz = (localOrgRow && localOrgRow.timezone) || req.user.org_timezone || 'UTC';
      const today = getToday(localTz);
      const [localUsers] = await db.query(
        `SELECT u.id, u.name FROM users u
         JOIN roles r ON u.role_id = r.id
         JOIN organizations o ON u.organization_id = o.id
         WHERE u.is_active = 1 AND o.org_type = 'LOCAL' AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
         ORDER BY u.name`
      );
      res.render('admin/taskboard', { title: 'Task Board', layout: 'admin/layout', section: 'work', today, localUsers });
    } catch (err) {
      console.error('AdminHub taskboard error:', err);
      res.status(500).send('Server error');
    }
  }

  static async taskboardData(req, res) {
    try {
      const [[localOrgRow]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      const localTz = (localOrgRow && localOrgRow.timezone) || req.user.org_timezone || 'UTC';
      const today = getToday(localTz);
      const selectedDate = req.query.date || today;

      const [localUsers] = await db.query(
        `SELECT u.id, u.name, u.shift_start, u.weekly_off_day
         FROM users u JOIN roles r ON u.role_id = r.id JOIN organizations o ON u.organization_id = o.id
         WHERE u.is_active = 1 AND o.org_type = 'LOCAL' AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
         ORDER BY u.name`
      );

      const [recurringTasks] = await db.query(
        `SELECT t.id, t.title, t.type, t.recurrence_pattern, t.recurrence_days,
                t.recurrence_end_date, t.reward_amount, t.priority, t.status,
                t.assigned_to, t.secondary_assignee, t.tertiary_assignee,
                t.group_id, t.deadline_time,
                u.name AS assigned_to_name, u.shift_start,
                u2.name AS secondary_name, u2.shift_start AS secondary_shift,
                u3.name AS tertiary_name, u3.shift_start AS tertiary_shift
         FROM tasks t
         LEFT JOIN users u  ON t.assigned_to        = u.id
         LEFT JOIN users u2 ON t.secondary_assignee = u2.id
         LEFT JOIN users u3 ON t.tertiary_assignee  = u3.id
         WHERE t.is_deleted = 0 AND t.type = 'recurring' AND t.status = 'active'
         ORDER BY t.title, u.name`
      );

      const [onceTasks] = await db.query(
        `SELECT t.id, t.title, t.type, t.reward_amount, t.priority, t.status,
                t.assigned_to, t.secondary_assignee, t.tertiary_assignee,
                t.group_id, t.due_date, t.completed_at,
                u.name AS assigned_to_name, u.shift_start,
                u2.name AS secondary_name, u2.shift_start AS secondary_shift,
                u3.name AS tertiary_name, u3.shift_start AS tertiary_shift
         FROM tasks t
         LEFT JOIN users u  ON t.assigned_to        = u.id
         LEFT JOIN users u2 ON t.secondary_assignee = u2.id
         LEFT JOIN users u3 ON t.tertiary_assignee  = u3.id
         WHERE t.is_deleted = 0 AND t.type = 'once'
           AND (t.due_date = ? OR DATE(t.completed_at) = ? OR (DATE(t.created_at) = ? AND t.due_date IS NULL))
         ORDER BY t.title, u.name`,
        [selectedDate, selectedDate, selectedDate]
      );

      const scheduledRecurring = recurringTasks.filter(t => isScheduledForDate(t, selectedDate));

      const dayName = new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
      const offUserIds = new Set(localUsers.filter(u => u.weekly_off_day === dayName).map(u => u.id));
      const [leaves] = await db.query(
        `SELECT user_id FROM leave_requests WHERE status = 'approved' AND from_date <= ? AND to_date >= ?`,
        [selectedDate, selectedDate]
      );
      const unavailableUserIds = new Set([...offUserIds, ...leaves.map(l => l.user_id)]);

      const [completions] = await db.query(
        `SELECT task_id, user_id, started_at, completed_at, duration_minutes
         FROM task_completions WHERE completion_date = ?`,
        [selectedDate]
      );
      const completionMap = {};
      completions.forEach(c => { completionMap[`${c.task_id}-${c.user_id}`] = c; });

      const resolveEffectiveAssignee = (t) => {
        const primary   = { id: t.assigned_to,        name: t.assigned_to_name,  shift: t.shift_start };
        const secondary = t.secondary_assignee ? { id: t.secondary_assignee, name: t.secondary_name, shift: t.secondary_shift } : null;
        const tertiary  = t.tertiary_assignee  ? { id: t.tertiary_assignee,  name: t.tertiary_name,  shift: t.tertiary_shift  } : null;
        if (primary.id && !unavailableUserIds.has(primary.id)) return { ...primary, role: 'primary' };
        if (secondary && !unavailableUserIds.has(secondary.id)) return { ...secondary, role: 'secondary', original_assignee: primary.name };
        if (tertiary  && !unavailableUserIds.has(tertiary.id))  return { ...tertiary,  role: 'tertiary',  original_assignee: primary.name };
        if (!secondary && !tertiary) return null;
        return { id: primary.id, name: primary.name, shift: primary.shift, role: 'all_unavailable', original_assignee: primary.name };
      };

      const filteredRecurring = scheduledRecurring.filter(t => {
        if (t.secondary_assignee || t.tertiary_assignee) return true;
        return !unavailableUserIds.has(t.assigned_to);
      });

      const taskGroups = {};
      const addToGroup = (t, isRecurring) => {
        const key = t.group_id ? `g-${t.group_id}` : `t-${t.id}`;
        if (!taskGroups[key]) {
          taskGroups[key] = {
            title: t.title, type: t.type, pattern: t.recurrence_pattern,
            recurrence_days: t.recurrence_days, priority: t.priority,
            reward_amount: t.reward_amount, deadline_time: t.deadline_time,
            employees: [], doneCount: 0, totalCount: 0
          };
        }

        const hasFallback = t.secondary_assignee || t.tertiary_assignee;
        let uid = t.assigned_to, uname = t.assigned_to_name, fallbackRole = 'primary', originalAssignee = null;

        if (hasFallback && !t.group_id) {
          const resolved = resolveEffectiveAssignee(t);
          if (!resolved) return;
          uid = resolved.id; uname = resolved.name; fallbackRole = resolved.role;
          if (resolved.role !== 'primary') originalAssignee = resolved.original_assignee;
        }

        const comp = completionMap[`${t.id}-${uid}`];
        const isCompleted = isRecurring ? !!(comp && comp.completed_at) : t.status === 'completed';
        const isStarted   = isRecurring ? !!(comp && comp.started_at && !comp.completed_at) : t.status === 'in_progress';

        taskGroups[key].employees.push({
          task_id: t.id, user_id: uid, user_name: uname || 'Unassigned',
          status: isCompleted ? 'done' : isStarted ? 'in_progress' : (fallbackRole === 'all_unavailable' ? 'unattended' : 'pending'),
          started_at: comp ? comp.started_at : null,
          completed_at: isRecurring ? (comp ? comp.completed_at : null) : (isCompleted ? t.completed_at : null),
          duration_minutes: comp ? comp.duration_minutes : null,
          fallback_role: fallbackRole, original_assignee: originalAssignee
        });
        taskGroups[key].totalCount++;
        if (isCompleted) taskGroups[key].doneCount++;
      };

      filteredRecurring.forEach(t => addToGroup(t, true));
      onceTasks.forEach(t => addToGroup(t, false));

      const groups = Object.values(taskGroups);
      const totalAssignments = groups.reduce((s, g) => s + g.totalCount, 0);
      const totalDone        = groups.reduce((s, g) => s + g.doneCount, 0);
      const totalInProgress  = groups.reduce((s, g) => s + g.employees.filter(e => e.status === 'in_progress').length, 0);

      return res.json({
        success: true, selectedDate, today,
        taskGroups: groups,
        stats: {
          tasks: groups.length, assignments: totalAssignments,
          done: totalDone, inProgress: totalInProgress,
          pending: totalAssignments - totalDone - totalInProgress
        }
      });
    } catch (err) {
      console.error('AdminHub taskboardData error:', err);
      return res.json({ success: false, message: 'Server error' });
    }
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

  static async liveStatus(req, res) {
    try {
      const [[org]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      const tz = (org && org.timezone) || 'UTC';
      res.render('admin/live-status', { title: 'Live Status', layout: 'admin/layout', section: 'team', timezone: tz, currentUserId: req.user.id });
    } catch (err) {
      console.error('AdminHub liveStatus error:', err);
      res.status(500).send('Server error');
    }
  }

  static async liveStatusData(req, res) {
    try {
      const [[org]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      const tz = (org && org.timezone) || 'UTC';
      const today   = getToday(tz);
      const dayName = getDayOfWeek(tz);
      const now     = new Date(getNow(tz));
      const currentH   = now.getUTCHours();
      const currentM   = now.getUTCMinutes();
      const currentDec = currentH + currentM / 60;

      const [users] = await db.query(
        `SELECT u.id, u.name, u.shift_start, u.shift_hours, u.weekly_off_day, u.avatar
         FROM users u
         JOIN roles r ON u.role_id = r.id
         JOIN organizations o ON u.organization_id = o.id
         WHERE u.is_active = 1 AND o.org_type = 'LOCAL'
           AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
         ORDER BY u.name`
      );

      const [leaves] = await db.query(
        `SELECT user_id FROM leave_requests WHERE status = 'approved' AND from_date <= ? AND to_date >= ?`,
        [today, today]
      );
      const leaveSet = new Set(leaves.map(l => l.user_id));

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
      activeSessions.forEach(s => { if (!sessionMap.has(s.user_id)) sessionMap.set(s.user_id, s); });

      const [attendance] = await db.query(
        `SELECT id, user_id, login_time, logout_time FROM attendance_logs
         WHERE date = ? AND login_time IS NOT NULL
         ORDER BY login_time DESC`,
        [today]
      );
      const attendanceMap = new Map();
      attendance.forEach(a => { if (!attendanceMap.has(a.user_id)) attendanceMap.set(a.user_id, a); });

      const userIds = users.map(u => u.id);
      const shiftMap = new Map();
      if (userIds.length) {
        const [shiftRows] = await db.query(
          `SELECT sh.user_id, sh.shift_start, sh.shift_hours
           FROM shift_history sh
           INNER JOIN (
             SELECT user_id, MAX(effective_date) as max_date
             FROM shift_history WHERE user_id IN (?) AND effective_date <= ? GROUP BY user_id
           ) latest ON sh.user_id = latest.user_id AND sh.effective_date = latest.max_date
           WHERE sh.user_id IN (?) ORDER BY sh.id DESC`,
          [userIds, today, userIds]
        );
        shiftRows.forEach(r => { if (!shiftMap.has(r.user_id)) shiftMap.set(r.user_id, r); });
      }

      const employees = users.map(user => {
        const att        = attendanceMap.get(user.id);
        const isLoggedIn = att && !att.logout_time;
        const result = {
          id: user.id, name: user.name, avatar: user.avatar,
          shiftStart: (shiftMap.get(user.id) || user).shift_start,
          shiftHours: (shiftMap.get(user.id) || user).shift_hours,
          status: '', statusType: '',
          taskName: null, taskId: null, startedAt: null,
          attendanceId: isLoggedIn ? att.id : null,
          loginTime: isLoggedIn ? att.login_time : null,
        };

        if (user.weekly_off_day === dayName) { result.status = 'Week Off';  result.statusType = 'off';   return result; }
        if (leaveSet.has(user.id))           { result.status = 'On Leave';  result.statusType = 'leave'; return result; }

        const eff = shiftMap.get(user.id) || { shift_start: user.shift_start, shift_hours: user.shift_hours };
        if (!eff.shift_start || !eff.shift_hours) { result.status = 'No Shift Info'; result.statusType = 'off'; return result; }

        const [sh, sm] = eff.shift_start.split(':').map(Number);
        const shiftStartDec = sh + (sm || 0) / 60;
        const shiftEndDec   = shiftStartDec + parseFloat(eff.shift_hours);

        let onShift;
        if (shiftEndDec <= 24) onShift = currentDec >= shiftStartDec && currentDec < shiftEndDec;
        else                   onShift = currentDec >= shiftStartDec || currentDec < (shiftEndDec - 24);

        let hoursPastShift = 0;
        if (!onShift) {
          const norm = shiftEndDec <= 24 ? shiftEndDec : shiftEndDec - 24;
          hoursPastShift = currentDec - norm;
          if (hoursPastShift < 0) hoursPastShift += 24;
        }

        const session = sessionMap.get(user.id);
        if (onShift) {
          if (session)      { result.status = 'Working';      result.statusType = 'working';  result.taskName = session.task_name; result.taskId = session.task_id; result.startedAt = session.started_at; }
          else if (isLoggedIn) { result.status = 'Idle';      result.statusType = 'idle'; }
          else                 { result.status = 'Not Logged In'; result.statusType = 'absent'; }
        } else {
          if (session)                       { result.status = 'Extending Shift'; result.statusType = 'extending'; result.taskName = session.task_name; result.taskId = session.task_id; result.startedAt = session.started_at; }
          else if (isLoggedIn && hoursPastShift <= 2) { result.status = 'Wrapping Up';   result.statusType = 'extending'; }
          else if (isLoggedIn && hoursPastShift > 2)  { result.status = 'Forgot Logout'; result.statusType = 'stale'; }
          else                               { result.status = 'Off Shift';       result.statusType = 'off'; }
        }
        return result;
      });

      const order = { working: 0, extending: 1, idle: 2, absent: 3, stale: 4, off: 5, leave: 6 };
      employees.sort((a, b) => (order[a.statusType] ?? 7) - (order[b.statusType] ?? 7));

      const counts = {
        total:      employees.length,
        working:    employees.filter(e => e.statusType === 'working').length,
        extending:  employees.filter(e => e.statusType === 'extending').length,
        idle:       employees.filter(e => e.statusType === 'idle').length,
        absent:     employees.filter(e => e.statusType === 'absent').length,
        stale:      employees.filter(e => e.statusType === 'stale').length,
        offOrLeave: employees.filter(e => ['off','leave'].includes(e.statusType)).length,
        onShift:    employees.filter(e => ['working','idle','absent'].includes(e.statusType)).length,
      };

      return res.json({ success: true, employees, counts, timezone: tz, today, currentDec, serverTime: new Date().toISOString() });
    } catch (err) {
      console.error('AdminHub liveStatusData error:', err);
      return res.json({ success: false, message: 'Server error' });
    }
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

  static async taskCompletion(req, res) {
    try {
      const [[localOrg]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      const tz = (localOrg && localOrg.timezone) || req.user.org_timezone || 'UTC';
      const today = getToday(tz);
      const month = req.query.month || today.slice(0, 7);
      const [yearStr, monStr] = month.split('-');
      const year = parseInt(yearStr);
      const mon  = parseInt(monStr);
      const lastDay  = new Date(year, mon, 0).getDate();
      const startDate = `${month}-01`;
      const endDate   = `${month}-${String(lastDay).padStart(2, '0')}`;

      const [users] = await db.query(
        `SELECT u.id, u.name, u.weekly_off_day FROM users u
         JOIN organizations o ON u.organization_id = o.id
         JOIN roles r ON u.role_id = r.id
         WHERE u.is_active = 1 AND o.org_type = 'LOCAL' AND r.name IN ('LOCAL_USER','LOCAL_MANAGER')
         ORDER BY u.name`
      );

      const [recurringTasks] = users.length ? await db.query(
        `SELECT id, assigned_to, recurrence_pattern, recurrence_days, recurrence_end_date, type, status
         FROM tasks WHERE type='recurring' AND status='active' AND is_deleted=0
           AND assigned_to IN (${users.map(() => '?').join(',')})`,
        users.map(u => u.id)
      ) : [[]];

      const [completions] = users.length ? await db.query(
        `SELECT tc.task_id, tc.user_id, tc.completion_date
         FROM task_completions tc JOIN tasks t ON tc.task_id = t.id
         WHERE tc.completion_date >= ? AND tc.completion_date <= ? AND t.is_deleted = 0`,
        [startDate, endDate]
      ) : [[]];

      const [onceTasks] = users.length ? await db.query(
        `SELECT id, assigned_to, status, due_date, created_at, completed_at
         FROM tasks WHERE type='once' AND is_deleted=0 AND status!='deactivated'
           AND assigned_to IN (${users.map(() => '?').join(',')})
           AND ((due_date >= ? AND due_date <= ?)
             OR (DATE(created_at) >= ? AND DATE(created_at) <= ?)
             OR (DATE(completed_at) >= ? AND DATE(completed_at) <= ?))`,
        [...users.map(u => u.id), startDate, endDate, startDate, endDate, startDate, endDate]
      ) : [[]];

      const [holidays] = await db.query(
        `SELECT date FROM holidays WHERE date >= ? AND date <= ?
           AND organization_id = (SELECT id FROM organizations WHERE org_type='LOCAL' LIMIT 1)`,
        [startDate, endDate]
      );

      const completionSet = new Set();
      completions.forEach(c => {
        const d = c.completion_date instanceof Date ? c.completion_date.toISOString().split('T')[0] : String(c.completion_date).split('T')[0];
        completionSet.add(`${c.task_id}-${d}`);
      });
      const holidaySet = new Set();
      holidays.forEach(h => {
        const d = h.date instanceof Date ? h.date.toISOString().split('T')[0] : String(h.date).split('T')[0];
        holidaySet.add(d);
      });

      const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const gridData = {};
      users.forEach(u => {
        gridData[u.id] = {};
        const userRecurring = recurringTasks.filter(t => t.assigned_to === u.id);
        const userOnce      = onceTasks.filter(t => t.assigned_to === u.id);
        for (let d = 1; d <= lastDay; d++) {
          const dateStr = `${year}-${String(mon).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const dayName = dayNames[new Date(year, mon - 1, d).getDay()];
          const isOff     = dayName === u.weekly_off_day;
          const isHoliday = holidaySet.has(dateStr);
          const isFuture  = dateStr > today;
          if (isOff || isFuture || isHoliday) { gridData[u.id][d] = { total:0, done:0, isOff, isFuture, isHoliday }; continue; }
          let total = 0, done = 0;
          userRecurring.forEach(t => {
            if (isScheduledForDate(t, dateStr)) { total++; if (completionSet.has(`${t.id}-${dateStr}`)) done++; }
          });
          userOnce.forEach(t => {
            const due  = t.due_date   ? (t.due_date   instanceof Date ? t.due_date.toISOString().split('T')[0]   : String(t.due_date).split('T')[0])   : null;
            const cre  = t.created_at ? new Date(t.created_at).toISOString().split('T')[0] : null;
            const comp = t.completed_at ? new Date(t.completed_at).toISOString().split('T')[0] : null;
            if (due === dateStr || cre === dateStr) { total++; if (t.status === 'completed' && comp) done++; }
          });
          gridData[u.id][d] = { total, done, isOff:false, isFuture:false, isHoliday:false };
        }
      });

      const prevMonth = mon === 1  ? `${year-1}-12` : `${year}-${String(mon-1).padStart(2,'0')}`;
      const nextMonth = mon === 12 ? `${year+1}-01` : `${year}-${String(mon+1).padStart(2,'0')}`;

      res.render('admin/task-completion', {
        title: 'Task Completion', layout: 'admin/layout', section: 'reports',
        users, gridData, today, month, year, mon, lastDay, prevMonth, nextMonth
      });
    } catch (err) {
      console.error('AdminHub taskCompletion error:', err);
      res.status(500).send('Server error');
    }
  }
  static async comms(req, res) {
    res.render('admin/comms', { title: 'Communications', layout: 'admin/layout', section: 'comms' });
  }

  static async chat(req, res) {
    try {
      const [conversations, users] = await Promise.all([
        ChatModel.getConversationsForUser(req.user.id),
        ChatModel.getChatableUsers(req.user.id),
      ]);
      let driveFiles = [];
      try {
        const folderId = await GoogleDriveService.getUserFolder(req.user);
        driveFiles = await GoogleDriveService.listFiles(folderId);
      } catch (_) {}
      const maxAttachMB = ['LOCAL_ADMIN', 'LOCAL_MANAGER'].includes(req.user.role_name) ? 100 : 10;
      res.render('admin/chat', {
        title: 'Chat',
        layout: 'admin/layout',
        section: 'comms',
        conversations,
        users,
        driveFiles,
        activeConversationId: req.query.c ? parseInt(req.query.c) : null,
        maxAttachMB,
      });
    } catch (err) {
      console.error('AdminHub chat error:', err);
      res.status(500).send('Server error');
    }
  }
  static async channel(req, res) {
    res.render('admin/channel', { title: 'Group Channel', layout: 'admin/layout', section: 'comms' });
  }

  static async infoboard(req, res) {
    try {
      const [posts] = await db.query(
        `SELECT a.*, u.name AS author_name, r.name AS author_role, u.organization_id AS author_org_id,
                o.name AS author_org_name
         FROM announcements a
         JOIN users u ON a.created_by = u.id
         JOIN roles r ON u.role_id = r.id
         JOIN organizations o ON u.organization_id = o.id
         ORDER BY a.is_pinned DESC, a.created_at DESC`
      );
      res.render('admin/infoboard', {
        title: 'Info Board',
        layout: 'admin/layout',
        section: 'comms',
        posts,
        userOrgId: req.user.organization_id,
        canPost: true,
        canManage: true,
      });
    } catch (err) {
      console.error('AdminHub infoboard error:', err);
      res.status(500).send('Server error');
    }
  }

  static async tools(req, res) {
    res.render('admin/tools', { title: 'Tools', layout: 'admin/layout', section: 'tools' });
  }

  static async drive(req, res) {
    try {
      const folderId = await GoogleDriveService.getUserFolder(req.user);
      const subfolderId = req.query.folder || null;

      if (subfolderId && subfolderId !== folderId) {
        const allowed = await GoogleDriveService.isInsideFolder(subfolderId, folderId);
        if (!allowed) return res.status(403).render('error', { title: 'Access Denied', message: 'You do not have access to this folder', code: 403, layout: false });
      }

      const currentFolderId = subfolderId || folderId;
      const files = await GoogleDriveService.listFiles(folderId, subfolderId);
      const breadcrumb = subfolderId ? await GoogleDriveService.getBreadcrumb(subfolderId, folderId) : [];
      const maxSizeMB = ['LOCAL_ADMIN', 'LOCAL_MANAGER'].includes(req.user.role_name) ? 100 : 10;

      res.render('admin/drive', {
        title: 'Google Drive',
        layout: 'admin/layout',
        section: 'tools',
        files,
        rootFolderId: folderId,
        currentFolderId,
        breadcrumb,
        maxSizeMB,
        isRoot: !subfolderId || subfolderId === folderId,
      });
    } catch (err) {
      console.error('AdminHub drive error:', err);
      res.status(500).send('Server error');
    }
  }

  static async helpcenter(req, res) {
    const role = req.user.role_name;
    res.render('admin/helpcenter', {
      title: 'Help Center',
      layout: 'admin/layout',
      section: 'tools',
      role,
      isAdmin: ['LOCAL_ADMIN', 'CLIENT_ADMIN'].includes(role),
      isManager: ['LOCAL_MANAGER', 'CLIENT_MANAGER'].includes(role),
      activeTopic: req.query.topic || null,
    });
  }

  static async backup(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const { rows: backups, total } = await backupService.getBackupLogs(page, 20);
      const settings = await backupService.getSettings();
      res.render('admin/backup', {
        title: 'Backup',
        layout: 'admin/layout',
        section: 'tools',
        backups,
        settings,
        pagination: { page, total, totalPages: Math.ceil(total / 20), limit: 20 },
      });
    } catch (err) {
      console.error('AdminHub backup error:', err);
      res.status(500).send('Server error');
    }
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
