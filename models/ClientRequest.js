const db = require('../config/db');

// Day-of-week numbers for weekly recurrence: 0=Sun,1=Mon,...,6=Sat
function matchesDate(req, dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const start = new Date(req.start_date + 'T00:00:00');
  const end = req.recurrence_end_date ? new Date(req.recurrence_end_date + 'T00:00:00') : null;
  if (d < start) return false;
  if (end && d > end) return false;

  if (req.recurrence === 'none') return dateStr === req.start_date;
  if (req.recurrence === 'daily') return true;
  if (req.recurrence === 'weekly') {
    const days = (req.recurrence_days || '').split(',').map(Number);
    return days.includes(d.getDay());
  }
  if (req.recurrence === 'monthly') {
    return d.getDate() === start.getDate();
  }
  return false;
}

class ClientRequest {

  // Auto-mark past instances as 'missed'.
  // One-time open instances are intentionally excluded — they carry forward until picked/done.
  static async autoMarkMissed(dateStr) {
    const today = new Date().toISOString().split('T')[0];
    if (dateStr >= today) return;
    await db.query(
      `UPDATE client_request_instances cri
       JOIN client_requests cr ON cri.request_id = cr.id
       SET cri.status = 'missed'
       WHERE cri.instance_date = ?
         AND cri.status = 'open'
         AND cr.recurrence != 'none'`,
      [dateStr]
    );
  }

  // Ensure instances exist for all active requests on a given date, return full list
  static async getQueueForDate(dateStr) {
    const [requests] = await db.query(
      `SELECT cr.*, u.name as created_by_name, o.name as org_name,
              assignee.name as assigned_to_name
       FROM client_requests cr
       JOIN users u ON cr.created_by = u.id
       JOIN organizations o ON cr.org_id = o.id
       LEFT JOIN users assignee ON cr.assigned_to = assignee.id
       WHERE cr.is_active = 1`,
      []
    );

    // Filter which requests apply to this date and build insert pairs
    const applicable = requests.filter(r => matchesDate(r, dateStr));

    if (applicable.length > 0) {
      const values = applicable.map(r => [r.id, dateStr, 'open']);
      await db.query(
        `INSERT IGNORE INTO client_request_instances (request_id, instance_date, status)
         VALUES ?`,
        [values]
      );
    }

    await ClientRequest.autoMarkMissed(dateStr);

    const today = new Date().toISOString().split('T')[0];
    // When viewing today, also surface past incomplete instances (open/missed/picked) as overdue
    const carryForward = dateStr === today
      ? `OR (cri.instance_date < ? AND cri.status IN ('open','missed','picked'))`
      : '';
    const queryParams = dateStr === today ? [dateStr, dateStr] : [dateStr];

    const instanceCols = `cri.*,
              cr.title, cr.task_type, cr.description, cr.priority,
              cr.recurrence, cr.due_time, cr.assigned_to as default_assigned_to,
              cr.org_id, o.name as org_name,
              cr.created_at as request_created_at,
              cr.created_by, creator.name as created_by_name,
              picker.name as picked_by_name,
              completer.name as completed_by_name,
              defaultAssignee.name as default_assigned_to_name,
              COALESCE(cri.assigned_to, cr.assigned_to) as effective_assigned_to,
              COALESCE(instanceAssignee.name, defaultAssignee.name) as effective_assigned_to_name,
              lc.body as latest_comment,
              lc_user.name as latest_comment_by,
              lc.created_at as latest_comment_at,
              COALESCE(crc_agg.cnt, 0) as comment_count,
              orig.instance_date as rescheduled_from_date,
              rescheduler.name as rescheduled_by_name,
              cb_user.name as cancelled_by_name`;
    const instanceJoins = `FROM client_request_instances cri
       JOIN client_requests cr ON cri.request_id = cr.id
       JOIN organizations o ON cr.org_id = o.id
       JOIN users creator ON cr.created_by = creator.id
       LEFT JOIN users picker ON cri.picked_by = picker.id
       LEFT JOIN users completer ON cri.completed_by = completer.id
       LEFT JOIN users defaultAssignee ON cr.assigned_to = defaultAssignee.id
       LEFT JOIN users instanceAssignee ON cri.assigned_to = instanceAssignee.id
       LEFT JOIN (
         SELECT instance_id, MAX(id) as max_id, COUNT(*) as cnt
         FROM client_request_comments
         GROUP BY instance_id
       ) crc_agg ON crc_agg.instance_id = cri.id
       LEFT JOIN client_request_comments lc ON lc.id = crc_agg.max_id
       LEFT JOIN users lc_user ON lc.user_id = lc_user.id
       LEFT JOIN client_request_instances orig ON orig.rescheduled_instance_id = cri.id
       LEFT JOIN users rescheduler ON orig.rescheduled_by = rescheduler.id
       LEFT JOIN users cb_user ON cri.cancelled_by = cb_user.id`;

    const [instances] = await db.query(
      `SELECT ${instanceCols} ${instanceJoins}
       WHERE (cri.instance_date = ? ${carryForward}) AND cr.is_active = 1 AND cri.status != 'cancelled'
       ORDER BY cri.id ASC`,
      queryParams
    );

    const [cancelledInstances] = await db.query(
      `SELECT ${instanceCols} ${instanceJoins}
       WHERE cri.instance_date = ? AND cr.is_active = 1 AND cri.status = 'cancelled'
       ORDER BY cri.id ASC`,
      [dateStr]
    );

    // Derive stats from fetched data — this is accurate because instances
    // already includes carry-forward open tasks from past dates, which a
    // plain instance_date = ? query would miss.
    const stats = { open: 0, picked: 0, done: 0, missed: 0, cancelled: cancelledInstances.length, approved: 0, rejected: 0, rescheduled: 0, total: 0 };
    instances.forEach(inst => {
      if (Object.prototype.hasOwnProperty.call(stats, inst.status)) stats[inst.status]++;
      stats.total++;
    });

    return { instances, cancelledInstances, stats };
  }

