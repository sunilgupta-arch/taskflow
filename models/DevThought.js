const db   = require('../config/db');
const path = require('path');
const fs   = require('fs');

class DevThought {

  static async create({ author_id, title, body }) {
    const [r] = await db.query(
      'INSERT INTO dev_thoughts (author_id, title, body) VALUES (?, ?, ?)',
      [author_id, title, body]
    );
    return r.insertId;
  }

  static async addFile(thought_id, { file_name, file_path, file_mime, file_size, uploaded_by }) {
    await db.query(
      'INSERT INTO dev_thought_files (thought_id, file_name, file_path, file_mime, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
      [thought_id, file_name, file_path, file_mime, file_size, uploaded_by]
    );
  }

  static async list() {
    const [rows] = await db.query(`
      SELECT t.*, u.name AS author_name,
        (SELECT COUNT(*) FROM dev_thought_files    WHERE thought_id = t.id) AS file_count,
        (SELECT COUNT(*) FROM dev_thought_comments WHERE thought_id = t.id) AS comment_count
      FROM dev_thoughts t
      JOIN users u ON u.id = t.author_id
      ORDER BY t.created_at DESC
    `);
    return rows;
  }

  static async getById(id) {
    const [[thought]] = await db.query(`
      SELECT t.*, u.name AS author_name
      FROM dev_thoughts t
      JOIN users u ON u.id = t.author_id
      WHERE t.id = ?
    `, [id]);
    if (!thought) return null;

    const [files] = await db.query(
      'SELECT * FROM dev_thought_files WHERE thought_id = ? ORDER BY created_at ASC',
      [id]
    );
    const [comments] = await db.query(`
      SELECT c.*, u.name AS author_name
      FROM dev_thought_comments c
      JOIN users u ON u.id = c.author_id
      WHERE c.thought_id = ?
      ORDER BY c.created_at ASC
    `, [id]);

    for (const c of comments) {
      const [cf] = await db.query(
        'SELECT * FROM dev_thought_comment_files WHERE comment_id = ? ORDER BY created_at ASC',
        [c.id]
      );
      c.files = cf;
    }

    thought.files    = files;
    thought.comments = comments;
    return thought;
  }

  static async delete(id) {
    const [files]    = await db.query('SELECT file_path FROM dev_thought_files WHERE thought_id = ?', [id]);
    const [comments] = await db.query('SELECT id FROM dev_thought_comments WHERE thought_id = ?', [id]);
    for (const c of comments) {
      const [cf] = await db.query('SELECT file_path FROM dev_thought_comment_files WHERE comment_id = ?', [c.id]);
      cf.forEach(f => DevThought._unlink(f.file_path));
    }
    files.forEach(f => DevThought._unlink(f.file_path));
    await db.query('DELETE FROM dev_thoughts WHERE id = ?', [id]);
  }

  static async addComment({ thought_id, author_id, body }) {
    const [r] = await db.query(
      'INSERT INTO dev_thought_comments (thought_id, author_id, body) VALUES (?, ?, ?)',
      [thought_id, author_id, body]
    );
    return r.insertId;
  }

  static async addCommentFile(comment_id, { file_name, file_path, file_mime, file_size, uploaded_by }) {
    await db.query(
      'INSERT INTO dev_thought_comment_files (comment_id, file_name, file_path, file_mime, file_size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
      [comment_id, file_name, file_path, file_mime, file_size, uploaded_by]
    );
  }

  static async deleteComment(id) {
    const [files] = await db.query('SELECT file_path FROM dev_thought_comment_files WHERE comment_id = ?', [id]);
    files.forEach(f => DevThought._unlink(f.file_path));
    await db.query('DELETE FROM dev_thought_comments WHERE id = ?', [id]);
  }

  static async getFile(id) {
    const [[f]] = await db.query('SELECT * FROM dev_thought_files WHERE id = ?', [id]);
    return f || null;
  }

  static async getCommentFile(id) {
    const [[f]] = await db.query('SELECT * FROM dev_thought_comment_files WHERE id = ?', [id]);
    return f || null;
  }

  static async getCommentById(id) {
    const [[c]] = await db.query('SELECT * FROM dev_thought_comments WHERE id = ?', [id]);
    return c || null;
  }

  static _unlink(relPath) {
    if (!relPath) return;
    try {
      const abs = path.join(__dirname, '..', 'uploads', relPath);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    } catch (_) {}
  }
}

module.exports = DevThought;
