const db = require('../config/db');

class NoteModel {
  static async findById(id) {
    const [rows] = await db.query('SELECT * FROM notes WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async create(data) {
    const [result] = await db.query(
      'INSERT INTO notes (user_id, title, content) VALUES (?, ?, ?)',
      [data.user_id, data.title, data.content || null]
    );
    return result.insertId;
  }

  static async update(id, data) {
    const fields = [];
    const values = [];

    const allowed = ['title', 'content'];
    allowed.forEach(f => {
      if (data[f] !== undefined) {
        fields.push(`${f} = ?`);
        values.push(data[f]);
      }
    });

    if (!fields.length) return false;
    values.push(id);

    const [result] = await db.query(
      `UPDATE notes SET ${fields.join(', ')} WHERE id = ?`, values
    );
    return result.affectedRows > 0;
  }

  static async delete(id) {
    const [result] = await db.query('DELETE FROM notes WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  static async getAll({ user_id, search, page = 1, limit = 20 } = {}) {
    let where = [];
    let params = [];

    if (user_id) { where.push('user_id = ?'); params.push(user_id); }
    if (search) { where.push('(title LIKE ? OR content LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [rows] = await db.query(
      `SELECT * FROM notes ${whereClause} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM notes ${whereClause}`, params
    );

    return { rows, total };
  }
}

module.exports = NoteModel;
