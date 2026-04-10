const db = require('../config/db');

class BridgeChat {

  // Find or create a conversation between a client user and a local user
  static async findOrCreateConversation(clientUserId, localUserId) {
    const [existing] = await db.query(
      'SELECT id FROM bridge_conversations WHERE client_user_id = ? AND local_user_id = ?',
      [clientUserId, localUserId]
    );
    if (existing.length) return existing[0].id;

    const [result] = await db.query(
      'INSERT INTO bridge_conversations (client_user_id, local_user_id) VALUES (?, ?)',
      [clientUserId, localUserId]
    );
    return result.insertId;
  }

  // Get conversation by ID
  static async getConversation(convId) {
    const [rows] = await db.query(
      `SELECT bc.*,
              cu.name as client_user_name, cr.name as client_role,
              lu.name as local_user_name, lr.name as local_role
       FROM bridge_conversations bc
       JOIN users cu ON cu.id = bc.client_user_id
       JOIN roles cr ON cu.role_id = cr.id
       JOIN users lu ON lu.id = bc.local_user_id
       JOIN roles lr ON lu.role_id = lr.id
       WHERE bc.id = ?`,
      [convId]
    );
    return rows[0] || null;
  }

  // Check if user is part of conversation
  static async isParticipant(convId, userId) {
    const [rows] = await db.query(
      'SELECT id FROM bridge_conversations WHERE id = ? AND (client_user_id = ? OR local_user_id = ?)',
      [convId, userId, userId]
    );
    return rows.length > 0;
  }

  // Get messages
  static async getMessages(convId, limit = 50, beforeId = null) {
    let query = `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.type, m.is_read, m.is_deleted, m.created_at,
                   u.name as sender_name, r.name as sender_role
                 FROM bridge_messages m
                 JOIN users u ON u.id = m.sender_id
                 JOIN roles r ON u.role_id = r.id
                 WHERE m.conversation_id = ?`;
    const params = [convId];

    if (beforeId) {
      query += ' AND m.id < ?';
      params.push(beforeId);
    }

    query += ' ORDER BY m.created_at DESC LIMIT ?';
    params.push(limit);

    const [rows] = await db.query(query, params);

    // Load attachments for non-deleted file messages
    const fileMessages = rows.filter(m => m.type === 'file' && !m.is_deleted);
    if (fileMessages.length) {
      const msgIds = fileMessages.map(m => m.id);
      const [attachments] = await db.query(
        'SELECT * FROM bridge_attachments WHERE message_id IN (?)',
        [msgIds]
      );
      const attachMap = {};
      for (const a of attachments) {
        attachMap[a.message_id] = a;
      }
      for (const m of rows) {
        if (m.type === 'file') m.attachment = attachMap[m.id] || null;
      }
    }

    return rows.reverse();
  }

  // Send a message
  static async sendMessage({ conversation_id, sender_id, content, type = 'text' }) {
    const [result] = await db.query(
      'INSERT INTO bridge_messages (conversation_id, sender_id, content, type) VALUES (?, ?, ?, ?)',
      [conversation_id, sender_id, content, type]
    );

    await db.query('UPDATE bridge_conversations SET updated_at = NOW() WHERE id = ?', [conversation_id]);

    const [rows] = await db.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.type, m.is_read, m.created_at,
              u.name as sender_name, r.name as sender_role
       FROM bridge_messages m
       JOIN users u ON u.id = m.sender_id
       JOIN roles r ON u.role_id = r.id
       WHERE m.id = ?`,
      [result.insertId]
    );
    return rows[0];
  }

  // Save attachment
  static async saveAttachment({ message_id, file_name, file_path, file_size, mime_type, uploaded_by }) {
    const [result] = await db.query(
      `INSERT INTO bridge_attachments (message_id, file_name, file_path, file_size, mime_type, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [message_id, file_name, file_path, file_size, mime_type, uploaded_by]
    );
    return result.insertId;
  }

  // Mark messages as read (all messages from the other user)
  static async markAsRead(convId, readByUserId) {
    await db.query(
      'UPDATE bridge_messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0',
      [convId, readByUserId]
    );
  }

  // Get unread count for a user (across all their bridge conversations)
  static async getUnreadCount(userId) {
    const [rows] = await db.query(
      `SELECT COUNT(*) as total
       FROM bridge_messages m
       JOIN bridge_conversations bc ON bc.id = m.conversation_id
       WHERE m.is_read = 0 AND m.sender_id != ?
         AND (bc.client_user_id = ? OR bc.local_user_id = ?)`,
      [userId, userId, userId]
    );
    return rows[0].total;
  }

  // Get all bridge conversations for a local user (for floating widget)
  static async getConversationsForLocalUser(userId) {
    const [rows] = await db.query(
      `SELECT bc.id, bc.client_user_id, bc.local_user_id, bc.updated_at,
              cu.name as client_user_name,
              (SELECT content FROM bridge_messages WHERE conversation_id = bc.id ORDER BY created_at DESC LIMIT 1) as last_message,
              (SELECT created_at FROM bridge_messages WHERE conversation_id = bc.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
              (SELECT COUNT(*) FROM bridge_messages WHERE conversation_id = bc.id AND is_read = 0 AND sender_id != ?) as unread_count
       FROM bridge_conversations bc
       JOIN users cu ON cu.id = bc.client_user_id
       WHERE bc.local_user_id = ?
       HAVING last_message IS NOT NULL
       ORDER BY last_message_at DESC`,
      [userId, userId]
    );
    return rows;
  }

  // Delete a message (soft delete, sender only) + remove file from disk
  static async deleteMessage(messageId, senderId) {
    const [rows] = await db.query(
      'SELECT * FROM bridge_messages WHERE id = ? AND sender_id = ? AND is_deleted = 0',
      [messageId, senderId]
    );
    if (!rows.length) return null;

    // If file message, delete file from disk and remove attachment record
    if (rows[0].type === 'file') {
      const [attachments] = await db.query(
        'SELECT file_path FROM bridge_attachments WHERE message_id = ?', [messageId]
      );
      const path = require('path');
      const fs = require('fs');
      for (const a of attachments) {
        const filePath = path.join(__dirname, '../uploads', a.file_path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
      await db.query('DELETE FROM bridge_attachments WHERE message_id = ?', [messageId]);
    }

    await db.query(
      'UPDATE bridge_messages SET is_deleted = 1, content = NULL WHERE id = ?',
      [messageId]
    );
    return { id: messageId, conversation_id: rows[0].conversation_id };
  }

  // Get attachment
  static async getAttachment(messageId) {
    const [rows] = await db.query(
      'SELECT * FROM bridge_attachments WHERE message_id = ?',
      [messageId]
    );
    return rows[0] || null;
  }
}

module.exports = BridgeChat;