  static async getInstanceById(instanceId) {
    const [[instance]] = await db.query(
      `SELECT cri.*,
              cr.title, cr.task_type, cr.description, cr.priority,
              cr.recurrence, cr.recurrence_days, cr.due_time,
              cr.start_date, cr.recurrence_end_date,
              cr.org_id, o.name as org_name,
              cr.created_by, creator.name as created_by_name, creator.email as creator_email,
              picker.name as picked_by_name,
              completer.name as completed_by_name,
              orig.instance_date as rescheduled_from_date,
              rescheduler.name as rescheduled_by_name
       FROM client_request_instances cri
       JOIN client_requests cr ON cri.request_id = cr.id
       JOIN organizations o ON cr.org_id = o.id
       JOIN users creator ON cr.created_by = creator.id
       LEFT JOIN users picker ON cri.picked_by = picker.id
       LEFT JOIN users completer ON cri.completed_by = completer.id
       LEFT JOIN client_request_instances orig ON orig.rescheduled_instance_id = cri.id
       LEFT JOIN users rescheduler ON orig.rescheduled_by = rescheduler.id
       WHERE cri.id = ?`,
      [instanceId]
    );
    return instance || null;
  }

  static async pick(instanceId, userId) {
    const [result] = await db.query(
      `UPDATE client_request_instances
       SET status = 'picked', picked_by = ?, picked_at = UTC_TIMESTAMP()
       WHERE id = ? AND status IN ('open', 'missed', 'rejected')`,
      [userId, instanceId]
    );
    if (result.affectedRows === 0) throw new Error('Task cannot be picked — it may have already been picked by someone else');
  }

  static async release(instanceId, userId, reason) {
    const [[inst]] = await db.query(
      'SELECT status, picked_by FROM client_request_instances WHERE id = ?', [instanceId]
    );
    if (!inst || inst.status !== 'picked') throw new Error('Task is not picked');
    await db.query(
      `UPDATE client_request_instances
       SET status = 'open', picked_by = NULL, picked_at = NULL
       WHERE id = ?`,
      [instanceId]
    );
    await db.query(
      `INSERT INTO client_request_releases (instance_id, released_by, reason) VALUES (?, ?, ?)`,
      [instanceId, userId, reason || null]
    );
  }

