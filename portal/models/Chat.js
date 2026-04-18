const db = require('../../config/db');

class PortalChat {

  // Get all client-side users (for contact list)
  static async getClientUsers(excludeUserId) {
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email, r.name as role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE r.name IN ('CLIENT_ADMIN', 'CLIENT_TOP_MGMT', 'CLIENT_MGMT', 'CLIENT_MANAGER', 'CLIENT_USER', 'CLIENT_SALES')
         AND u.is_active = 1 AND u.id != ? AND u.email != 'system@taskflow.local'
       ORDER BY u.name`,
      [excludeUserId]
    );
    return rows;
  }

  // Find existing direct conversation between two users
  static async findDirectConversation(userId1, userId2) {
    const [rows] = await db.query(
      `SELECT c.id FROM portal_conversations c
       JOIN portal_participants p1 ON p1.conversation_id = c.id AND p1.user_id = ?
       JOIN portal_participants p2 ON p2.conversation_id = c.id AND p2.user_id = ?
       WHERE c.type = 'direct'
       LIMIT 1`,
      [userId1, userId2]
    );
    return rows[0] || null;
  }

  // Create a new conversation
  static async createConversation({ type, name, created_by, participant_ids }) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        'INSERT INTO portal_conversations (type, name, created_by) VALUES (?, ?, ?)',
        [type, name || null, created_by]
      );
      const conversationId = result.insertId;

      const allParticipants = [...new Set([created_by, ...participant_ids])];
      for (const uid of allParticipants) {
        await conn.query(
          'INSERT INTO portal_participants (conversation_id, user_id) VALUES (?, ?)',
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
      `SELECT c.id, c.type, c.name, c.created_by, c.updated_at,
        (SELECT pm.content FROM portal_messages pm WHERE pm.conversation_id = c.id ORDER BY pm.created_at DESC LIMIT 1) as last_message,
        (SELECT pm.created_at FROM portal_messages pm WHERE pm.conversation_id = c.id ORDER BY pm.created_at DESC LIMIT 1) as last_message_at,
        (SELECT pm.sender_id FROM portal_messages pm WHERE pm.conversation_id = c.id ORDER BY pm.created_at DESC LIMIT 1) as last_message_sender_id,
        (SELECT COUNT(*) FROM portal_messages pm
         WHERE pm.conversation_id = c.id
           AND pm.id > COALESCE(pp.last_read_message_id, 0)
           AND pm.sender_id != ?) as unread_count
       FROM portal_conversations c
       JOIN portal_participants pp ON pp.conversation_id = c.id AND pp.user_id = ?
       ORDER BY last_message_at DESC, c.updated_at DESC`,
      [userId, userId]
    );

    // For direct chats, fetch the other participant's info
    for (const conv of rows) {
      if (conv.type === 'direct') {
        const [participants] = await db.query(
          `SELECT u.id, u.name, u.email, r.name as role_name
           FROM portal_participants p
           JOIN users u ON u.id = p.user_id
           JOIN roles r ON u.role_id = r.id
           WHERE p.conversation_id = ? AND p.user_id != ?`,
          [conv.id, userId]
        );
        conv.other_user = participants[0] || null;
      } else {
        const [participants] = await db.query(
          `SELECT u.id, u.name, r.name as role_name
           FROM portal_participants p
           JOIN users u ON u.id = p.user_id
           JOIN roles r ON u.role_id = r.id
           WHERE p.conversation_id = ?`,
          [conv.id]
        );
        conv.participants = participants;
      }
    }

    return rows;
  }

  // Check if user is participant in a conversation
  static async isParticipant(conversationId, userId) {
    const [rows] = await db.query(
      'SELECT id FROM portal_participants WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );
    return rows.length > 0;
  }

  // Get messages for a conversation (with read status)
  static async getMessages(conversationId, limit = 50, beforeId = null, currentUserId = null) {
    let query = `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.type, m.is_deleted, m.is_edited, m.created_at,
                   u.name as sender_name, r.name as sender_role
                 FROM portal_messages m
                 JOIN users u ON u.id = m.sender_id
                 JOIN roles r ON u.role_id = r.id
                 WHERE m.conversation_id = ?`;
    const params = [conversationId];

    if (beforeId) {
      query += ' AND m.id < ?';
      params.push(beforeId);
    }

    query += ' ORDER BY m.created_at DESC LIMIT ?';
    params.push(limit);

    const [rows] = await db.query(query, params);

    // Load attachments for file messages
    const fileMessages = rows.filter(m => m.type === 'file' && !m.is_deleted);
    if (fileMessages.length) {
      const msgIds = fileMessages.map(m => m.id);
      const [attachments] = await db.query(
        `SELECT * FROM portal_attachments WHERE message_id IN (?)`,
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

    // Get read status: min last_read_message_id of OTHER participants
    if (currentUserId) {
      const [readers] = await db.query(
        `SELECT user_id, COALESCE(last_read_message_id, 0) as last_read
         FROM portal_participants
         WHERE conversation_id = ? AND user_id != ?`,
        [conversationId, currentUserId]
      );

      // For each sent message: check if ALL others have read it
      const minRead = readers.length ? Math.min(...readers.map(r => r.last_read)) : 0;
      const anyRead = readers.length ? Math.max(...readers.map(r => r.last_read)) : 0;

      for (const m of rows) {
        if (m.sender_id === currentUserId) {
          if (m.id <= minRead) {
            m.read_status = 'read';       // all participants read
          } else if (m.id <= anyRead) {
            m.read_status = 'read';       // at least one read (for groups)
          } else {
            m.read_status = 'sent';       // sent but not read
          }
        }
      }
    }

    return rows.reverse();
  }

  // Send a message
  static async sendMessage({ conversation_id, sender_id, content, type = 'text' }) {
    const [result] = await db.query(
      'INSERT INTO portal_messages (conversation_id, sender_id, content, type) VALUES (?, ?, ?, ?)',
      [conversation_id, sender_id, content, type]
    );

    // Update conversation timestamp
    await db.query('UPDATE portal_conversations SET updated_at = NOW() WHERE id = ?', [conversation_id]);

    const [rows] = await db.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.type, m.created_at,
              u.name as sender_name, r.name as sender_role
       FROM portal_messages m
       JOIN users u ON u.id = m.sender_id
       JOIN roles r ON u.role_id = r.id
       WHERE m.id = ?`,
      [result.insertId]
    );
    return rows[0];
  }

  // Save attachment
  static async saveAttachment({ message_id, drive_file_id, file_name, file_path, file_size, mime_type, uploaded_by }) {
    const [result] = await db.query(
      `INSERT INTO portal_attachments (message_id, drive_file_id, file_name, file_path, file_size, mime_type, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [message_id, drive_file_id || null, file_name, file_path || null, file_size, mime_type, uploaded_by]
    );
    return result.insertId;
  }

  // Mark messages as read — returns the last read message ID
  static async markAsRead(conversationId, userId) {
    const [latestMsg] = await db.query(
      'SELECT id FROM portal_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1',
      [conversationId]
    );
    if (latestMsg.length) {
      await db.query(
        'UPDATE portal_participants SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?',
        [latestMsg[0].id, conversationId, userId]
      );
      return latestMsg[0].id;
    }
    return 0;
  }

  // Get unread count across all conversations
  static async getTotalUnreadCount(userId) {
    const [rows] = await db.query(
      `SELECT COALESCE(SUM(unread), 0) as total FROM (
         SELECT COUNT(*) as unread
         FROM portal_messages m
         JOIN portal_participants p ON p.conversation_id = m.conversation_id AND p.user_id = ?
         WHERE m.id > COALESCE(p.last_read_message_id, 0)
           AND m.sender_id != ?
       ) sub`,
      [userId, userId]
    );
    return rows[0].total;
  }

  // Get participants of a conversation
  static async getParticipants(conversationId) {
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.email, r.name as role_name
       FROM portal_participants p
       JOIN users u ON u.id = p.user_id
       JOIN roles r ON u.role_id = r.id
       WHERE p.conversation_id = ?`,
      [conversationId]
    );
    return rows;
  }

  // Get attachment by message ID
  static async getAttachment(messageId) {
    const [rows] = await db.query(
      'SELECT * FROM portal_attachments WHERE message_id = ?',
      [messageId]
    );
    return rows[0] || null;
  }

  // Search messages in a conversation
  static async searchMessages(conversationId, query, limit = 30) {
    const [rows] = await db.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.content, m.type, m.created_at,
              u.name as sender_name, r.name as sender_role
       FROM portal_messages m
       JOIN users u ON u.id = m.sender_id
       JOIN roles r ON u.role_id = r.id
       WHERE m.conversation_id = ? AND m.is_deleted = 0
         AND m.content LIKE ?
       ORDER BY m.created_at DESC LIMIT ?`,
      [conversationId, `%${query}%`, limit]
    );
    return rows.reverse();
  }

  // Edit a message (only sender, within 15 minutes)
  static async editMessage(messageId, senderId, newContent) {
    const [rows] = await db.query(
      'SELECT * FROM portal_messages WHERE id = ? AND sender_id = ? AND is_deleted = 0',
      [messageId, senderId]
    );
    if (!rows.length) return null;

    await db.query(
      'UPDATE portal_messages SET content = ?, is_edited = 1, edited_at = NOW() WHERE id = ?',
      [newContent, messageId]
    );
    return { id: messageId, content: newContent, conversation_id: rows[0].conversation_id };
  }

  // Delete a message (soft delete, only sender) + remove file from disk
  static async deleteMessage(messageId, senderId) {
    const [rows] = await db.query(
      'SELECT * FROM portal_messages WHERE id = ? AND sender_id = ? AND is_deleted = 0',
      [messageId, senderId]
    );
    if (!rows.length) return null;

    // If file message, remove file — Drive first (new), local disk fallback (legacy)
    if (rows[0].type === 'file') {
      const [attachments] = await db.query(
        'SELECT drive_file_id, file_path FROM portal_attachments WHERE message_id = ?', [messageId]
      );
      for (const a of attachments) {
        if (a.drive_file_id) {
          try {
            const GoogleDriveService = require('../../services/googleDriveService');
            await GoogleDriveService.deleteFile(a.drive_file_id);
          } catch (e) {
            console.error('Failed to trash Drive file:', e.message);
          }
        } else if (a.file_path) {
          const path = require('path');
          const fs = require('fs');
          const filePath = path.join(__dirname, '../../uploads', a.file_path);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
      }
      await db.query('DELETE FROM portal_attachments WHERE message_id = ?', [messageId]);
    }

    await db.query(
      'UPDATE portal_messages SET is_deleted = 1, content = NULL WHERE id = ?',
      [messageId]
    );
    return { id: messageId, conversation_id: rows[0].conversation_id };
  }

  // Add members to a group conversation
  static async addMembers(conversationId, userIds) {
    for (const uid of userIds) {
      await db.query(
        'INSERT IGNORE INTO portal_participants (conversation_id, user_id) VALUES (?, ?)',
        [conversationId, uid]
      );
    }
  }

  // Remove a member from a group conversation
  static async removeMember(conversationId, userId) {
    await db.query(
      'DELETE FROM portal_participants WHERE conversation_id = ? AND user_id = ?',
      [conversationId, userId]
    );
  }

  // Get conversation by ID
  static async getConversation(conversationId) {
    const [rows] = await db.query(
      'SELECT * FROM portal_conversations WHERE id = ?',
      [conversationId]
    );
    return rows[0] || null;
  }
}

module.exports = PortalChat;
