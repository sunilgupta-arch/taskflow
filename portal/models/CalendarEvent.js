const db = require('../../config/db');

class CalendarEvent {

  static async create({ user_id, event_date, title, description, color }) {
    const [result] = await db.query(
      'INSERT INTO portal_calendar_events (user_id, event_date, title, description, color) VALUES (?, ?, ?, ?, ?)',
      [user_id, event_date, title, description || null, color || 'blue']
    );
    return result.insertId;
  }

  static async findById(id) {
    const [rows] = await db.query('SELECT * FROM portal_calendar_events WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async toggleDone(id) {
    await db.query('UPDATE portal_calendar_events SET is_done = NOT is_done WHERE id = ?', [id]);
  }

  static async update(id, fields) {
    const allowed = ['title', 'description', 'event_date', 'color', 'is_done'];
    const updates = [];
    const params = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        params.push(fields[key]);
      }
    }
    if (!updates.length) return;
    params.push(id);
    await db.query(`UPDATE portal_calendar_events SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  static async delete(id) {
    await db.query('DELETE FROM portal_calendar_events WHERE id = ?', [id]);
  }

  // Get all events for a user in a given year
  static async getForYear(userId, year) {
    const [rows] = await db.query(
      'SELECT * FROM portal_calendar_events WHERE user_id = ? AND YEAR(event_date) = ? ORDER BY event_date ASC',
      [userId, year]
    );
    return rows;
  }

  // Get events for a specific date
  static async getForDate(userId, date) {
    const [rows] = await db.query(
      'SELECT * FROM portal_calendar_events WHERE user_id = ? AND event_date = ? ORDER BY created_at ASC',
      [userId, date]
    );
    return rows;
  }

  // Get all dates that have events in a year (for dot indicators)
  static async getDatesWithEvents(userId, year) {
    const [rows] = await db.query(
      'SELECT DISTINCT event_date FROM portal_calendar_events WHERE user_id = ? AND YEAR(event_date) = ?',
      [userId, year]
    );
    return rows.map(r => {
      const d = r.event_date;
      return d instanceof Date ? d.toISOString().split('T')[0] : String(d).split('T')[0];
    });
  }

  // Get aggregated calendar data for a year: events + reminders + tasks
  static async getYearData(userId, year, roleName) {
    const isAdmin = ['CLIENT_ADMIN', 'CLIENT_TOP_MGMT'].includes(roleName);

    // User's own calendar events (table may not exist yet)
    let events = [];
    try { events = await CalendarEvent.getForYear(userId, year); } catch (_) {}

    // Reminders for this year (table may not exist yet)
    let reminders = [];
    try {
      const [rows] = await db.query(
        'SELECT id, title, note, remind_at, is_done FROM portal_reminders WHERE user_id = ? AND YEAR(remind_at) = ? ORDER BY remind_at ASC',
        [userId, year]
      );
      reminders = rows;
    } catch (_) {}

    // Tasks with due dates in this year
    let tasks;
    if (isAdmin) {
      const [rows] = await db.query(
        `SELECT t.id, t.title, t.priority, t.status, t.due_date,
                assignee.name as assigned_to_name
         FROM portal_tasks t
         JOIN users assignee ON assignee.id = t.assigned_to
         WHERE t.due_date IS NOT NULL AND YEAR(t.due_date) = ? AND t.is_archived = 0
         ORDER BY t.due_date ASC`,
        [year]
      );
      tasks = rows;
    } else {
      const [rows] = await db.query(
        `SELECT t.id, t.title, t.priority, t.status, t.due_date,
                assignee.name as assigned_to_name
         FROM portal_tasks t
         JOIN users assignee ON assignee.id = t.assigned_to
         WHERE t.due_date IS NOT NULL AND YEAR(t.due_date) = ? AND t.is_archived = 0
           AND (t.assigned_to = ? OR t.assigned_by = ?)
         ORDER BY t.due_date ASC`,
        [year, userId, userId]
      );
      tasks = rows;
    }

    // Build a date map: { "2026-04-13": { events: [], reminders: [], tasks: [] } }
    const dateMap = {};

    const ensureDate = (dateStr) => {
      if (!dateMap[dateStr]) dateMap[dateStr] = { events: [], reminders: [], tasks: [] };
    };

    for (const e of events) {
      const d = e.event_date instanceof Date ? e.event_date.toISOString().split('T')[0] : String(e.event_date).split('T')[0];
      ensureDate(d);
      dateMap[d].events.push(e);
    }

    for (const r of reminders) {
      const d = new Date(r.remind_at).toISOString().split('T')[0];
      ensureDate(d);
      dateMap[d].reminders.push(r);
    }

    for (const t of tasks) {
      const d = t.due_date instanceof Date ? t.due_date.toISOString().split('T')[0] : String(t.due_date).split('T')[0];
      ensureDate(d);
      dateMap[d].tasks.push(t);
    }

    return dateMap;
  }
}

module.exports = CalendarEvent;