  static async complete(instanceId, userId) {
    const [[inst]] = await db.query(
      'SELECT status, instance_date FROM client_request_instances WHERE id = ?', [instanceId]
    );
    if (!inst || inst.status !== 'picked') throw new Error('Task must be picked before it can be completed');
    const today = new Date().toISOString().split('T')[0];
    const isLate = inst.instance_date < today ? 1 : 0;
    await db.query(
      `UPDATE client_request_instances
       SET status = 'done', completed_by = ?, completed_at = UTC_TIMESTAMP(), completed_late = ?
       WHERE id = ?`,
      [userId, isLate, instanceId]
    );
  }

  static async getReleaseHistory(instanceId) {
    const [rows] = await db.query(
      `SELECT crr.*, u.name as released_by_name
       FROM client_request_releases crr
       JOIN users u ON crr.released_by = u.id
       WHERE crr.instance_id = ?
       ORDER BY crr.released_at DESC`,
      [instanceId]
    );
    return rows;
  }

  static async getComments(instanceId) {
    const [rows] = await db.query(
      `SELECT crc.*, u.name as commenter_name, r.name as commenter_role
       FROM client_request_comments crc
       JOIN users u ON crc.user_id = u.id
       JOIN roles r ON u.role_id = r.id
       WHERE crc.instance_id = ?
       ORDER BY crc.created_at ASC`,
      [instanceId]
    );
    if (!rows.length) return rows;
    const ids = rows.map(r => r.id);
    const [files] = await db.query(
      `SELECT * FROM client_request_comment_files WHERE comment_id IN (?)`,
      [ids]
    );
    const fileMap = {};
    files.forEach(f => {
      if (!fileMap[f.comment_id]) fileMap[f.comment_id] = [];
      fileMap[f.comment_id].push(f);
    });
    return rows.map(r => ({ ...r, files: fileMap[r.id] || [] }));
  }

  static async addCommentFiles(commentId, fileRows) {
    if (!fileRows.length) return;
    const values = fileRows.map(f => [
      commentId, f.uploaded_by, f.file_name, f.mime_type,
      f.drive_file_id, f.drive_view_link || null, f.file_size || null
    ]);
    await db.query(
      `INSERT INTO client_request_comment_files
       (comment_id, uploaded_by, file_name, mime_type, drive_file_id, drive_view_link, file_size)
       VALUES ?`,
      [values]
    );
  }

  static async getChatFile(fileId) {
    const [[row]] = await db.query(
      `SELECT cf.*, crc.instance_id
       FROM client_request_comment_files cf
       JOIN client_request_comments crc ON cf.comment_id = crc.id
       WHERE cf.id = ?`,
      [fileId]
    );
    return row || null;
  }

  static async addComment(instanceId, userId, body) {
    const [result] = await db.query(
      `INSERT INTO client_request_comments (instance_id, user_id, body) VALUES (?, ?, ?)`,
      [instanceId, userId, body]
    );
    const [[comment]] = await db.query(
      `SELECT crc.*, u.name as commenter_name, r.name as commenter_role
       FROM client_request_comments crc
       JOIN users u ON crc.user_id = u.id
       JOIN roles r ON u.role_id = r.id
       WHERE crc.id = ?`,
      [result.insertId]
    );
    return comment;
  }

  static async getInstanceContext(instanceId) {
    const [[row]] = await db.query(
      `SELECT cri.id, cri.picked_by, cri.instance_date, cr.title, cr.created_by, cr.org_id
       FROM client_request_instances cri
       JOIN client_requests cr ON cri.request_id = cr.id
       WHERE cri.id = ?`,
      [instanceId]
    );
    return row || null;
  }

  // Stats summary for a date (used by both sides)
  static async getDateStats(dateStr) {
    const [rows] = await db.query(
      `SELECT status, COUNT(*) as cnt
       FROM client_request_instances
       WHERE instance_date = ?
       GROUP BY status`,
      [dateStr]
    );
    const stats = { open: 0, picked: 0, done: 0, missed: 0, cancelled: 0, approved: 0, rejected: 0, rescheduled: 0, total: 0 };
    rows.forEach(r => {
      stats[r.status] = r.cnt;
      if (!['cancelled', 'rescheduled'].includes(r.status)) stats.total += r.cnt;
    });
    return stats;
  }

