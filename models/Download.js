const db = require('../config/db');

class Download {
  static async getAll(search = '') {
    let sql = `
      SELECT id, name, description, version, original_name, stored_name, drive_file_id,
             file_size, mime_type, uploaded_by, uploader_name, uploader_side,
             download_count, is_disabled, is_public, created_at
      FROM downloads`;
    const params = [];
    if (search) {
      sql += ` WHERE name LIKE ? OR description LIKE ? OR uploader_name LIKE ?`;
      const term = `%${search}%`;
      params.push(term, term, term);
    }
    sql += ` ORDER BY name ASC, created_at DESC`;
    const [rows] = await db.query(sql, params);
    return rows;
  }

  static async getPublicFiles() {
    const [rows] = await db.query(`
      SELECT id, name, description, version, original_name, stored_name, drive_file_id,
             file_size, mime_type, uploader_name, download_count, created_at
      FROM downloads
      WHERE is_public = 1 AND is_disabled = 0
      ORDER BY name ASC, created_at DESC
    `);
    return rows;
  }

  static async getPublicById(id) {
    const [rows] = await db.query(
      `SELECT * FROM downloads WHERE id = ? AND is_public = 1 AND is_disabled = 0`,
      [id]
    );
    return rows[0] || null;
  }

  static async getById(id) {
    const [rows] = await db.query(`SELECT * FROM downloads WHERE id = ?`, [id]);
    return rows[0] || null;
  }

  static async create(data) {
    const { name, description, version, original_name, stored_name,
            file_size, mime_type, uploaded_by, uploader_name, uploader_side, is_public } = data;
    const [result] = await db.query(
      `INSERT INTO downloads
         (name, description, version, original_name, stored_name, drive_file_id, file_size,
          mime_type, uploaded_by, uploader_name, uploader_side, is_public)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      [name, description || null, version || null, original_name, stored_name,
       file_size, mime_type, uploaded_by, uploader_name, uploader_side, is_public ? 1 : 0]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const { name, description, version } = data;
    await db.query(
      `UPDATE downloads SET name = ?, description = ?, version = ? WHERE id = ?`,
      [name, description || null, version || null, id]
    );
  }

  static async updateDriveId(id, driveFileId) {
    await db.query(`UPDATE downloads SET drive_file_id = ? WHERE id = ?`, [driveFileId, id]);
  }

  // Null out stored_name once local file is deleted by cron
  static async clearLocalFile(id) {
    await db.query(`UPDATE downloads SET stored_name = NULL WHERE id = ?`, [id]);
  }

  static async delete(id) {
    const [rows] = await db.query(
      `SELECT stored_name, drive_file_id FROM downloads WHERE id = ?`, [id]
    );
    if (!rows[0]) return null;
    await db.query(`DELETE FROM downloads WHERE id = ?`, [id]);
    return rows[0]; // { stored_name, drive_file_id }
  }

  static async toggleDisabled(id) {
    await db.query(`UPDATE downloads SET is_disabled = NOT is_disabled WHERE id = ?`, [id]);
    const [rows] = await db.query(`SELECT is_disabled FROM downloads WHERE id = ?`, [id]);
    return rows[0]?.is_disabled;
  }

  static async togglePublic(id) {
    await db.query(`UPDATE downloads SET is_public = NOT is_public WHERE id = ?`, [id]);
    const [rows] = await db.query(`SELECT is_public FROM downloads WHERE id = ?`, [id]);
    return rows[0]?.is_public;
  }

  static async incrementDownload(id) {
    await db.query(`UPDATE downloads SET download_count = download_count + 1 WHERE id = ?`, [id]);
  }

  // Files on Drive but still on disk, older than 1 day — ready to have local copy removed
  static async getPendingLocalCleanup() {
    const [rows] = await db.query(`
      SELECT id, stored_name
      FROM downloads
      WHERE drive_file_id IS NOT NULL
        AND stored_name IS NOT NULL
        AND created_at <= NOW() - INTERVAL 1 DAY
    `);
    return rows;
  }

  // Files where Drive upload hasn't completed yet — retry candidates
  static async getPendingDriveUpload() {
    const [rows] = await db.query(`
      SELECT id, stored_name, original_name, mime_type
      FROM downloads
      WHERE drive_file_id IS NULL
        AND stored_name IS NOT NULL
    `);
    return rows;
  }
}

module.exports = Download;
