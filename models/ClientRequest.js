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

  // Auto-mark open/picked instances on past dates as 'missed'
  static async autoMarkMissed(dateStr) {
    const today = new Date().toISOString().split('T')[0];
    if (dateStr >= today) return;
    await db.query(
      `UPDATE client_request_instances
       SET status = 'missed'
       WHERE instance_date = ? AND status IN ('open', 'picked')`,
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

    const [instances] = await db.query(
      `SELECT cri.*,
              cr.title, cr.task_type, cr.description, cr.priority,
              cr.recurrence, cr.due_time, cr.assigned_to as default_assigned_to,
              cr.org_id, o.name as org_name,
              cr.created_by, creator.name as created_by_name,
              picker.name as picked_by_name,
              completer.name as completed_by_name,
              defaultAssignee.name as default_assigned_to_name
       FROM client_request_instances cri
       JOIN client_requests cr ON cri.request_id = cr.id
       JOIN organizations o ON cr.org_id = o.id
       JOIN users creator ON cr.created_by = creator.id
       LEFT JOIN users picker ON cri.picked_by = picker.id
       LEFT JOIN users completer ON cri.completed_by = completer.id
       LEFT JOIN users defaultAssignee ON cr.assigned_to = defaultAssignee.id
       WHERE cri.instance_date = ? AND cr.is_active = 1
       ORDER BY
         CASE WHEN cri.status IN ('open','picked') AND ? < CURDATE() THEN 0 ELSE 1 END ASC,
         CASE cri.status WHEN 'open' THEN 0 WHEN 'picked' THEN 1 WHEN 'done' THEN 2
                         WHEN 'missed' THEN 3 WHEN 'cancelled' THEN 4 END ASC,
         FIELD(cr.priority, 'urgent', 'high', 'normal') ASC,
         cr.due_time ASC`,
      [dateStr, dateStr]
    );

    return instances;
  }

  static async getInstanceById(instanceId) {
    const [[instance]] = await db.query(
      `SELECT cri.*,
              cr.title, cr.task_type, cr.description, cr.priority,
              cr.recurrence, cr.recurrence_days, cr.due_time,
              cr.start_date, cr.recurrence_end_date,
              cr.org_id, o.name as org_name,
              cr.created_by, creator.name as created_by_name,
              picker.name as picked_by_name,
              completer.name as completed_by_name
       FROM client_request_instances cri
       JOIN client_requests cr ON cri.request_id = cr.id
       JOIN organizations o ON cr.org_id = o.id
       JOIN users creator ON cr.created_by = creator.id
       LEFT JOIN users picker ON cri.picked_by = picker.id
       LEFT JOIN users completer ON cri.completed_by = completer.id
       WHERE cri.id = ?`,
      [instanceId]
    );
    return instance || null;
  }

  static async pick(instanceId, userId) {
    const [[inst]] = await db.query(
      'SELECT status FROM client_request_instances WHERE id = ?', [instanceId]
    );
    if (!inst || inst.status !== 'open') throw new Error('Task is not open');
    await db.query(
      `UPDATE client_request_instances
       SET status = 'picked', picked_by = ?, picked_at = NOW()
       WHERE id = ? AND status = 'open'`,
      [userId, instanceId]
    );
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
      'SELECT status FROM client_request_instances WHERE id = ?', [instanceId]
    );
    if (!inst || !['picked', 'open'].includes(inst.status)) throw new Error('Cannot complete this task');
    await db.query(
      `UPDATE client_request_instances
       SET status = 'done', completed_by = ?, completed_at = NOW(),
           picked_by = COALESCE(picked_by, ?), picked_at = COALESCE(picked_at, NOW())
       WHERE id = ?`,
      [userId, userId, instanceId]
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
      `SELECT crc.*, u.name as user_name, r.name as role_name
       FROM client_request_comments crc
       JOIN users u ON crc.user_id = u.id
       JOIN roles r ON u.role_id = r.id
       WHERE crc.instance_id = ?
       ORDER BY crc.created_at ASC`,
      [instanceId]
    );
    return rows;
  }

  static async addComment(instanceId, userId, body) {
    const [result] = await db.query(
      `INSERT INTO client_request_comments (instance_id, user_id, body) VALUES (?, ?, ?)`,
      [instanceId, userId, body]
    );
    const [[comment]] = await db.query(
      `SELECT crc.*, u.name as user_name, r.name as role_name
       FROM client_request_comments crc
       JOIN users u ON crc.user_id = u.id
       JOIN roles r ON u.role_id = r.id
       WHERE crc.id = ?`,
      [result.insertId]
    );
    return comment;
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
    const stats = { open: 0, picked: 0, done: 0, missed: 0, total: 0 };
    rows.forEach(r => { stats[r.status] = r.cnt; stats.total += r.cnt; });
    return stats;
  }

  // Used by portal: get instances for a specific org + date
  static async getInstancesForOrg(orgId, dateStr, userId = null, isSales = false) {
    await ClientRequest.autoMarkMissed(dateStr);
    const salesFilter = isSales && userId ? ' AND cr.created_by = ?' : '';
    const params = isSales && userId ? [dateStr, orgId, userId] : [dateStr, orgId];
    const [instances] = await db.query(
      `SELECT cri.*,
              cr.title, cr.task_type, cr.description, cr.priority,
              cr.recurrence, cr.due_time, cr.created_by,
              creator.name as created_by_name,
              picker.name as picked_by_name,
              completer.name as completed_by_name
       FROM client_request_instances cri
       JOIN client_requests cr ON cri.request_id = cr.id
       JOIN users creator ON cr.created_by = creator.id
       LEFT JOIN users picker ON cri.picked_by = picker.id
       LEFT JOIN users completer ON cri.completed_by = completer.id
       WHERE cri.instance_date = ? AND cr.org_id = ? AND cr.is_active = 1${salesFilter}
       ORDER BY
         FIELD(cr.priority, 'urgent', 'high', 'normal') ASC,
         cr.due_time ASC`,
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
    const [rows] = await db.query(
      `SELECT DISTINCT task_type FROM client_requests WHERE org_id = ? ORDER BY task_type ASC`,
      [orgId]
    );
    return rows.map(r => r.task_type);
  }

  // Edit a request template (portal admin)
  static async update(requestId, orgId, fields) {
    const allowed = ['title', 'task_type', 'description', 'priority', 'due_time',
                     'recurrence_end_date', 'assigned_to'];
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

  // Cancel a specific instance (portal side, only when open)
  static async cancelInstance(instanceId, orgId) {
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
      `UPDATE client_request_instances SET status = 'cancelled' WHERE id = ?`,
      [instanceId]
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
       ORDER BY u.name ASC`
    );
    return rows;
  }
}

module.exports = ClientRequest;