  static async getAvailableMonths() {
    const [rows] = await db.query(
      `SELECT DISTINCT DATE_FORMAT(instance_date, '%Y-%m') as year_month
       FROM client_request_instances
       WHERE instance_date <= CURDATE()
       ORDER BY year_month DESC`
    );
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return rows.map(r => {
      const [y, m] = r.year_month.split('-');
      return { value: r.year_month, label: `${monthNames[parseInt(m) - 1]} ${y}` };
    });
  }

  static async getMonthlyReport(yearMonth) {
    const [statsRows] = await db.query(
      `SELECT status, COUNT(*) as cnt
       FROM client_request_instances
       WHERE DATE_FORMAT(instance_date, '%Y-%m') = ?
       GROUP BY status`,
      [yearMonth]
    );
    const stats = { open: 0, picked: 0, done: 0, missed: 0, cancelled: 0, approved: 0, rejected: 0, rescheduled: 0, total: 0 };
    statsRows.forEach(r => {
      if (stats.hasOwnProperty(r.status)) stats[r.status] = parseInt(r.cnt);
      if (!['cancelled', 'rescheduled'].includes(r.status)) stats.total += parseInt(r.cnt);
    });
    const resolved = stats.done + stats.approved;
    stats.completionRate = stats.total > 0 ? Math.round((resolved / stats.total) * 100) : 0;
    stats.notPicked = stats.open + stats.missed;

    const [requests] = await db.query(
      `SELECT cri.id, cri.status, cri.instance_date, cri.picked_by,
              cri.picked_at, cri.completed_at, cri.completed_late, cri.rescheduled_to,
              cr.title, cr.task_type, cr.description, cr.priority, cr.recurrence, cr.due_time,
              creator.name as created_by_name,
              picker.name as picked_by_name,
              completer.name as completed_by_name,
              approver.name as approved_by_name,
              lc.body as latest_comment,
              lc_user.name as latest_comment_by
       FROM client_request_instances cri
       JOIN client_requests cr ON cri.request_id = cr.id
       JOIN users creator ON cr.created_by = creator.id
       LEFT JOIN users picker    ON cri.picked_by    = picker.id
       LEFT JOIN users completer ON cri.completed_by = completer.id
       LEFT JOIN users approver  ON cri.approved_by  = approver.id
       LEFT JOIN client_request_comments lc ON lc.id = (
         SELECT MAX(id) FROM client_request_comments WHERE instance_id = cri.id
       )
       LEFT JOIN users lc_user ON lc.user_id = lc_user.id
       WHERE DATE_FORMAT(cri.instance_date, '%Y-%m') = ?
       ORDER BY FIELD(cri.status,'missed','open','picked','rejected','rescheduled','done','approved','cancelled'),
                cri.instance_date ASC, cri.id ASC`,
      [yearMonth]
    );

    const [employeeRows] = await db.query(
      `SELECT u.id, u.name,
              COUNT(*) as total_handled,
              SUM(CASE WHEN cri.status IN ('done','approved') THEN 1 ELSE 0 END) as completed,
              SUM(CASE WHEN cri.status = 'picked' THEN 1 ELSE 0 END) as in_progress,
              SUM(CASE WHEN cri.status = 'rejected' THEN 1 ELSE 0 END) as rejected,
              SUM(CASE WHEN cri.status IN ('done','approved') AND cri.completed_late = 1 THEN 1 ELSE 0 END) as completed_late
       FROM client_request_instances cri
       JOIN users u ON cri.picked_by = u.id
       WHERE DATE_FORMAT(cri.instance_date, '%Y-%m') = ?
       GROUP BY u.id, u.name
       ORDER BY completed DESC, total_handled DESC`,
      [yearMonth]
    );

    return { stats, requests, employees: employeeRows };
  }

