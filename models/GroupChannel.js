const db = require('../config/db');

class GroupChannel {

  static async getMessages(limit = 50, beforeId = null) {
    let query = `
      SELECT m.*, u.name AS sender_name, r.name AS sender_role,
             pm.content AS reply_to_content, pm.type AS reply_to_type, pm.is_deleted AS reply_to_is_deleted,
             pu.name AS reply_to_sender_name
      FROM group_channel_messages m
      JOIN users u ON u.id = m.sender_id
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN group_channel_messages pm ON pm.id = m.reply_to_id
      LEFT JOIN users pu ON pu.id = pm.sender_id
`;
    const params = [];
    if (beforeId) {
      query += ' WHERE m.id < ?';
      params.push(beforeId);
    }
    query += ' ORDER BY m.id DESC LIMIT ?';
    params.push(limit);

    const [messages] = await db.query(query, params);

    // Load attachments for file messages
    const fileMessages = messages.filter(m => m.type === 'file');
    if (fileMessages.length) {
      const [attachments] = await db.query(
        'SELECT * FROM group_channel_attachments WHERE message_id IN (?)',
        [fileMessages.map(m => m.id)]
      );
      const attachMap = {};
      attachments.forEach(a => { attachMap[a.message_id] = a; });
      messages.forEach(m => {
        if (m.type === 'file') m.attachment = attachMap[m.id] || null;
      });
    }

    // Load reactions
    if (messages.length) {
      const [reactions] = await db.query(
        `SELECT r.message_id, r.emoji, r.user_id, u.name
         FROM group_channel_reactions r
         JOIN users u ON u.id = r.user_id
         WHERE r.message_id IN (?)`,
        [messages.map(m => m.id)]
      );
      const byMsg = {};
      reactions.forEach(r => {
        if (!byMsg[r.message_id]) byMsg[r.message_id] = {};
        if (!byMsg[r.message_id][r.emoji]) byMsg[r.message_id][r.emoji] = { emoji: r.emoji, count: 0, users: [] };
        byMsg[r.message_id][r.emoji].count++;
        byMsg[r.message_id][r.emoji].users.push({ id: r.user_id, name: r.name });
      });
      messages.forEach(m => {
        m.reactions = byMsg[m.id] ? Object.values(byMsg[m.id]) : [];
      });
    }

    return messages.reverse();
  }

  static async addReaction(messageId, userId, emoji) {
    await db.query(
      'INSERT IGNORE INTO group_channel_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
      [messageId, userId, emoji]
    );
    return this.getReactionSummary(messageId);
  }

  static async removeReaction(messageId, userId, emoji) {
    await db.query(
      'DELETE FROM group_channel_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
      [messageId, userId, emoji]
    );
    return this.getReactionSummary(messageId);
  }

  static async getReactionSummary(messageId) {
    const [rows] = await db.query(
      `SELECT r.emoji, r.user_id, u.name
       FROM group_channel_reactions r
       JOIN users u ON u.id = r.user_id
       WHERE r.message_id = ?`,
      [messageId]
    );
    const byEmoji = {};
    rows.forEach(r => {
      if (!byEmoji[r.emoji]) byEmoji[r.emoji] = { emoji: r.emoji, count: 0, users: [] };
      byEmoji[r.emoji].count++;
      byEmoji[r.emoji].users.push({ id: r.user_id, name: r.name });
    });
    return Object.values(byEmoji);
  }

  static async sendMessage({ sender_id, content, type = 'text', reply_to_id = null }) {
    const [result] = await db.query(
      'INSERT INTO group_channel_messages (sender_id, content, type, reply_to_id) VALUES (?, ?, ?, ?)',
      [sender_id, content, type, reply_to_id || null]
    );
    const [rows] = await db.query(
      `SELECT m.*, u.name AS sender_name, r.name AS sender_role,
              pm.content AS reply_to_content, pm.type AS reply_to_type, pm.is_deleted AS reply_to_is_deleted,
              pu.name AS reply_to_sender_name
       FROM group_channel_messages m
       JOIN users u ON u.id = m.sender_id
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN group_channel_messages pm ON pm.id = m.reply_to_id
       LEFT JOIN users pu ON pu.id = pm.sender_id
       WHERE m.id = ?`, [result.insertId]
    );
    return rows[0];
  }

  static async saveAttachment({ message_id, drive_file_id, file_name, file_path, file_size, mime_type, uploaded_by }) {
    await db.query(
      'INSERT INTO group_channel_attachments (message_id, drive_file_id, file_name, file_path, file_size, mime_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [message_id, drive_file_id || null, file_name, file_path || null, file_size, mime_type, uploaded_by]
    );
  }

  static async deleteMessage(messageId, senderId) {
    const [rows] = await db.query('SELECT * FROM group_channel_messages WHERE id = ? AND sender_id = ?', [messageId, senderId]);
    if (!rows.length) return null;

    // Remove attached file — Drive first (new), then local disk (legacy)
    if (rows[0].type === 'file') {
      const [atts] = await db.query('SELECT drive_file_id, file_path FROM group_channel_attachments WHERE message_id = ?', [messageId]);
      if (atts.length) {
        const att = atts[0];
        if (att.drive_file_id) {
          try {
            const GoogleDriveService = require('../services/googleDriveService');
            await GoogleDriveService.deleteFile(att.drive_file_id);
          } catch (e) {
            console.error('Failed to trash Drive file:', e.message);
          }
        } else if (att.file_path) {
          const fs = require('fs');
          const path = require('path');
          const filePath = path.join(__dirname, '../uploads', att.file_path);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
      }
    }

    await db.query('UPDATE group_channel_messages SET is_deleted = 1, content = NULL WHERE id = ?', [messageId]);
    return { id: messageId };
  }

  static async getAttachment(messageId) {
    const [rows] = await db.query('SELECT * FROM group_channel_attachments WHERE message_id = ?', [messageId]);
    return rows[0] || null;
  }
}

module.exports = GroupChannel;
