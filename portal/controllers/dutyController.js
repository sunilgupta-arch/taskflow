const Duty = require('../models/Duty');
const { ApiResponse } = require('../../utils/response');

const MANAGE_ROLES = ['CLIENT_ADMIN', 'CLIENT_TOP_MGMT'];

const canManage = (req) => MANAGE_ROLES.includes(req.user.role_name);

// Today in the org's working timezone. The DB stores UTC, but a "duty date" is a
// calendar day on the shop floor, so we resolve it against Eastern rather than UTC.
const todayStr = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00'));

const resolveDate = (raw) => (raw && isValidDate(raw) ? raw : todayStr());

class DutyController {

  // ── Page ─────────────────────────────────────────────────────────

  static async index(req, res) {
    try {
      const orgId = req.user.organization_id;
      const manage = canManage(req);
      const employees = manage ? await Duty.getEmployees(orgId) : [];

      res.render('portal/duties', {
        title: 'Duties - Client Portal',
        layout: 'portal/layout',
        section: 'duties',
        canManage: manage,
        employees,
        today: todayStr()
      });
    } catch (err) {
      console.error('Portal duties index error:', err);
      res.status(500).render('error', {
        title: 'Error', message: 'Failed to load duties', code: 500, layout: false
      });
    }
  }

  // ── My duties (any client role) ──────────────────────────────────

  static async mine(req, res) {
    try {
      const date = resolveDate(req.query.date);
      const assignments = await Duty.getForUser(req.user.id, req.user.organization_id, date);
      return ApiResponse.success(res, { date, assignments, today: todayStr() });
    } catch (err) {
      console.error('Duties mine error:', err);
      return ApiResponse.error(res, 'Failed to load your duties');
    }
  }

  static async start(req, res) {
    try {
      const assignment = await Duty.getAssignmentById(req.params.id);
      if (!assignment || assignment.org_id !== req.user.organization_id) {
        return ApiResponse.error(res, 'Duty not found', 404);
      }
      // An employee may only start their own duty; managers may start on behalf.
      if (assignment.user_id !== req.user.id && !canManage(req)) {
        return ApiResponse.error(res, 'This duty is not assigned to you', 403);
      }
      if (assignment.status === 'in_progress') {
        return ApiResponse.error(res, 'This duty is already running', 400);
      }
      if (assignment.status === 'completed') {
        return ApiResponse.error(res, 'This duty is already finished', 400);
      }

      const ok = await Duty.start(req.params.id);
      if (!ok) return ApiResponse.error(res, 'Could not start this duty', 400);

      const updated = await Duty.getAssignmentById(req.params.id);
      return ApiResponse.success(res, { assignment: updated }, 'Duty started');
    } catch (err) {
      console.error('Duty start error:', err);
      return ApiResponse.error(res, 'Failed to start duty');
    }
  }

  static async finish(req, res) {
    try {
      const assignment = await Duty.getAssignmentById(req.params.id);
      if (!assignment || assignment.org_id !== req.user.organization_id) {
        return ApiResponse.error(res, 'Duty not found', 404);
      }
      if (assignment.user_id !== req.user.id && !canManage(req)) {
        return ApiResponse.error(res, 'This duty is not assigned to you', 403);
      }
      if (assignment.status !== 'in_progress') {
        return ApiResponse.error(res, 'Start this duty before finishing it', 400);
      }

      const note = (req.body && req.body.note) ? String(req.body.note).trim().slice(0, 500) : null;
      const ok = await Duty.finish(req.params.id, note);
      if (!ok) return ApiResponse.error(res, 'Could not finish this duty', 400);

      const updated = await Duty.getAssignmentById(req.params.id);
      return ApiResponse.success(res, { assignment: updated }, 'Duty completed');
    } catch (err) {
      console.error('Duty finish error:', err);
      return ApiResponse.error(res, 'Failed to finish duty');
    }
  }

  // ── Catalogue CRUD — the raw duty only ───────────────────────────

  static async listCatalogue(req, res) {
    try {
      const orgId = req.user.organization_id;
      const includeInactive = req.query.inactive === '1';
      const duties = await Duty.getCatalogue(orgId, includeInactive);
      const schedules = await Duty.getAllSchedules(orgId);
      const employees = await Duty.getEmployees(orgId);
      return ApiResponse.success(res, { duties, schedules, employees });
    } catch (err) {
      console.error('Duty catalogue error:', err);
      return ApiResponse.error(res, 'Failed to load the duty catalogue');
    }
  }

