const GroupChannel = require('../models/GroupChannel');
const { ApiResponse } = require('../utils/response');
const path = require('path');
const fs = require('fs');

class GroupChannelController {

  static async getMessages(req, res) {
    try {
      const beforeId = req.query.before ? parseInt(req.query.before) : null;
      const messages = await GroupChannel.getMessages(50, beforeId);
      return ApiResponse.success(res, { messages });
    } catch (err) {
      console.error('GroupChannel getMessages error:', err);
      return ApiResponse.error(res, 'Failed to load messages');
    }
  }

  static async sendMessage(req, res) {
    try {
      const { content, reply_to_id } = req.body;
      if (!content || !content.trim()) return ApiResponse.error(res, 'Message cannot be empty', 400);

      const message = await GroupChannel.sendMessage({
        sender_id: req.user.id,
        content: content.trim(),
        reply_to_id: reply_to_id ? parseInt(reply_to_id) : null
      });

      // Broadcast to everyone via main namespace
      const { getIO } = require('../config/socket');
      try {
        const io = getIO();
        io.emit('channel:message', message);
      } catch (_) {}

      return ApiResponse.success(res, { message }, 'Message sent');
    } catch (err) {
      console.error('GroupChannel send error:', err);
      return ApiResponse.error(res, 'Failed to send message');
    }
  }

  static async sendFile(req, res) {
    try {
      if (!req.file) return ApiResponse.error(res, 'No file uploaded', 400);

      // Upload to Google Drive
      const GoogleDriveService = require('../services/googleDriveService');
      const driveFile = await GoogleDriveService.uploadGroupChannelAttachment(req.file);

      const message = await GroupChannel.sendMessage({
        sender_id: req.user.id,
        content: req.file.originalname,
        type: 'file',
        reply_to_id: req.body.reply_to_id ? parseInt(req.body.reply_to_id) : null
      });

      await GroupChannel.saveAttachment({
        message_id: message.id,
        drive_file_id: driveFile.id,
        drive_view_link: driveFile.webViewLink || null,
        file_name: req.file.originalname,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        uploaded_by: req.user.id
      });

      // Re-fetch with attachment
      const messages = await GroupChannel.getMessages(1);
      const fullMessage = messages[messages.length - 1];

      const { getIO } = require('../config/socket');
      try {
        const io = getIO();
        io.emit('channel:message', fullMessage);
      } catch (_) {}

      return ApiResponse.success(res, { message: fullMessage }, 'File sent');
    } catch (err) {
      console.error('GroupChannel send file error:', err);
      return ApiResponse.error(res, 'Failed to send file');
    }
  }

  static async editMessage(req, res) {
    try {
      const messageId = parseInt(req.params.messageId);
      const { content } = req.body;
      if (!content || !content.trim()) return ApiResponse.error(res, 'Message cannot be empty', 400);
      const result = await GroupChannel.editMessage(messageId, req.user.id, content.trim());
      if (result.error) return ApiResponse.error(res, result.error, 403);
      const { getIO } = require('../config/socket');
      try { getIO().emit('channel:message:edit', result.message); } catch (_) {}
      return ApiResponse.success(res, { message: result.message }, 'Message updated');
    } catch (err) {
      console.error('GroupChannel editMessage error:', err);
      return ApiResponse.error(res, 'Failed to update message');
    }
  }

  static async deleteMessage(req, res) {
    try {
      const messageId = parseInt(req.params.messageId);
      const isAdmin = ['LOCAL_ADMIN', 'CLIENT_ADMIN'].includes(req.user.role_name || '');
      const result = await GroupChannel.deleteMessage(messageId, req.user.id, isAdmin);
      if (!result) return ApiResponse.error(res, 'Cannot delete this message', 403);

      const { getIO } = require('../config/socket');
      try {
        const io = getIO();
        io.emit('channel:message:delete', { id: result.id });
      } catch (_) {}

      return ApiResponse.success(res, {}, 'Message deleted');
    } catch (err) {
      return ApiResponse.error(res, 'Failed to delete message');
    }
  }

