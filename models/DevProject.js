const db = require('../config/db');

class DevProject {

  // ── Projects ─────────────────────────────────────────────────────────

  static async getAll({ developerId = null, clientVisibleOnly = false } = {}) {
    const conditions = clientVisibleOnly ? ['dp.client_visible = 1'] : [];
    const params = [];
    if (developerId) { conditions.push('dp.developer_id = ?'); params.push(developerId); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [rows] = await db.query(`
      SELECT dp.*,
             u.name AS developer_name,
             COUNT(dt.id)                                          AS task_count,
             SUM(CASE WHEN dt.status = 'done' THEN 1 ELSE 0 END)  AS done_count
      FROM dev_projects dp
      JOIN users u ON u.id = dp.developer_id
      LEFT JOIN dev_tasks dt ON dt.project_id = dp.id
      ${where}
      GROUP BY dp.id
      ORDER BY dp.updated_at DESC
    `, params);

    return rows.map(r => ({
      ...r,
      task_count: parseInt(r.task_count) || 0,
      done_count: parseInt(r.done_count) || 0,
      progress:   r.task_count > 0 ? Math.round((r.done_count / r.task_count) * 100) : 0
    }));
  }

  static async getById(id) {
    const [[project]] = await db.query(`
      SELECT dp.*, u.name AS developer_name
      FROM dev_projects dp
      JOIN users u ON u.id = dp.developer_id
      WHERE dp.id = ?
    `, [id]);
    if (!project) return null;

    const [tasks] = await db.query(
      `SELECT * FROM dev_tasks WHERE project_id = ? ORDER BY sort_order, id`,
      [id]
    );
    const [milestones] = await db.query(
      `SELECT * FROM dev_milestones WHERE project_id = ? ORDER BY sort_order, id`,
      [id]
    );
    const [links] = await db.query(
      `SELECT * FROM dev_project_links WHERE project_id = ? ORDER BY id`,
      [id]
    );
    const doneCount = tasks.filter(t => t.status === 'done').length;
    project.tasks      = tasks;
    project.milestones = milestones;
    project.links      = links;
    project.progress   = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;
    return project;
  }

  static async create({ title, description, tech_stack, status, client_visible, developer_id }) {
    const [result] = await db.query(
      `INSERT INTO dev_projects (title, description, tech_stack, status, client_visible, developer_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, description || null, tech_stack || null, status || 'planning', client_visible ? 1 : 0, developer_id]
    );
    return result.insertId;
  }

  static async update(id, { title, description, tech_stack, status, client_visible }) {
    await db.query(
      `UPDATE dev_projects
       SET title = ?, description = ?, tech_stack = ?, status = ?, client_visible = ?
       WHERE id = ?`,
      [title, description || null, tech_stack || null, status, client_visible ? 1 : 0, id]
    );
  }

  static async delete(id) {
    await db.query('DELETE FROM dev_projects WHERE id = ?', [id]);
  }

  // ── Ownership check ───────────────────────────────────────────────────

  static async ownedBy(projectId, userId) {
    const [[row]] = await db.query(
      'SELECT developer_id FROM dev_projects WHERE id = ?', [projectId]
    );
    return row && row.developer_id === userId;
  }

  // ── Tasks ─────────────────────────────────────────────────────────────

  static async addTask(projectId, { title, priority, due_date, milestone_id }) {
    const [[{ maxOrder }]] = await db.query(
      'SELECT COALESCE(MAX(sort_order),0) AS maxOrder FROM dev_tasks WHERE project_id = ?',
      [projectId]
    );
    const [result] = await db.query(
      `INSERT INTO dev_tasks (project_id, title, status, priority, due_date, milestone_id, sort_order)
       VALUES (?, ?, 'todo', ?, ?, ?, ?)`,
      [projectId, title, priority || 'medium', due_date || null, milestone_id || null, maxOrder + 1]
    );
    return result.insertId;
  }

  static async updateTask(id, { title, status, priority, due_date, milestone_id }) {
    const fields = [], params = [];
    if (title        !== undefined) { fields.push('title = ?');        params.push(title); }
    if (status       !== undefined) { fields.push('status = ?');       params.push(status); }
    if (priority     !== undefined) { fields.push('priority = ?');     params.push(priority); }
    if (due_date     !== undefined) { fields.push('due_date = ?');     params.push(due_date || null); }
    if (milestone_id !== undefined) { fields.push('milestone_id = ?'); params.push(milestone_id || null); }
    if (!fields.length) return;
    params.push(id);
    await db.query(`UPDATE dev_tasks SET ${fields.join(', ')} WHERE id = ?`, params);
    await db.query(
      'UPDATE dev_projects SET updated_at = NOW() WHERE id = (SELECT project_id FROM dev_tasks WHERE id = ?)',
      [id]
    );
  }

  static async deleteTask(id) {
    await db.query('DELETE FROM dev_tasks WHERE id = ?', [id]);
  }

  // ── Milestones ────────────────────────────────────────────────────────

  static async addMilestone(projectId, { title, due_date }) {
    const [[{ maxOrder }]] = await db.query(
      'SELECT COALESCE(MAX(sort_order),0) AS maxOrder FROM dev_milestones WHERE project_id = ?',
      [projectId]
    );
    const [r] = await db.query(
      `INSERT INTO dev_milestones (project_id, title, due_date, sort_order) VALUES (?, ?, ?, ?)`,
      [projectId, title, due_date || null, maxOrder + 1]
    );
    return r.insertId;
  }

  static async updateMilestone(id, { title, due_date, status }) {
    const fields = [], params = [];
    if (title    !== undefined) { fields.push('title = ?');    params.push(title); }
    if (due_date !== undefined) { fields.push('due_date = ?'); params.push(due_date || null); }
    if (status   !== undefined) { fields.push('status = ?');   params.push(status); }
    if (!fields.length) return;
    params.push(id);
    await db.query(`UPDATE dev_milestones SET ${fields.join(', ')} WHERE id = ?`, params);
  }

  static async deleteMilestone(id) {
    await db.query('DELETE FROM dev_milestones WHERE id = ?', [id]);
  }

  // ── Links ─────────────────────────────────────────────────────────────

  static async addLink(projectId, { label, url }) {
    const [r] = await db.query(
      `INSERT INTO dev_project_links (project_id, label, url) VALUES (?, ?, ?)`,
      [projectId, label, url]
    );
    return r.insertId;
  }

  static async deleteLink(id) {
    await db.query('DELETE FROM dev_project_links WHERE id = ?', [id]);
  }

  // ── Updates (standup) ─────────────────────────────────────────────────

  static async getUpdates(projectId) {
    const [rows] = await db.query(
      `SELECT u.*, usr.name AS author_name
       FROM dev_project_updates u
       JOIN users usr ON usr.id = u.user_id
       WHERE u.project_id = ?
       ORDER BY u.created_at DESC`,
      [projectId]
    );
    return rows;
  }

  static async addUpdate(projectId, userId, body) {
    const [r] = await db.query(
      `INSERT INTO dev_project_updates (project_id, user_id, body) VALUES (?, ?, ?)`,
      [projectId, userId, body]
    );
    return r.insertId;
  }

  // ── Comments ──────────────────────────────────────────────────────────

  static async getComments(projectId) {
    const [rows] = await db.query(
      `SELECT c.*, usr.name AS author_name
       FROM dev_project_comments c
       JOIN users usr ON usr.id = c.user_id
       WHERE c.project_id = ?
       ORDER BY c.created_at ASC`,
      [projectId]
    );
    return rows;
  }

  static async addComment(projectId, userId, body) {
    const [r] = await db.query(
      `INSERT INTO dev_project_comments (project_id, user_id, body) VALUES (?, ?, ?)`,
      [projectId, userId, body]
    );
    return r.insertId;
  }

  static async deleteComment(id) {
    await db.query('DELETE FROM dev_project_comments WHERE id = ?', [id]);
  }

  // ── Releases ──────────────────────────────────────────────────────────

  static async getReleases(projectId) {
    const [rows] = await db.query(
      `SELECT r.*, usr.name AS released_by_name
       FROM dev_releases r
       JOIN users usr ON usr.id = r.released_by
       WHERE r.project_id = ?
       ORDER BY r.released_at DESC`,
      [projectId]
    );
    return rows;
  }

  static async addRelease(projectId, { version, environment, notes, released_by }) {
    const [r] = await db.query(
      `INSERT INTO dev_releases (project_id, version, environment, notes, released_by)
       VALUES (?, ?, ?, ?, ?)`,
      [projectId, version, environment || 'staging', notes || null, released_by]
    );
    return r.insertId;
  }

  static async deleteRelease(id) {
    await db.query('DELETE FROM dev_releases WHERE id = ?', [id]);
  }

  // ── Notes ─────────────────────────────────────────────────────────────

  static async getNotes({ createdBy = null, sharedWith = null } = {}) {
    if (createdBy) {
      const [rows] = await db.query(
        `SELECT n.*, u.name AS author_name,
                COUNT(ns.developer_id) AS share_count
         FROM dev_notes n
         JOIN users u ON u.id = n.created_by
         LEFT JOIN dev_note_shares ns ON ns.note_id = n.id
         WHERE n.created_by = ?
         GROUP BY n.id
         ORDER BY n.updated_at DESC`,
        [createdBy]
      );
      return rows;
    }
    if (sharedWith) {
      const [rows] = await db.query(
        `SELECT n.*, u.name AS author_name, 0 AS share_count
         FROM dev_notes n
         JOIN users u ON u.id = n.created_by
         JOIN dev_note_shares ns ON ns.note_id = n.id AND ns.developer_id = ?
         ORDER BY n.updated_at DESC`,
        [sharedWith]
      );
      return rows;
    }
    return [];
  }

  static async getNoteById(id) {
    const [[note]] = await db.query(
      `SELECT n.*, u.name AS author_name
       FROM dev_notes n JOIN users u ON u.id = n.created_by
       WHERE n.id = ?`,
      [id]
    );
    if (!note) return null;
    const [shares] = await db.query(
      `SELECT ns.developer_id, u.name AS developer_name
       FROM dev_note_shares ns JOIN users u ON u.id = ns.developer_id
       WHERE ns.note_id = ?`,
      [id]
    );
    note.shares = shares;
    return note;
  }

  static async createNote({ title, body, created_by }) {
    const [result] = await db.query(
      `INSERT INTO dev_notes (title, body, created_by) VALUES (?, ?, ?)`,
      [title, body || null, created_by]
    );
    return result.insertId;
  }

  static async updateNote(id, { title, body }) {
    await db.query(
      `UPDATE dev_notes SET title = ?, body = ? WHERE id = ?`,
      [title, body || null, id]
    );
  }

  static async deleteNote(id) {
    await db.query('DELETE FROM dev_notes WHERE id = ?', [id]);
  }

  static async setNoteShares(noteId, developerIds) {
    await db.query('DELETE FROM dev_note_shares WHERE note_id = ?', [noteId]);
    if (developerIds && developerIds.length) {
      const values = developerIds.map(dId => [noteId, dId]);
      await db.query('INSERT INTO dev_note_shares (note_id, developer_id) VALUES ?', [values]);
    }
  }

  // ── Developer list ────────────────────────────────────────────────────

  static async getDevelopers() {
    const [rows] = await db.query(
      `SELECT id, name FROM users WHERE is_developer = 1 AND is_active = 1 ORDER BY name`
    );
    return rows;
  }
}

module.exports = DevProject;