  // Used by portal: get instances for a specific org + date
  static async getInstancesForOrg(orgId, dateStr, userId = null, isSales = false) {
    await ClientRequest.autoMarkMissed(dateStr);
    const today = new Date().toISOString().split('T')[0];
    const salesFilter = isSales && userId ? ' AND cr.created_by = ?' : '';
    // When viewing today, also surface one-time open instances from past dates (carry-forward)
    const carryForward = dateStr === today
      ? `OR (cri.instance_date < ? AND cri.status = 'open' AND cr.recurrence = 'none' AND cr.org_id = ? AND cr.is_active = 1${salesFilter})`
      : '';
    let params;
    if (dateStr === today) {
      params = isSales && userId
        ? [dateStr, orgId, userId, today, orgId, userId]
        : [dateStr, orgId, today, orgId];
    } else {
      params = isSales && userId ? [dateStr, orgId, userId] : [dateStr, orgId];
    }
    const [instances] = await db.query(
      `SELECT cri.*,
              cr.title, cr.task_type, cr.description, cr.priority,
              cr.recurrence, cr.due_time, cr.created_by,
              creator.name as created_by_name,
              picker.name as picked_by_name,
              completer.name as completed_by_name,
              lc.body as latest_comment,
              lc_user.name as latest_comment_by,
              lc.created_at as latest_comment_at,
              (SELECT COUNT(*) FROM client_request_comments WHERE instance_id = cri.id) as comment_count,
              orig.instance_date as rescheduled_from_date,
              rescheduler.name as rescheduled_by_name
       FROM client_request_instances cri
       JOIN client_requests cr ON cri.request_id = cr.id
       JOIN users creator ON cr.created_by = creator.id
       LEFT JOIN users picker ON cri.picked_by = picker.id
       LEFT JOIN users completer ON cri.completed_by = completer.id
       LEFT JOIN client_request_comments lc ON lc.id = (
         SELECT MAX(id) FROM client_request_comments WHERE instance_id = cri.id
       )
       LEFT JOIN users lc_user ON lc.user_id = lc_user.id
       LEFT JOIN client_request_instances orig ON orig.rescheduled_instance_id = cri.id
       LEFT JOIN users rescheduler ON orig.rescheduled_by = rescheduler.id
       WHERE (cri.instance_date = ? AND cr.org_id = ? AND cr.is_active = 1${salesFilter} ${carryForward})
       ORDER BY
         cr.due_time ASC,
         FIELD(cr.priority, 'urgent', 'high', 'normal') ASC,
         CASE WHEN cri.status IN ('open','picked') AND cri.instance_date < CURDATE() THEN 0 ELSE 1 END ASC`,
      params
    );
    return instances;
  }

