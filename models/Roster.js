const db = require('../config/db');

class Roster {
  // Monday-anchored start of the week containing dateStr ('YYYY-MM-DD')
  static getWeekStart(dateStr) {
    const d = new Date(dateStr + 'T12:00:00Z');
    const day = d.getUTCDay(); // 0=Sun..6=Sat
    const diff = day === 0 ? -6 : 1 - day;
    d.setUTCDate(d.getUTCDate() + diff);
    return d.toISOString().split('T')[0];
  }

  static async getWeekOffForDate(userId, dateStr, defaultWeekOffDay) {
    const weekStart = Roster.getWeekStart(dateStr);
    const [rows] = await db.query(
      `SELECT weekoff_day FROM weekly_rosters
       WHERE user_id = ? AND week_start_date = ? AND status = 'published' LIMIT 1`,
      [userId, weekStart]
    );
    return rows.length ? rows[0].weekoff_day : defaultWeekOffDay;
  }

  // Batch lookup for calendar loops — returns Map keyed `${userId}-${weekStartDate}` -> weekoff_day
  static async getRosterMapForRange(userIds, startDate, endDate) {
    const map = new Map();
    if (!userIds || !userIds.length) return map;
    const weekStart = Roster.getWeekStart(startDate);
    const placeholders = userIds.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT user_id, week_start_date, weekoff_day FROM weekly_rosters
       WHERE user_id IN (${placeholders}) AND status = 'published'
         AND week_start_date BETWEEN ? AND ?`,
      [...userIds, weekStart, endDate]
    );
    rows.forEach(r => map.set(`${r.user_id}-${r.week_start_date}`, r.weekoff_day));
    return map;
  }

  static async getWeekPlan(weekStartDate) {
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.weekly_off_day AS default_day,
              wr.weekoff_day AS planned_day, wr.status AS roster_status,
              rr.requested_day, rr.note AS request_note, rr.status AS request_status
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN weekly_rosters wr ON wr.user_id = u.id AND wr.week_start_date = ?
       LEFT JOIN roster_requests rr ON rr.user_id = u.id AND rr.week_start_date = ?
       WHERE u.is_active = 1 AND r.name IN ('LOCAL_USER','LOCAL_MANAGER')
       ORDER BY u.name`,
      [weekStartDate, weekStartDate]
    );
    return rows;
  }

  // assignments = [{ user_id, weekoff_day }]. Returns the subset whose effective day changed.
  static async publishWeek(weekStartDate, assignments, publishedBy) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const changed = [];

      for (const a of assignments) {
        const [[existing]] = await conn.query(
          `SELECT weekoff_day FROM weekly_rosters WHERE user_id = ? AND week_start_date = ?`,
          [a.user_id, weekStartDate]
        );

        await conn.query(
          `INSERT INTO weekly_rosters (user_id, week_start_date, weekoff_day, status, created_by)
           VALUES (?, ?, ?, 'published', ?)
           ON DUPLICATE KEY UPDATE weekoff_day = VALUES(weekoff_day), status = 'published', created_by = VALUES(created_by)`,
          [a.user_id, weekStartDate, a.weekoff_day, publishedBy]
        );

        if (!existing || existing.weekoff_day !== a.weekoff_day) {
          changed.push({ user_id: a.user_id, weekoff_day: a.weekoff_day });
        }

        const [[request]] = await conn.query(
          `SELECT requested_day FROM roster_requests
           WHERE user_id = ? AND week_start_date = ? AND status = 'pending'`,
          [a.user_id, weekStartDate]
        );
        if (request) {
          await conn.query(
            `UPDATE roster_requests SET status = ?
             WHERE user_id = ? AND week_start_date = ? AND status = 'pending'`,
            [request.requested_day === a.weekoff_day ? 'fulfilled' : 'declined', a.user_id, weekStartDate]
          );
        }
      }

      await conn.commit();
      return changed;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  static async submitRequest(userId, weekStartDate, requestedDay, note) {
    await db.query(
      `INSERT INTO roster_requests (user_id, week_start_date, requested_day, note, status)
       VALUES (?, ?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE requested_day = VALUES(requested_day), note = VALUES(note), status = 'pending'`,
      [userId, weekStartDate, requestedDay, note || null]
    );
    return Roster.getMyRequest(userId, weekStartDate);
  }

  static async getMyRequest(userId, weekStartDate) {
    const [[row]] = await db.query(
      `SELECT * FROM roster_requests WHERE user_id = ? AND week_start_date = ?`,
      [userId, weekStartDate]
    );
    return row || null;
  }

  static async getMyRosterForWeek(userId, weekStartDate, defaultWeekOffDay) {
    const [[row]] = await db.query(
      `SELECT weekoff_day, status FROM weekly_rosters
       WHERE user_id = ? AND week_start_date = ? AND status = 'published'`,
      [userId, weekStartDate]
    );
    return {
      weekoff_day: row ? row.weekoff_day : defaultWeekOffDay,
      published: !!row
    };
  }
}

module.exports = Roster;
