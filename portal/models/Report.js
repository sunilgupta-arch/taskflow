const db = require('../../config/db');
const { getDefaultLinksForRole } = require('../../config/portalDefaultLinks');

class PortalReport {

  /**
   * Hand this user any developer-managed default links for their role that they
   * have not been given before, and return how many were added.
   *
   * The seed row is claimed first with INSERT IGNORE: if it does not insert,
   * this user already received that link at some point — whether they still
   * have it, renamed it, or deleted it — so it is left alone. That also makes
   * the whole thing safe against two concurrent requests seeding at once.
   */
  static async seedDefaultsForUser(userId, roleName) {
    const defaults = getDefaultLinksForRole(roleName);
    if (!defaults.length) return 0;

    let added = 0;
    for (const link of defaults) {
      const [claim] = await db.query(
        'INSERT IGNORE INTO portal_report_seeds (user_id, source_key) VALUES (?, ?)',
        [userId, link.key]
      );
      if (!claim.affectedRows) continue;
      await PortalReport.create({
        user_id: userId, name: link.name, url: link.url, color: link.color
      });
      added++;
    }
    return added;
  }

  static async create({ user_id, name, url, color }) {
    const [[{ maxOrder }]] = await db.query(
      'SELECT COALESCE(MAX(sort_order), 0) as maxOrder FROM portal_reports WHERE user_id = ?', [user_id]
    );
    const [result] = await db.query(
      'INSERT INTO portal_reports (user_id, name, url, color, sort_order) VALUES (?, ?, ?, ?, ?)',
      [user_id, name, url, color || 'blue', maxOrder + 1]
    );
    return result.insertId;
  }

  static async findById(id) {
    const [rows] = await db.query('SELECT * FROM portal_reports WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async getForUser(userId) {
    const [rows] = await db.query(
      'SELECT * FROM portal_reports WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC',
      [userId]
    );
    return rows;
  }

  static async update(id, fields) {
    const allowed = ['name', 'url', 'color', 'sort_order'];
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
    await db.query(`UPDATE portal_reports SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  static async delete(id) {
    await db.query('DELETE FROM portal_reports WHERE id = ?', [id]);
  }
}

module.exports = PortalReport;