  // Used by portal: create a new request template
  static async create({ org_id, created_by, title, task_type, description, priority,
                        recurrence, recurrence_days, start_date, recurrence_end_date,
                        due_time, assigned_to }) {
    const [result] = await db.query(
      `INSERT INTO client_requests
         (org_id, created_by, title, task_type, description, priority,
          recurrence, recurrence_days, start_date, recurrence_end_date,
          due_time, assigned_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [org_id, created_by, title, task_type || 'General', description || null,
       priority || 'normal', recurrence || 'none',
       recurrence_days || null, start_date, recurrence_end_date || null,
       due_time || null, assigned_to || null]
    );
    return result.insertId;
  }

  // Used by portal: list all requests for an org (template management)
  static async getRequestsForOrg(orgId, includeInactive = false, userId = null, isSales = false) {
    const salesFilter = isSales && userId ? ' AND cr.created_by = ?' : '';
    const params = isSales && userId ? [orgId, userId] : [orgId];
    const [rows] = await db.query(
      `SELECT cr.*, u.name as created_by_name, assignee.name as assigned_to_name
       FROM client_requests cr
       JOIN users u ON cr.created_by = u.id
       LEFT JOIN users assignee ON cr.assigned_to = assignee.id
       WHERE cr.org_id = ?${includeInactive ? '' : ' AND cr.is_active = 1'}${salesFilter}
       ORDER BY cr.created_at DESC`,
      params
    );
    return rows;
  }

  static async getRequestById(requestId) {
    const [[row]] = await db.query('SELECT * FROM client_requests WHERE id = ?', [requestId]);
    return row || null;
  }

  static async deactivate(requestId, orgId) {
    await db.query(
      `UPDATE client_requests SET is_active = 0 WHERE id = ? AND org_id = ?`,
      [requestId, orgId]
    );
  }

  // Autocomplete task types for the portal's datalist
  static async getTaskTypes(orgId) {
    const defaults = [
      'General', 'Issue', 'Report', 'Technical', 'Ticket',
      'Suggestion', 'Support', 'Data Entry', 'Follow-up', 'Document Review'
    ];
    const [rows] = await db.query(
      `SELECT DISTINCT task_type FROM client_requests WHERE org_id = ? ORDER BY task_type ASC`,
      [orgId]
    );
    const priorityWords = new Set(['urgent', 'high', 'normal', 'low']);
    const fromDb = rows.map(r => r.task_type).filter(t => !priorityWords.has(t.toLowerCase()));
    const merged = [...new Set([...defaults, ...fromDb])].sort();
    return merged;
  }

  // Edit a request template (portal admin)
  static async update(requestId, orgId, fields) {
    const allowed = ['title', 'task_type', 'description', 'priority', 'due_time',
                     'recurrence_end_date', 'assigned_to', 'recurrence', 'recurrence_days'];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (key in fields) {
        sets.push(`${key} = ?`);
        vals.push(fields[key] === '' ? null : fields[key]);
      }
    }
    if (!sets.length) return;
    vals.push(requestId, orgId);
    await db.query(
      `UPDATE client_requests SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`,
      vals
    );
  }

  // Purge future open instances so the new recurrence schedule takes effect cleanly
  static async deleteFutureOpenInstances(requestId) {
    const today = new Date().toISOString().split('T')[0];
    await db.query(
      `DELETE FROM client_request_instances WHERE request_id = ? AND instance_date > ? AND status = 'open'`,
      [requestId, today]
    );
  }

  // Cancel a specific instance (portal side, only when open)
  static async cancelInstance(instanceId, orgId, userId) {
    const [[inst]] = await db.query(
      `SELECT cri.status, cr.org_id
       FROM client_request_instances cri
       JOIN client_requests cr ON cri.request_id = cr.id
       WHERE cri.id = ?`,
      [instanceId]
    );
    if (!inst) throw new Error('Not found');
    if (inst.org_id !== orgId) throw new Error('Not authorized');
    if (inst.status !== 'open') throw new Error('Only open tasks can be cancelled');
    await db.query(
      `UPDATE client_request_instances
       SET status = 'cancelled', cancelled_by = ?, cancelled_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [userId || null, instanceId]
    );
  }

  static async uncancelInstance(instanceId, userId) {
    const [[inst]] = await db.query(
      `SELECT cri.status, cri.instance_date
       FROM client_request_instances cri
       WHERE cri.id = ?`,
      [instanceId]
    );
    if (!inst) throw new Error('Not found');
    if (inst.status !== 'cancelled') throw new Error('Only cancelled requests can be restored');
    await db.query(
      `UPDATE client_request_instances
       SET status = 'open', uncancelled_by = ?, uncancelled_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [userId || null, instanceId]
    );
  }

  static async rescheduleInstance(instanceId, userId, newDate, reason, assignedTo = null) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [[inst]] = await conn.query(
        'SELECT status, request_id FROM client_request_instances WHERE id = ? FOR UPDATE',
        [instanceId]
      );
      if (!inst) throw new Error('Not found');
      if (inst.status !== 'open') throw new Error('Only open requests can be rescheduled');

      const [result] = await conn.query(
        `INSERT INTO client_request_instances (request_id, instance_date, status, assigned_to)
         VALUES (?, ?, 'open', ?)`,
        [inst.request_id, newDate, assignedTo || null]
      );
      const newInstanceId = result.insertId;

      await conn.query(
        `UPDATE client_request_instances
         SET status = 'rescheduled', rescheduled_to = ?, rescheduled_by = ?, rescheduled_instance_id = ?
         WHERE id = ?`,
        [newDate, userId, newInstanceId, instanceId]
      );

      await conn.query(
        `INSERT INTO client_request_comments (instance_id, user_id, body) VALUES (?, ?, ?)`,
        [instanceId, userId, `Rescheduled to ${newDate}: ${reason}`]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  static async approveInstance(instanceId, userId) {
    const [[inst]] = await db.query(
      'SELECT status FROM client_request_instances WHERE id = ?', [instanceId]
    );
    if (!inst) throw new Error('Not found');
    if (inst.status !== 'done') throw new Error('Only completed requests can be approved');
    await db.query(
      `UPDATE client_request_instances
       SET status = 'approved', approved_by = ?, approved_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [userId, instanceId]
    );
  }

