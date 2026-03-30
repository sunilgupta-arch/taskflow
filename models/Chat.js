const db = require('../config/db');

class ChatModel {

  // Find existing direct conversation between two users
  static async findDirectConversation(userId1, userId2) {
    const [rows] = await db.query(
      `SELECT c.id FROM chat_conversations c
       JOIN chat_participants p1 ON p1.conversation_id = c.id AND p1.user_id = ?
       JOIN chat_participants p2 ON p2.conversation_id = c.id AND p2.user_id = ?
       WHERE c.type = 'direct'
       LIMIT 1`,
      [userId1, userId2]
    );
    return rows[0] || null;
  }

  // Create a new conversation (direct or group)
  static async createConversation({ type, name, created_by, participant_ids }) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        'INSERT INTO chat_conversations (type, name, created_by) VALUES (?, ?, ?)',
        [type, name || null, created_by]
      );
      const conversationId = result.insertId;

      // Add all participants (including creator)
      const allParticipants = [...new Set([created_by, ...participant_ids])];
      for (const uid of allParticipants) {
        await conn.query(
          'INSERT INTO chat_participants (conversation_id, user_id) VALUES (?, ?)',
          [conversationId, uid]
        );
      }

      await conn.commit();
      return conversationId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // Get all conversations for a user with last message and unread count
  static async getConversationsForUser(userId) {
    const [rows] = await db.query(
      `SELECT
        c.id,
        c.type,
        c.name AS group_name,
        c.created_by,
        c.updated_at,
        lm.content AS last_message,
        lm.created_at AS last_message_at,
        lm_sender.name AS last_message_sender,
        (
          SELECT COUNT(*) FROM chat_messages cm
          WHERE cm.conversation_id = c.id
            AND cm.id > COALESCE(
              (SELECT last_read_message_id FROM chat_read_status
               WHERE conversation_id = c.id AND user_id = ?), 0
            )
            AND cm.sender_id != ?
        ) AS unread_count
      FROM chat_conversations c
      JOIN chat_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
      LEFT JOIN chat_messages lm ON lm.id = (
        SELECT MAX(id) FROM chat_messages WHERE conversation_id = c.id
      )
      LEFT JOIN users lm_sender ON lm_sender.id = lm.sender_id
      ORDER BY COALESCE(lm.created_at, c.created_at) DESC`,
      [userId, userId, userId]
    );

    // For each conversation, get participant details
    for (const conv of rows) {
      const [participants] = await db.query(
        `SELECT u.id, u.name, u.avatar, r.name AS role_name, o.org_type
         FROM chat_participants cp
         JOIN users u ON u.id = cp.user_id
         JOIN roles r ON r.id = u.role_id
         JOIN organizations o ON o.id = u.organization_id
         WHERE cp.conversation_id = ?`,
        [conv.id]
      );
      conv.participants = participants;

      // For direct chats, set the "other" user info
      if (conv.type === 'direct') {
        conv.other_user = participants.find(p => p.id !== userId) || participants[0];
      }
    }

    return rows;
  }

  // Get conversation by ID with participants
  static async getConversationById(conversationId) {
    const [rows] = await db.query(
      'SELECT * FROM chat_conversations WHERE id = ?',
      [conversationId]
    );
    if (!rows[0]) return null;

    const conv = rows[0];
    const [participants] = await db.query(
      `SELECT u.id, u.name, u.avatar, r.name AS role_name, o.org_type
       FROM chat_participants cp
       JOIN users u ON u.id = cp.user_id
       JOIN roles r ON r.id = u.role_id
       JOIN organizations o ON o.id = u.organization_id
       WHERE cp.conversation_id = ?`,
      [conversationId]
    );
    conv.participants = participants;
    return conv;
  }

  // Check if user is participant
  static async isParticipant(conversationId, userId) {
    const [rows] = await db.query(
      'SELECT 1 FROM chat_participants WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );
    return rows.length > 0;
  }

  // Get messages for a conversation (paginated, newest last)
  static async getMessages(conversationId, { limit = 50, before_id = null } = {}) {
    let query, params;

    if (before_id) {
      query = `SELECT m.*, u.name AS sender_name, u.avatar AS sender_avatar, r.name AS sender_role, o.org_type AS sender_org_type
               FROM chat_messages m
               JOIN users u ON u.id = m.sender_id
               JOIN roles r ON r.id = u.role_id
               JOIN organizations o ON o.id = u.organization_id
               WHERE m.conversation_id = ? AND m.id < ?
               ORDER BY m.id DESC LIMIT ?`;
      params = [conversationId, before_id, parseInt(limit)];
    } else {
      query = `SELECT m.*, u.name AS sender_name, u.avatar AS sender_avatar, r.name AS sender_role, o.org_type AS sender_org_type
               FROM chat_messages m
               JOIN users u ON u.id = m.sender_id
               JOIN roles r ON r.id = u.role_id
               JOIN organizations o ON o.id = u.organization_id
               WHERE m.conversation_id = ?
               ORDER BY m.id DESC LIMIT ?`;
      params = [conversationId, parseInt(limit)];
    }

    const [rows] = await db.query(query, params);
    return rows.reverse(); // Return in chronological order
  }

  // Send a message (with optional attachment)
  static async sendMessage({ conversation_id, sender_id, content, attachment }) {
    const [result] = await db.query(
      `INSERT INTO chat_messages (conversation_id, sender_id, content, attachment_drive_id, attachment_name, attachment_mime, attachment_size, attachment_link)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conversation_id, sender_id, content || null,
        attachment ? attachment.drive_id : null,
        attachment ? attachment.name : null,
        attachment ? attachment.mime : null,
        attachment ? attachment.size : null,
        attachment ? attachment.link : null
      ]
    );

    // Update conversation timestamp
    await db.query(
      'UPDATE chat_conversations SET updated_at = NOW() WHERE id = ?',
      [conversation_id]
    );

    // Get the full message with sender info
    const [rows] = await db.query(
      `SELECT m.*, u.name AS sender_name, u.avatar AS sender_avatar, r.name AS sender_role, o.org_type AS sender_org_type
       FROM chat_messages m
       JOIN users u ON u.id = m.sender_id
       JOIN roles r ON r.id = u.role_id
       JOIN organizations o ON o.id = u.organization_id
       WHERE m.id = ?`,
      [result.insertId]
    );

    return rows[0];
  }

  // Mark messages as read
  static async markAsRead(conversationId, userId) {
    // Get latest message id in conversation
    const [[latest]] = await db.query(
      'SELECT MAX(id) AS max_id FROM chat_messages WHERE conversation_id = ?',
      [conversationId]
    );

    if (!latest || !latest.max_id) return;

    await db.query(
      `INSERT INTO chat_read_status (conversation_id, user_id, last_read_message_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE last_read_message_id = VALUES(last_read_message_id), updated_at = NOW()`,
      [conversationId, userId, latest.max_id]
    );
  }

  // Get all users available for chat (for the "new chat" user picker)
  static async getChatableUsers(currentUserId) {
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.avatar, r.name AS role_name, o.org_type, o.name AS org_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       JOIN organizations o ON o.id = u.organization_id
       WHERE u.id != ? AND u.is_active = 1
       ORDER BY o.org_type, u.name`,
      [currentUserId]
    );
    return rows;
  }

  // Get total unread count for a user across all conversations
  static async getTotalUnreadCount(userId) {
    const [[result]] = await db.query(
      `SELECT COALESCE(SUM(unread), 0) AS total_unread FROM (
        SELECT
          (SELECT COUNT(*) FROM chat_messages cm
           WHERE cm.conversation_id = c.id
             AND cm.id > COALESCE(
               (SELECT last_read_message_id FROM chat_read_status
                WHERE conversation_id = c.id AND user_id = ?), 0
             )
             AND cm.sender_id != ?
          ) AS unread
        FROM chat_conversations c
        JOIN chat_participants cp ON cp.conversation_id = c.id AND cp.user_id = ?
      ) counts`,
      [userId, userId, userId]
    );
    return result.total_unread;
  }

  // Get participant user IDs for a conversation
  static async getParticipantIds(conversationId) {
    const [rows] = await db.query(
      'SELECT user_id FROM chat_participants WHERE conversation_id = ?',
      [conversationId]
    );
    return rows.map(r => r.user_id);
  }
}

module.exports = ChatModel;
