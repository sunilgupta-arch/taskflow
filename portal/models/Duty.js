const db = require('../../config/db');

// Day-of-week numbers: 0=Sun,1=Mon,...,6=Sat
// Same convention as models/Task.js and models/ClientRequest.js
function matchesDate(schedule, dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const startStr = String(schedule.start_date).split('T')[0];
  const start = new Date(startStr + 'T00:00:00');
  const end = schedule.end_date
    ? new Date(String(schedule.end_date).split('T')[0] + 'T00:00:00')
    : null;

  if (d < start) return false;
  if (end && d > end) return false;

  if (schedule.recurrence === 'once') return dateStr === startStr;
  if (schedule.recurrence === 'daily') return true;
  if (schedule.recurrence === 'weekly') {
    const days = String(schedule.recurrence_days || '')
      .split(',')
      .filter(s => s !== '')
      .map(Number);
    return days.includes(d.getDay());
  }
  return false;
}

// MySQL returns SUM()/AVG() as DECIMAL, which mysql2 hands back as a *string*.
// Left alone, "0" + "0" concatenates to "00" in the UI. Coerce on the way out.
function toNum(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function numify(row, keys) {
  for (const k of keys) if (k in row) row[k] = toNum(row[k]);
  return row;
}

// Elapsed seconds for a running duty, computed in SQL so we never depend on the
// client's clock or on how the driver hands DATETIME values back.
const RUNNING_SECONDS = `CASE WHEN da.status = 'in_progress' AND da.started_at IS NOT NULL
       THEN TIMESTAMPDIFF(SECOND, da.started_at, UTC_TIMESTAMP()) ELSE NULL END AS running_seconds`;

const ASSIGNMENT_COLS = `da.id, da.duty_id, da.user_id, da.duty_date, da.status,
       da.started_at, da.completed_at, da.duration_seconds, da.source, da.note, da.schedule_id,
       d.title, d.description, d.category, d.estimated_minutes, d.sort_order,
       u.name AS user_name,
       ${RUNNING_SECONDS}`;

class Duty {

  // ═══ WHAT: the raw duty catalogue ════════════════════════════════

  static async getCatalogue(orgId, includeInactive = false) {
    const [rows] = await db.query(
      `SELECT d.*,
              creator.name AS created_by_name,
              (SELECT COUNT(*) FROM duty_schedules s WHERE s.duty_id = d.id AND s.is_active = 1) AS schedule_count,
              (SELECT COUNT(*) FROM duty_assignments da WHERE da.duty_id = d.id) AS assignment_count
       FROM store_duties d
       LEFT JOIN users creator ON creator.id = d.created_by
       WHERE d.org_id = ? ${includeInactive ? '' : 'AND d.is_active = 1'}
       ORDER BY d.category IS NULL, d.category, d.sort_order, d.id`,
      [orgId]
    );
    return rows.map(r => numify(r, ['schedule_count', 'assignment_count']));
  }

  static async getById(dutyId, orgId) {
    const [[row]] = await db.query(
      'SELECT * FROM store_duties WHERE id = ? AND org_id = ?',
      [dutyId, orgId]
    );
    return row || null;
  }

  static async create(data) {
    const [result] = await db.query(
      `INSERT INTO store_duties
         (org_id, title, description, category, estimated_minutes, sort_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.org_id,
        data.title,
        data.description || null,
        data.category || null,
        data.estimated_minutes || null,
        data.sort_order || 0,
        data.created_by || null
      ]
    );
    return result.insertId;
  }

  static async update(dutyId, orgId, fields) {
    const allowed = ['title', 'description', 'category', 'estimated_minutes', 'sort_order', 'is_active'];
    const updates = [];
    const params = [];

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        params.push(fields[key]);
      }
    }
    if (!updates.length) return;

    params.push(dutyId, orgId);
    await db.query(
      `UPDATE store_duties SET ${updates.join(', ')} WHERE id = ? AND org_id = ?`,
      params
    );
  }

  // Soft delete. History in duty_assignments depends on the row surviving.
  static async deactivate(dutyId, orgId) {
    await db.query(
      'UPDATE store_duties SET is_active = 0 WHERE id = ? AND org_id = ?',
      [dutyId, orgId]
    );
    // Stop it generating more work, and drop future rows nobody has started.
    await db.query('UPDATE duty_schedules SET is_active = 0 WHERE duty_id = ?', [dutyId]);
    await db.query(
      `DELETE FROM duty_assignments
       WHERE duty_id = ? AND status = 'pending' AND duty_date > CURDATE()`,
      [dutyId]
    );
  }

  // ═══ HOW: management rules ═══════════════════════════════════════

  /** Rules attached to one duty. */
  static async getSchedules(dutyId) {
    const [rows] = await db.query(
      `SELECT s.*, u.name AS user_name
       FROM duty_schedules s
       JOIN users u ON u.id = s.user_id
       WHERE s.duty_id = ?
       ORDER BY s.is_active DESC, u.name`,
      [dutyId]
    );
    return rows;
  }

  /** Every rule in the org, for the catalogue overview. */
  static async getAllSchedules(orgId) {
    const [rows] = await db.query(
      `SELECT s.*, u.name AS user_name
       FROM duty_schedules s
       JOIN store_duties d ON d.id = s.duty_id
       JOIN users u ON u.id = s.user_id
       WHERE d.org_id = ? AND s.is_active = 1
       ORDER BY s.duty_id, u.name`,
      [orgId]
    );
    return rows;
  }

  static async getScheduleById(scheduleId) {
    const [[row]] = await db.query(
      `SELECT s.*, d.org_id, d.title
       FROM duty_schedules s
       JOIN store_duties d ON d.id = s.duty_id
       WHERE s.id = ?`,
      [scheduleId]
    );
    return row || null;
  }

  static async addSchedule(data) {
    const [result] = await db.query(
      `INSERT INTO duty_schedules
         (duty_id, user_id, recurrence, recurrence_days, start_date, end_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.duty_id,
        data.user_id,
        data.recurrence,
        data.recurrence === 'weekly' ? (data.recurrence_days || null) : null,
        data.start_date,
        data.end_date || null,
        data.created_by || null
      ]
    );
    return result.insertId;
  }

  static async updateSchedule(scheduleId, fields) {
    const allowed = ['user_id', 'recurrence', 'recurrence_days', 'start_date', 'end_date', 'is_active'];
    const updates = [];
    const params = [];

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        params.push(fields[key]);
      }
    }
    if (!updates.length) return;

    params.push(scheduleId);
    await db.query(`UPDATE duty_schedules SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  static async deleteSchedule(scheduleId) {
    // Remove future work this rule would have produced, then drop the rule.
    await db.query(
      `DELETE FROM duty_assignments
       WHERE schedule_id = ? AND status = 'pending' AND duty_date > CURDATE()`,
      [scheduleId]
    );
    const [result] = await db.query('DELETE FROM duty_schedules WHERE id = ?', [scheduleId]);
    return result.affectedRows > 0;
  }

  // ═══ Materialization ═════════════════════════════════════════════

  /**
   * Ensure work rows exist for every active schedule rule that applies to this
   * date. Idempotent via the (duty_id, user_id, duty_date) unique key, so a
   * skipped row is never resurrected.
   */
  static async materializeForDate(orgId, dateStr) {
    const [schedules] = await db.query(
      `SELECT s.id, s.duty_id, s.user_id, s.recurrence, s.recurrence_days, s.start_date, s.end_date
       FROM duty_schedules s
       JOIN store_duties d ON d.id = s.duty_id
       WHERE d.org_id = ? AND d.is_active = 1 AND s.is_active = 1`,
      [orgId]
    );

    const applicable = schedules.filter(s => matchesDate(s, dateStr));
    if (!applicable.length) return 0;

    const values = applicable.map(s => [s.duty_id, s.user_id, dateStr, s.id, 'pending', 'auto']);
    const [result] = await db.query(
      `INSERT IGNORE INTO duty_assignments
         (duty_id, user_id, duty_date, schedule_id, status, source)
       VALUES ?`,
      [values]
    );
    return result.affectedRows;
  }

  // ═══ THE WORK ════════════════════════════════════════════════════

  /** One employee's duties for a date. */
  static async getForUser(userId, orgId, dateStr) {
    await Duty.materializeForDate(orgId, dateStr);
    const [rows] = await db.query(
      `SELECT ${ASSIGNMENT_COLS}
       FROM duty_assignments da
       JOIN store_duties d ON d.id = da.duty_id
       JOIN users u ON u.id = da.user_id
       WHERE da.user_id = ? AND da.duty_date = ? AND da.status != 'skipped'
       ORDER BY d.category IS NULL, d.category, d.sort_order, da.id`,
      [userId, dateStr]
    );
    return rows;
  }

  /** Everyone's duties for a date — admin schedule view. */
  static async getScheduleForDate(orgId, dateStr) {
    await Duty.materializeForDate(orgId, dateStr);
    const [rows] = await db.query(
      `SELECT ${ASSIGNMENT_COLS}, da.assigned_by, ab.name AS assigned_by_name
       FROM duty_assignments da
       JOIN store_duties d ON d.id = da.duty_id
       JOIN users u ON u.id = da.user_id
       LEFT JOIN users ab ON ab.id = da.assigned_by
       WHERE d.org_id = ? AND da.duty_date = ? AND da.status != 'skipped'
       ORDER BY u.name, d.category IS NULL, d.category, d.sort_order, da.id`,
      [orgId, dateStr]
    );
    return rows;
  }

  static async getAssignmentById(assignmentId) {
    const [[row]] = await db.query(
      `SELECT da.*, d.title, d.org_id, d.estimated_minutes
       FROM duty_assignments da
       JOIN store_duties d ON d.id = da.duty_id
       WHERE da.id = ?`,
      [assignmentId]
    );
    return row || null;
  }

  /**
   * Manually put a duty on someone's day. A previously skipped row is revived
   * rather than duplicated.
   */
  static async assign({ duty_id, user_id, duty_date, assigned_by, note }) {
    const [result] = await db.query(
      `INSERT INTO duty_assignments (duty_id, user_id, duty_date, status, source, assigned_by, note)
       VALUES (?, ?, ?, 'pending', 'manual', ?, ?)
       ON DUPLICATE KEY UPDATE
         status      = IF(duty_assignments.status = 'skipped', 'pending', duty_assignments.status),
         source      = 'manual',
         assigned_by = VALUES(assigned_by),
         note        = VALUES(note)`,
      [duty_id, user_id, duty_date, assigned_by, note || null]
    );
    return result.insertId;
  }

  /**
   * Take a duty off someone's day. Marked skipped rather than deleted so that
   * materialization does not immediately recreate it on the next read.
   */
  static async skip(assignmentId) {
    const [result] = await db.query(
      `UPDATE duty_assignments SET status = 'skipped'
       WHERE id = ? AND status IN ('pending', 'in_progress')`,
      [assignmentId]
    );
    return result.affectedRows > 0;
  }

  // ═══ Time tracking ═══════════════════════════════════════════════

  static async start(assignmentId) {
    const [result] = await db.query(
      `UPDATE duty_assignments
       SET status = 'in_progress', started_at = UTC_TIMESTAMP(),
           completed_at = NULL, duration_seconds = NULL
       WHERE id = ? AND status = 'pending'`,
      [assignmentId]
    );
    return result.affectedRows > 0;
  }

  static async finish(assignmentId, note) {
    const [result] = await db.query(
      `UPDATE duty_assignments
       SET status = 'completed',
           completed_at = UTC_TIMESTAMP(),
           duration_seconds = TIMESTAMPDIFF(SECOND, started_at, UTC_TIMESTAMP()),
           note = COALESCE(?, note)
       WHERE id = ? AND status = 'in_progress'`,
      [note || null, assignmentId]
    );
    return result.affectedRows > 0;
  }

  // ═══ Reporting ═══════════════════════════════════════════════════

  /**
   * Completed-duty time stats over a date range, one row per (duty, employee).
   * This is the answer to "how long does each person take on this job".
   */
  static async getReport(orgId, fromDate, toDate) {
    const [rows] = await db.query(
      `SELECT d.id AS duty_id, d.title, d.category, d.estimated_minutes,
              u.id AS user_id, u.name AS user_name,
              COUNT(*) AS runs,
              ROUND(AVG(da.duration_seconds)) AS avg_seconds,
              MIN(da.duration_seconds) AS fastest_seconds,
              MAX(da.duration_seconds) AS slowest_seconds,
              SUM(da.duration_seconds) AS total_seconds
       FROM duty_assignments da
       JOIN store_duties d ON d.id = da.duty_id
       JOIN users u ON u.id = da.user_id
       WHERE d.org_id = ?
         AND da.status = 'completed'
         AND da.duration_seconds IS NOT NULL
         AND da.duty_date BETWEEN ? AND ?
       GROUP BY d.id, d.title, d.category, d.estimated_minutes, u.id, u.name
       ORDER BY d.category IS NULL, d.category, d.title, u.name`,
      [orgId, fromDate, toDate]
    );
    return rows.map(r => numify(r, ['runs', 'avg_seconds', 'fastest_seconds', 'slowest_seconds', 'total_seconds']));
  }

  /** Headline counters for the report header. */
  static async getReportSummary(orgId, fromDate, toDate) {
    const [[row]] = await db.query(
      `SELECT
         COUNT(*) AS total_assignments,
         SUM(da.status = 'completed')   AS completed,
         SUM(da.status = 'pending')     AS pending,
         SUM(da.status = 'in_progress') AS in_progress,
         SUM(da.duration_seconds)       AS total_seconds
       FROM duty_assignments da
       JOIN store_duties d ON d.id = da.duty_id
       WHERE d.org_id = ? AND da.duty_date BETWEEN ? AND ? AND da.status != 'skipped'`,
      [orgId, fromDate, toDate]
    );
    if (!row) return {};
    return numify(row, ['total_assignments', 'completed', 'pending', 'in_progress', 'total_seconds']);
  }

  /** Completion counts per employee for a single date — schedule header chips. */
  static async getDayStats(orgId, dateStr) {
    const [rows] = await db.query(
      `SELECT u.id AS user_id, u.name AS user_name,
              COUNT(*) AS total,
              SUM(da.status = 'completed')   AS completed,
              SUM(da.status = 'in_progress') AS in_progress,
              SUM(da.duration_seconds) AS total_seconds
       FROM duty_assignments da
       JOIN store_duties d ON d.id = da.duty_id
       JOIN users u ON u.id = da.user_id
       WHERE d.org_id = ? AND da.duty_date = ? AND da.status != 'skipped'
       GROUP BY u.id, u.name
       ORDER BY u.name`,
      [orgId, dateStr]
    );
    return rows.map(r => numify(r, ['total', 'completed', 'in_progress', 'total_seconds']));
  }

  /** Store employees who can be given duties. */
  static async getEmployees(orgId) {
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.organization_id = ? AND u.is_active = 1
         AND r.name LIKE 'CLIENT_%'
         AND u.email != 'system@taskflow.local'
       ORDER BY u.name`,
      [orgId]
    );
    return rows;
  }
}

module.exports = Duty;
module.exports.matchesDate = matchesDate;