  static async rejectInstance(instanceId, userId) {
    const [[inst]] = await db.query(
      'SELECT status FROM client_request_instances WHERE id = ?', [instanceId]
    );
    if (!inst) throw new Error('Not found');
    if (inst.status !== 'done') throw new Error('Only completed requests can be rejected');
    await db.query(
      `UPDATE client_request_instances
       SET status = 'rejected', rejected_by = ?, rejected_at = UTC_TIMESTAMP(),
           picked_by = NULL, picked_at = NULL, completed_by = NULL, completed_at = NULL
       WHERE id = ?`,
      [userId, instanceId]
    );
  }

  // Badge count: open instances for today for an org (filtered by creator for CLIENT_SALES)
  static async getOpenCountForOrg(orgId, userId = null, isSales = false) {
    const today = new Date().toISOString().split('T')[0];
    const salesFilter = isSales && userId ? ' AND cr.created_by = ?' : '';
    const params = isSales && userId ? [orgId, today, userId] : [orgId, today];
    const [[row]] = await db.query(
      `SELECT COUNT(*) as cnt
       FROM client_request_instances cri
       JOIN client_requests cr ON cri.request_id = cr.id
       WHERE cr.org_id = ? AND cri.instance_date = ? AND cri.status = 'open'${salesFilter}`,
      params
    );
    return row.cnt;
  }

