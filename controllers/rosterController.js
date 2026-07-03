const Roster = require('../models/Roster');
const db = require('../config/db');
const { ApiResponse } = require('../utils/response');
const { getIO } = require('../config/socket');
const { getToday } = require('../utils/timezone');
const Notification = require('../models/Notification');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

async function getLocalTz() {
  const [[org]] = await db.query("SELECT timezone FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
  return (org && org.timezone) || 'America/New_York';
}

// Returns IDs of all active admins + managers except the given userId
async function getManagerIds(excludeUserId = null) {
  const [rows] = await db.query(
    `SELECT u.id FROM users u JOIN roles r ON u.role_id = r.id
     WHERE r.name IN ('LOCAL_ADMIN','LOCAL_MANAGER') AND u.is_active = 1
     ${excludeUserId ? 'AND u.id != ?' : ''}`,
    excludeUserId ? [excludeUserId] : []
  );
  return rows.map(r => r.id);
}

class RosterController {
  // Employee requests a specific weekoff day for an upcoming week
  static async submitRequest(req, res) {
    try {
      const { week_start_date, requested_day, note } = req.body;
      if (!week_start_date || !DAYS.includes(requested_day)) {
        return ApiResponse.error(res, 'A week and a valid day are required', 400);
      }

      const today = getToday(await getLocalTz());
      if (Roster.getWeekStart(week_start_date) < Roster.getWeekStart(today)) {
        return ApiResponse.error(res, 'Cannot request a weekoff for a past week', 400);
      }

      const weekStart = Roster.getWeekStart(week_start_date);
      const request = await Roster.submitRequest(req.user.id, weekStart, requested_day, note ? note.trim() : null);

      const io = getIO();
      const managerIds = await getManagerIds(req.user.id);
      const body = `${req.user.name} requested ${requested_day} off for the week of ${weekStart}`;

      for (const mid of managerIds) {
        const nid = await Notification.create(mid, 'roster_pending', 'Weekoff Request', body, '/admin/roster', 'roster_request', request.id);
        io.to(`user:${mid}`).emit('notification:new', {
          id: nid, type: 'roster_pending', title: 'Weekoff Request',
          body, link: '/admin/roster', ref_type: 'roster_request', ref_id: request.id,
          is_read: 0, created_at: new Date()
        });
      }

      return ApiResponse.success(res, request, 'Weekoff request submitted', 201);
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // Employee's own effective weekoff + request status for a given week (defaults to current week)
  static async getMyRoster(req, res) {
    try {
      const anchor = req.query.week || getToday(await getLocalTz());
      const weekStart = Roster.getWeekStart(anchor);

      const [roster, request] = await Promise.all([
        Roster.getMyRosterForWeek(req.user.id, weekStart, req.user.weekly_off_day),
        Roster.getMyRequest(req.user.id, weekStart)
      ]);

      return ApiResponse.success(res, { week_start_date: weekStart, ...roster, request });
    } catch (err) {
      return ApiResponse.error(res, 'Failed to load roster');
    }
  }

  // Manager planning grid data for a given week
  static async getWeekPlan(req, res) {
    try {
      const anchor = req.query.start || getToday(await getLocalTz());
      const weekStart = Roster.getWeekStart(anchor);
      const plan = await Roster.getWeekPlan(weekStart);
      return ApiResponse.success(res, { week_start_date: weekStart, plan });
    } catch (err) {
      return ApiResponse.error(res, 'Failed to load week plan');
    }
  }

  // Manager publishes/updates a week's roster
  static async publish(req, res) {
    try {
      const { week_start_date, assignments } = req.body;
      if (!week_start_date || !Array.isArray(assignments) || !assignments.length) {
        return ApiResponse.error(res, 'A week and assignments are required', 400);
      }
      if (assignments.some(a => !a.user_id || !DAYS.includes(a.weekoff_day))) {
        return ApiResponse.error(res, 'Every assignment needs a valid user and day', 400);
      }

      const weekStart = Roster.getWeekStart(week_start_date);

      const [pendingRequests] = await db.query(
        `SELECT id FROM roster_requests WHERE week_start_date = ? AND status = 'pending'`,
        [weekStart]
      );

      const changed = await Roster.publishWeek(weekStart, assignments, req.user.id);

      const io = getIO();
      const managerIds = await getManagerIds();

      // Clear the roster-request notifications now that the week is planned
      for (const r of pendingRequests) {
        const cleared = await Notification.clearByRef(managerIds, 'roster_request', r.id);
        if (cleared.length) {
          managerIds.forEach(mid => io.to(`user:${mid}`).emit('notification:cleared', { ref_type: 'roster_request', ref_id: r.id }));
        }
      }

      // Notify every employee whose effective weekoff actually changed — no silent edits
      for (const c of changed) {
        const body = `Your weekoff for the week of ${weekStart} is ${c.weekoff_day}`;
        const nid = await Notification.create(c.user_id, 'roster_published', 'Weekoff Scheduled', body, '/admin/my-attendance');
        io.to(`user:${c.user_id}`).emit('notification:new', {
          id: nid, type: 'roster_published', title: 'Weekoff Scheduled',
          body, link: '/admin/my-attendance', is_read: 0, created_at: new Date()
        });
      }

      return ApiResponse.success(res, { changed }, 'Roster published');
    } catch (err) {
      console.error('Roster publish error:', err);
      return ApiResponse.error(res, err.message || 'Failed to publish roster');
    }
  }
}

module.exports = RosterController;