  static async serveAttachment(req, res) {
    try {
      const messageId = parseInt(req.params.messageId);
      const attachment = await GroupChannel.getAttachment(messageId);

      if (attachment) {
        res.setHeader('Content-Disposition', `inline; filename="${attachment.file_name}"`);
        res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');

        if (attachment.drive_file_id) {
          const GoogleDriveService = require('../services/googleDriveService');
          try {
            const { stream } = await GoogleDriveService.downloadFile(attachment.drive_file_id);
            stream.on('error', (e) => { console.error('GC attachment stream error:', e.message); if (!res.headersSent) res.status(500).end(); });
            return stream.pipe(res);
          } catch (e) {
            console.error('GC attachment Drive download failed:', attachment.drive_file_id, e.message);
            return res.status(502).json({ success: false, message: 'File unavailable' });
          }
        }

        if (attachment.file_path) {
          const filePath = path.join(__dirname, '../uploads', attachment.file_path);
          if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found' });
          return res.sendFile(filePath);
        }
      }

      // No attachment record — check if message content contains a Drive file ID (legacy uploads)
      const db = require('../config/db');
      const [msgs] = await db.query('SELECT content, type FROM group_channel_messages WHERE id = ? AND type = ?', [messageId, 'file']);
      if (msgs.length && msgs[0].content) {
        const m = msgs[0].content.match(/\/d\/([a-zA-Z0-9_-]{20,})|id=([a-zA-Z0-9_-]{20,})/);
        const driveId = m ? (m[1] || m[2]) : null;
        if (driveId) {
          try {
            const GoogleDriveService = require('../services/googleDriveService');
            const { stream } = await GoogleDriveService.downloadFile(driveId);
            return stream.pipe(res);
          } catch (_) {}
        }
      }

      return res.status(404).json({ success: false, message: 'Not found' });
    } catch (err) {
      console.error('GroupChannel serveAttachment error:', err);
      return res.status(500).json({ success: false, message: 'Failed to serve file' });
    }
  }

  static async togglePin(req, res) {
    try {
      const role = req.user.role_name || '';
      if (role !== 'LOCAL_ADMIN' && role !== 'CLIENT_ADMIN') {
        return ApiResponse.error(res, 'Only admins can pin messages', 403);
      }
      const messageId = parseInt(req.params.messageId);
      const result = await GroupChannel.togglePin(messageId, req.user.id);
      if (result.error) return ApiResponse.error(res, result.error, 400);
      const { getIO } = require('../config/socket');
      try { getIO().emit('channel:message:pin', { message: result.message, pinned: result.pinned }); } catch (_) {}
      return ApiResponse.success(res, { message: result.message, pinned: result.pinned });
    } catch (err) {
      console.error('GroupChannel togglePin error:', err);
      return ApiResponse.error(res, 'Failed to update pin');
    }
  }

  static async unfurl(req, res) {
    try {
      const url = (req.query.url || '').trim();
      if (!url) return ApiResponse.error(res, 'url required', 400);
      const { unfurl } = require('../services/linkUnfurl');
      const preview = await unfurl(url);
      return ApiResponse.success(res, { preview });
    } catch (err) {
      console.error('GroupChannel unfurl error:', err);
      return ApiResponse.error(res, 'Unfurl failed');
    }
  }

  static async search(req, res) {
    try {
      const q = (req.query.q || '').trim();
      if (!q || q.length < 2) return ApiResponse.success(res, { messages: [] });
      const messages = await GroupChannel.searchMessages(q, 30);
      return ApiResponse.success(res, { messages });
    } catch (err) {
      console.error('GroupChannel search error:', err);
      return ApiResponse.error(res, 'Search failed');
    }
  }

  static async getPinned(req, res) {
    try {
      const messages = await GroupChannel.getPinnedMessages();
      return ApiResponse.success(res, { messages });
    } catch (err) {
      console.error('GroupChannel getPinned error:', err);
      return ApiResponse.error(res, 'Failed to load pinned messages');
    }
  }

  static async toggleReaction(req, res) {
    try {
      const messageId = parseInt(req.params.messageId);
      const { emoji, action } = req.body; // action: 'add' | 'remove'
      if (!emoji || !/^[\p{Emoji}\p{Emoji_Component}]{1,8}$/u.test(emoji)) {
        return ApiResponse.error(res, 'Invalid emoji', 400);
      }
      let reactions;
      if (action === 'remove') {
        reactions = await GroupChannel.removeReaction(messageId, req.user.id, emoji);
      } else {
        reactions = await GroupChannel.addReaction(messageId, req.user.id, emoji);
      }
      const { getIO } = require('../config/socket');
      try { getIO().emit('channel:reaction', { message_id: messageId, reactions }); } catch (_) {}
      return ApiResponse.success(res, { reactions });
    } catch (err) {
      console.error('GroupChannel toggleReaction error:', err);
      return ApiResponse.error(res, 'Failed to update reaction');
    }
  }

  // Get all users who can access the channel, with online status
  static async getUsers(req, res) {
    try {
      const db = require('../config/db');
      // All active users except CLIENT_SALES
      const [users] = await db.query(
        `SELECT u.id, u.name, r.name AS role_name
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.is_active = 1 AND r.name != 'CLIENT_SALES'
         ORDER BY u.name`
      );
      const onlineUsers = req.app.get('onlineUsers') || new Map();
      const result = users.map(u => ({
        id: u.id,
        name: u.name,
        role_name: u.role_name,
        online: onlineUsers.has(u.id)
      }));
      // Sort: online first, then alphabetical
      result.sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return ApiResponse.success(res, { users: result });
    } catch (err) {
      console.error('GroupChannel getUsers error:', err);
      return ApiResponse.error(res, 'Failed to load users');
    }
  }
}

module.exports = GroupChannelController;
