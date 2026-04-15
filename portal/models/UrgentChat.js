const db = require('../../config/db');

class UrgentChat {

  // Create a new urgent chat
  static async create({ created_by, message }) {
    const [result] = await db.query(
      'INSERT INTO portal_urgent_chats (created_by, message) VALUES (?, ?)',
      [created_by, message]
    );
    return result.insertId;
  }

  // Get active urgent chat (waiting or accepted, not resolved)
  static async getActive() {
    const [rows] = await db.query(
      `SELECT uc.*,
              creator.name as created_by_name, cr.name as created_by_role,
              acceptor.name as accepted_by_name
       FROM portal_urgent_chats uc
       JOIN users creator ON creator.id = uc.created_by
       JOIN roles cr ON creator.role_id = cr.id
       LEFT JOIN users acceptor ON acceptor.id = uc.accepted_by
       WHERE uc.status IN ('waiting', 'accepted')
       ORDER BY uc.created_at DESC
       LIMIT 1`
    );
    return rows[0] || null;
  }

  // Get urgent chat by ID
  static async getById(id) {
    const [rows] = await db.query(
      `SELECT uc.*,
              creator.name as created_by_name, cr.name as created_by_role,
              acceptor.name as accepted_by_name
       FROM portal_urgent_chats uc
       JOIN users creator ON creator.id = uc.created_by
       JOIN roles cr ON creator.role_id = cr.id
       LEFT JOIN users acceptor ON acceptor.id = uc.accepted_by
       WHERE uc.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  // Accept an urgent chat
  static async accept(id, userId) {
    await db.query(
      `UPDATE portal_urgent_chats SET status = 'accepted', accepted_by = ?, accepted_at = NOW()
       WHERE id = ? AND status = 'waiting'`,
      [userId, id]
    );
    return this.getById(id);
  }

  // Resolve an urgent chat
  static async resolve(id, userId) {
    await db.query(
      `UPDATE portal_urgent_chats SET status = 'resolved', resolved_by = ?, resolved_at = NOW()
       WHERE id = ? AND status IN ('waiting', 'accepted')`,
      [userId, id]
    );
    return this.getById(id);
  }

  // Send a message in an urgent chat
  static async sendMessage({ urgent_chat_id, sender_id, content, type }) {
    const [result] = await db.query(
      `INSERT INTO portal_urgent_messages (urgent_chat_id, sender_id, content, type)
       VALUES (?, ?, ?, ?)`,
      [urgent_chat_id, sender_id, content || null, type || 'text']
    );
    // Return the full message
    const [rows] = await db.query(
      `SELECT m.*, u.name as sender_name, r.name as sender_role
       FROM portal_urgent_messages m
       JOIN users u ON u.id = m.sender_id
       JOIN roles r ON u.role_id = r.id
       WHERE m.id = ?`,
      [result.insertId]
    );
    return rows[0];
  }

  // Get messages for an urgent chat
  static async getMessages(urgentChatId) {
    const [rows] = await db.query(
      `SELECT m.*, u.name as sender_name, r.name as sender_role
       FROM portal_urgent_messages m
       JOIN users u ON u.id = m.sender_id
       JOIN roles r ON u.role_id = r.id
       WHERE m.urgent_chat_id = ?
       ORDER BY m.created_at ASC`,
      [urgentChatId]
    );

    // Load attachments
    if (rows.length) {
      const msgIds = rows.map(m => m.id);
      const [attachments] = await db.query(
        'SELECT * FROM portal_urgent_attachments WHERE message_id IN (?)',
        [msgIds]
      );
      const attachMap = {};
      for (const a of attachments) {
        attachMap[a.message_id] = a;
      }
      for (const m of rows) {
        m.attachment = attachMap[m.id] || null;
      }
    }

    return rows;
  }

  // Save attachment for a message
  static async saveAttachment({ message_id, file_name, file_path, file_size, mime_type, uploaded_by }) {
    const [result] = await db.query(
      `INSERT INTO portal_urgent_attachments (message_id, file_name, file_path, file_size, mime_type, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [message_id, file_name, file_path, file_size, mime_type, uploaded_by]
    );
    return result.insertId;
  }

  // Get attachment by message ID
  static async getAttachment(messageId) {
    const [rows] = await db.query(
      'SELECT * FROM portal_urgent_attachments WHERE message_id = ?',
      [messageId]
    );
    return rows[0] || null;
  }

  // Get all chats for history
  static async getHistory(limit = 50) {
    const [rows] = await db.query(
      `SELECT uc.*,
              creator.name as created_by_name,
              acceptor.name as accepted_by_name,
              resolver.name as resolved_by_name,
              (SELECT COUNT(*) FROM portal_urgent_messages WHERE urgent_chat_id = uc.id AND type != 'system') as message_count
       FROM portal_urgent_chats uc
       JOIN users creator ON creator.id = uc.created_by
       LEFT JOIN users acceptor ON acceptor.id = uc.accepted_by
       LEFT JOIN users resolver ON resolver.id = uc.resolved_by
       ORDER BY uc.created_at DESC
       LIMIT ?`,
      [limit]
    );
    return rows;
  }
}

module.exports = UrgentChat;
