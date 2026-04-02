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
  static async getMessages(conversationId, { limit = 50, before_id = null, currentUserId = null } = {}) {
    // Get this user's cleared_before_id so we can hide messages they cleared
    let clearedBeforeId = 0;
    if (currentUserId) {
      const [[cp]] = await db.query(
        'SELECT cleared_before_id FROM chat_participants WHERE conversation_id = ? AND user_id = ?',
        [conversationId, currentUserId]
      );
      clearedBeforeId = (cp && cp.cleared_before_id) ? parseInt(cp.cleared_before_id) : 0;
    }

    let query, params;

    if (before_id) {
      query = `SELECT m.*, u.name AS sender_name, u.avatar AS sender_avatar, r.name AS sender_role, o.org_type AS sender_org_type
               FROM chat_messages m
               JOIN users u ON u.id = m.sender_id
               JOIN roles r ON r.id = u.role_id
               JOIN organizations o ON o.id = u.organization_id
               WHERE m.conversation_id = ? AND m.id < ? AND m.id > ?
               ORDER BY m.id DESC LIMIT ?`;
      params = [conversationId, before_id, clearedBeforeId, parseInt(limit)];
    } else {
      query = `SELECT m.*, u.name AS sender_name, u.avatar AS sender_avatar, r.name AS sender_role, o.org_type AS sender_org_type
               FROM chat_messages m
               JOIN users u ON u.id = m.sender_id
               JOIN roles r ON r.id = u.role_id
               JOIN organizations o ON o.id = u.organization_id
               WHERE m.conversation_id = ? AND m.id > ?
               ORDER BY m.id DESC LIMIT ?`;
      params = [conversationId, clearedBeforeId, parseInt(limit)];
    }

    const [rows] = await db.query(query, params);
    const messages = rows.reverse(); // Return in chronological order

    // Compute per-message read status for sent messages
    if (currentUserId && messages.length > 0) {
      const [participants] = await db.query(
        'SELECT user_id FROM chat_participants WHERE conversation_id = ? AND user_id != ?',
        [conversationId, currentUserId]
      );
      const [readStatus] = await db.query(
        'SELECT user_id, COALESCE(last_read_message_id, 0) AS last_read FROM chat_read_status WHERE conversation_id = ?',
        [conversationId]
      );
      const readMap = {};
      readStatus.forEach(r => { readMap[r.user_id] = parseInt(r.last_read) || 0; });

      messages.forEach(msg => {
        if (msg.sender_id === currentUserId && participants.length > 0) {
          msg.is_read = participants.every(p => (readMap[p.user_id] || 0) >= msg.id);
        } else {
          msg.is_read = false;
        }
      });
    }

    return messages;
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

  // Mark messages as read — returns the last_read_message_id set
  static async markAsRead(conversationId, userId) {
    // Get latest message id in conversation
    const [[latest]] = await db.query(
      'SELECT MAX(id) AS max_id FROM chat_messages WHERE conversation_id = ?',
      [conversationId]
    );

    if (!latest || !latest.max_id) return null;

    await db.query(
      `INSERT INTO chat_read_status (conversation_id, user_id, last_read_message_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE last_read_message_id = VALUES(last_read_message_id), updated_at = NOW()`,
      [conversationId, userId, latest.max_id]
    );

    return latest.max_id;
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

  // Get the system user ID
  static async getSystemUserId() {
    const [[row]] = await db.query("SELECT id FROM users WHERE email = 'system@taskflow.local' LIMIT 1");
    return row ? row.id : null;
  }

  // Find or create a system conversation for a user
  static async getSystemConversation(userId) {
    const systemUserId = await this.getSystemUserId();
    if (!systemUserId) throw new Error('System user not found');

    // Check if system conversation already exists for this user
    const [rows] = await db.query(
      `SELECT c.id FROM chat_conversations c
       JOIN chat_participants p1 ON p1.conversation_id = c.id AND p1.user_id = ?
       JOIN chat_participants p2 ON p2.conversation_id = c.id AND p2.user_id = ?
       WHERE c.type = 'system'
       LIMIT 1`,
      [userId, systemUserId]
    );

    if (rows[0]) return rows[0].id;

    // Create new system conversation
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query(
        "INSERT INTO chat_conversations (type, name, created_by) VALUES ('system', 'System Notifications', ?)",
        [systemUserId]
      );
      const convId = result.insertId;
      await conn.query('INSERT INTO chat_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)',
        [convId, systemUserId, convId, userId]);
      await conn.commit();
      return convId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  // Send a system message to a user
  static async sendSystemMessage(userId, content) {
    const systemUserId = await this.getSystemUserId();
    if (!systemUserId) throw new Error('System user not found');

    const conversationId = await this.getSystemConversation(userId);

    const [result] = await db.query(
      `INSERT INTO chat_messages (conversation_id, sender_id, content) VALUES (?, ?, ?)`,
      [conversationId, systemUserId, content]
    );

    await db.query('UPDATE chat_conversations SET updated_at = NOW() WHERE id = ?', [conversationId]);

    return { conversationId, messageId: result.insertId };
  }

  // Clear chat history for a specific user (hides all current messages for that user only)
  static async clearChatForUser(conversationId, userId) {
    const [[latest]] = await db.query(
      'SELECT MAX(id) AS max_id FROM chat_messages WHERE conversation_id = ?',
      [conversationId]
    );
    const clearUpTo = (latest && latest.max_id) ? latest.max_id : 0;

    await db.query(
      'UPDATE chat_participants SET cleared_before_id = ? WHERE conversation_id = ? AND user_id = ?',
      [clearUpTo, conversationId, userId]
    );
  }
}

module.exports = ChatModel;