  static async addAttachment({ request_id, instance_id, uploaded_by, file_name, mime_type, drive_file_id, drive_view_link, file_size }) {
    const [result] = await db.query(
      `INSERT INTO client_request_attachments
         (request_id, instance_id, uploaded_by, file_name, mime_type, drive_file_id, drive_view_link, file_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [request_id || null, instance_id || null, uploaded_by, file_name, mime_type || null,
       drive_file_id, drive_view_link || null, file_size || null]
    );
    return result.insertId;
  }

  static async getAttachments(requestId, instanceId) {
    const conditions = [];
    const params = [];
    if (requestId) { conditions.push('cra.request_id = ?'); params.push(requestId); }
    if (instanceId) { conditions.push('cra.instance_id = ?'); params.push(instanceId); }
    if (!conditions.length) return [];
    try {
      const [rows] = await db.query(
        `SELECT cra.*, u.name as uploaded_by_name
         FROM client_request_attachments cra
         JOIN users u ON cra.uploaded_by = u.id
         WHERE ${conditions.join(' OR ')}
         ORDER BY cra.created_at ASC`,
        params
      );
      return rows;
    } catch (err) {
      if (err.code === 'ER_NO_SUCH_TABLE') return [];
      throw err;
    }
  }

  // Get local users for assigning (LOCAL roles)
  static async getLocalUsers() {
    const [rows] = await db.query(
      `SELECT u.id, u.name, r.name as role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       JOIN organizations o ON u.organization_id = o.id
       WHERE o.org_type = 'LOCAL' AND u.is_active = 1
         AND r.name IN ('LOCAL_USER', 'LOCAL_MANAGER')
       ORDER BY u.name ASC`
    );
    return rows;
  }

  // Distinct portal users who have ever submitted a request
  static async getPortalClients() {
    const [rows] = await db.query(
      `SELECT DISTINCT u.id, u.name, o.name as org_name
       FROM users u
       JOIN client_requests cr ON cr.created_by = u.id
       JOIN organizations o ON u.organization_id = o.id
       WHERE u.is_active = 1
       ORDER BY u.name ASC`
    );
    return rows;
  }

  // Paginated search + filter across all instances (for the Search & Filter offcanvas)
  static async searchFilter({ clientId, pickedBy, q, page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    const params = [];
    const whereClauses = ['cr.is_active = 1'];

    if (clientId) {
      whereClauses.push('cr.created_by = ?');
      params.push(clientId);
    }
    if (pickedBy) {
      whereClauses.push('cri.picked_by = ?');
      params.push(pickedBy);
    }
    if (q) {
      const like = '%' + q + '%';
      whereClauses.push(
        '(cr.title LIKE ? OR cr.description LIKE ? OR EXISTS (SELECT 1 FROM client_request_comments _c WHERE _c.instance_id = cri.id AND _c.body LIKE ?))'
      );
      params.push(like, like, like);
    }

    const where = 'WHERE ' + whereClauses.join(' AND ');

    const baseSql = `
      FROM client_request_instances cri
      JOIN client_requests cr ON cri.request_id = cr.id
      JOIN organizations o ON cr.org_id = o.id
      JOIN users creator ON cr.created_by = creator.id
      LEFT JOIN users picker ON cri.picked_by = picker.id
      LEFT JOIN (
        SELECT c1.instance_id, c1.body, c1.created_at, c1.user_id
        FROM client_request_comments c1
        INNER JOIN (
          SELECT instance_id, MAX(created_at) as max_at FROM client_request_comments GROUP BY instance_id
        ) c2 ON c1.instance_id = c2.instance_id AND c1.created_at = c2.max_at
      ) lc ON lc.instance_id = cri.id
      LEFT JOIN users lc_user ON lc.user_id = lc_user.id
      LEFT JOIN (
        SELECT instance_id, COUNT(*) as comment_count FROM client_request_comments GROUP BY instance_id
      ) cnt ON cnt.instance_id = cri.id
      ${where}`;

    const [[{ total }]] = await db.query(`SELECT COUNT(*) as total ${baseSql}`, params);

    const [rows] = await db.query(
      `SELECT
        cri.id as instance_id, cri.request_id, cri.instance_date, cri.status,
        cri.picked_at, cri.completed_at, cri.completed_late, cri.picked_by,
        cr.title, cr.description, cr.priority, cr.task_type, cr.recurrence,
        cr.created_by, creator.name as created_by_name,
        o.name as org_name,
        picker.name as picked_by_name,
        lc.body as latest_comment,
        lc_user.name as latest_comment_by,
        lc.created_at as latest_comment_at,
        COALESCE(cnt.comment_count, 0) as comment_count
       ${baseSql}
       ORDER BY cri.instance_date DESC, cri.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return { rows, total, page, limit, hasMore: offset + rows.length < total };
  }

  // Same as searchFilter but returns all rows (no pagination) for CSV export
  static async searchFilterAll({ clientId, pickedBy, q }) {
    const params = [];
    const whereClauses = ['cr.is_active = 1'];

    if (clientId) { whereClauses.push('cr.created_by = ?'); params.push(clientId); }
    if (pickedBy) { whereClauses.push('cri.picked_by = ?'); params.push(pickedBy); }
    if (q) {
      const like = '%' + q + '%';
      whereClauses.push(
        '(cr.title LIKE ? OR cr.description LIKE ? OR EXISTS (SELECT 1 FROM client_request_comments _c WHERE _c.instance_id = cri.id AND _c.body LIKE ?))'
      );
      params.push(like, like, like);
    }

    const where = 'WHERE ' + whereClauses.join(' AND ');

    const [rows] = await db.query(
      `SELECT
        cri.id as instance_id, cri.request_id, cri.instance_date, cri.status,
        cri.picked_at, cri.completed_at, cri.completed_late, cri.picked_by,
        cr.title, cr.description, cr.priority, cr.task_type, cr.recurrence,
        cr.created_by, creator.name as created_by_name,
        o.name as org_name,
        picker.name as picked_by_name,
        COALESCE(cnt.comment_count, 0) as comment_count
       FROM client_request_instances cri
       JOIN client_requests cr ON cri.request_id = cr.id
       JOIN organizations o ON cr.org_id = o.id
       JOIN users creator ON cr.created_by = creator.id
       LEFT JOIN users picker ON cri.picked_by = picker.id
       LEFT JOIN (
         SELECT instance_id, COUNT(*) as comment_count FROM client_request_comments GROUP BY instance_id
       ) cnt ON cnt.instance_id = cri.id
       ${where}
       ORDER BY cri.instance_date DESC, cri.id DESC`,
      params
    );
    return rows;
  }
}

module.exports = ClientRequest;