  static async createDuty(req, res) {
    try {
      const { title, description, category, estimated_minutes, sort_order } = req.body;

      if (!title || !String(title).trim()) {
        return ApiResponse.error(res, 'Title is required', 400);
      }

      const id = await Duty.create({
        org_id: req.user.organization_id,
        title: String(title).trim(),
        description: description ? String(description).trim() : null,
        category: category ? String(category).trim() : null,
        estimated_minutes: estimated_minutes ? parseInt(estimated_minutes, 10) : null,
        sort_order: sort_order ? parseInt(sort_order, 10) : 0,
        created_by: req.user.id
      });

      const duty = await Duty.getById(id, req.user.organization_id);
      return ApiResponse.success(res, { duty }, 'Duty created', 201);
    } catch (err) {
      console.error('Duty create error:', err);
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async updateDuty(req, res) {
    try {
      const orgId = req.user.organization_id;
      const existing = await Duty.getById(req.params.id, orgId);
      if (!existing) return ApiResponse.error(res, 'Duty not found', 404);

      const fields = {};
      const b = req.body;

      if (b.title !== undefined) {
        if (!String(b.title).trim()) return ApiResponse.error(res, 'Title is required', 400);
        fields.title = String(b.title).trim();
      }
      if (b.description !== undefined) fields.description = b.description ? String(b.description).trim() : null;
      if (b.category !== undefined) fields.category = b.category ? String(b.category).trim() : null;
      if (b.estimated_minutes !== undefined) fields.estimated_minutes = b.estimated_minutes ? parseInt(b.estimated_minutes, 10) : null;
      if (b.sort_order !== undefined) fields.sort_order = parseInt(b.sort_order, 10) || 0;
      if (b.is_active !== undefined) fields.is_active = b.is_active ? 1 : 0;

      await Duty.update(req.params.id, orgId, fields);
      const duty = await Duty.getById(req.params.id, orgId);
      return ApiResponse.success(res, { duty }, 'Duty updated');
    } catch (err) {
      console.error('Duty update error:', err);
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async deleteDuty(req, res) {
    try {
      const orgId = req.user.organization_id;
      const existing = await Duty.getById(req.params.id, orgId);
      if (!existing) return ApiResponse.error(res, 'Duty not found', 404);

      await Duty.deactivate(req.params.id, orgId);
      return ApiResponse.success(res, {}, 'Duty archived');
    } catch (err) {
      console.error('Duty delete error:', err);
      return ApiResponse.error(res, 'Failed to archive duty');
    }
  }

  // ── Schedule rules — how a duty is managed ───────────────────────

  static async listSchedules(req, res) {
    try {
      const duty = await Duty.getById(req.params.id, req.user.organization_id);
      if (!duty) return ApiResponse.error(res, 'Duty not found', 404);
      const schedules = await Duty.getSchedules(req.params.id);
      return ApiResponse.success(res, { duty, schedules });
    } catch (err) {
      console.error('Duty schedules list error:', err);
      return ApiResponse.error(res, 'Failed to load schedules');
    }
  }

  static async addSchedule(req, res) {
    try {
      const orgId = req.user.organization_id;
      const duty = await Duty.getById(req.params.id, orgId);
      if (!duty) return ApiResponse.error(res, 'Duty not found', 404);

      const { user_id, recurrence, recurrence_days, start_date, end_date } = req.body;

      if (!user_id) return ApiResponse.error(res, 'Pick an employee', 400);
      const employees = await Duty.getEmployees(orgId);
      if (!employees.some(e => e.id === parseInt(user_id, 10))) {
        return ApiResponse.error(res, 'That employee is not in your organization', 400);
      }

      const rec = ['once', 'daily', 'weekly'].includes(recurrence) ? recurrence : 'weekly';
      if (rec === 'weekly' && !String(recurrence_days || '').trim()) {
        return ApiResponse.error(res, 'Pick at least one weekday', 400);
      }

      const start = resolveDate(start_date);
      const end = end_date && isValidDate(end_date) ? end_date : null;
      if (end && end < start) {
        return ApiResponse.error(res, 'The end date must fall on or after the start date', 400);
      }

      await Duty.addSchedule({
        duty_id: parseInt(req.params.id, 10),
        user_id: parseInt(user_id, 10),
        recurrence: rec,
        recurrence_days: recurrence_days || null,
        start_date: start,
        end_date: end,
        created_by: req.user.id
      });

      const schedules = await Duty.getSchedules(req.params.id);
      return ApiResponse.success(res, { schedules }, 'Schedule added', 201);
    } catch (err) {
      console.error('Duty add schedule error:', err);
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async deleteSchedule(req, res) {
    try {
      const schedule = await Duty.getScheduleById(req.params.scheduleId);
      if (!schedule || schedule.org_id !== req.user.organization_id) {
        return ApiResponse.error(res, 'Schedule not found', 404);
      }
      await Duty.deleteSchedule(req.params.scheduleId);
      return ApiResponse.success(res, {}, 'Schedule removed');
    } catch (err) {
      console.error('Duty delete schedule error:', err);
      return ApiResponse.error(res, 'Failed to remove schedule');
    }
  }

  // ── Day schedule (manage roles) ──────────────────────────────────

  static async schedule(req, res) {
    try {
      const orgId = req.user.organization_id;
      const date = resolveDate(req.query.date);
      const assignments = await Duty.getScheduleForDate(orgId, date);
      const stats = await Duty.getDayStats(orgId, date);
      const employees = await Duty.getEmployees(orgId);
      return ApiResponse.success(res, { date, assignments, stats, employees, today: todayStr() });
    } catch (err) {
      console.error('Duty day schedule error:', err);
      return ApiResponse.error(res, 'Failed to load the schedule');
    }
  }

  static async assign(req, res) {
    try {
      const orgId = req.user.organization_id;
      const { duty_id, user_id, duty_date, note } = req.body;

      if (!duty_id || !user_id) return ApiResponse.error(res, 'Duty and employee are required', 400);
      if (!duty_date || !isValidDate(duty_date)) return ApiResponse.error(res, 'A valid date is required', 400);

      const duty = await Duty.getById(duty_id, orgId);
      if (!duty) return ApiResponse.error(res, 'Duty not found', 404);

      const employees = await Duty.getEmployees(orgId);
      if (!employees.some(e => e.id === parseInt(user_id, 10))) {
        return ApiResponse.error(res, 'That employee is not in your organization', 400);
      }

      await Duty.assign({
        duty_id: parseInt(duty_id, 10),
        user_id: parseInt(user_id, 10),
        duty_date,
        assigned_by: req.user.id,
        note: note ? String(note).trim().slice(0, 500) : null
      });

      const assignments = await Duty.getScheduleForDate(orgId, duty_date);
      return ApiResponse.success(res, { assignments }, 'Duty assigned');
    } catch (err) {
      console.error('Duty assign error:', err);
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async unassign(req, res) {
    try {
      const assignment = await Duty.getAssignmentById(req.params.id);
      if (!assignment || assignment.org_id !== req.user.organization_id) {
        return ApiResponse.error(res, 'Assignment not found', 404);
      }
      if (assignment.status === 'completed') {
        return ApiResponse.error(res, 'A completed duty cannot be removed — it is part of the record', 400);
      }

      const ok = await Duty.skip(req.params.id);
      if (!ok) return ApiResponse.error(res, 'Could not remove this assignment', 400);
      return ApiResponse.success(res, {}, 'Duty removed from that day');
    } catch (err) {
      console.error('Duty unassign error:', err);
      return ApiResponse.error(res, 'Failed to remove assignment');
    }
  }

  // ── Report (manage roles) ────────────────────────────────────────

  static async report(req, res) {
    try {
      const orgId = req.user.organization_id;
      const to = resolveDate(req.query.to);
      // Default window: the 30 days ending on `to`.
      let from = req.query.from;
      if (!from || !isValidDate(from)) {
        const d = new Date(to + 'T00:00:00');
        d.setDate(d.getDate() - 29);
        from = d.toISOString().split('T')[0];
      }
      if (from > to) return ApiResponse.error(res, 'The start date must fall on or before the end date', 400);

      const rows = await Duty.getReport(orgId, from, to);
      const summary = await Duty.getReportSummary(orgId, from, to);
      return ApiResponse.success(res, { from, to, rows, summary });
    } catch (err) {
      console.error('Duty report error:', err);
      return ApiResponse.error(res, 'Failed to build the report');
    }
  }
}

module.exports = DutyController;
