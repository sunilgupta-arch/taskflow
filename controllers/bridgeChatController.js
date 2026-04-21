const BridgeChat = require('../models/BridgeChat');
const { ApiResponse } = require('../utils/response');
const path = require('path');
const fs = require('fs');

class BridgeChatController {

  // Start or get conversation (portal side initiates with local user)
  static async getOrCreateConversation(req, res) {
    try {
      const { local_user_id } = req.body;
      if (!local_user_id) return ApiResponse.error(res, 'Local user ID required', 400);

      const clientUserId = req.user.id;
      const convId = await BridgeChat.findOrCreateConversation(clientUserId, parseInt(local_user_id));
      const conv = await BridgeChat.getConversation(convId);

      return ApiResponse.success(res, { conversation: conv });
    } catch (err) {
      console.error('Bridge getOrCreate error:', err);
      return ApiResponse.error(res, 'Failed to create conversation');
    }
  }

  // Get messages
  static async getMessages(req, res) {
    try {
      const convId = parseInt(req.params.id);
      const beforeId = req.query.before ? parseInt(req.query.before) : null;

      const isParticipant = await BridgeChat.isParticipant(convId, req.user.id);
      if (!isParticipant) return ApiResponse.error(res, 'Access denied', 403);

      const messages = await BridgeChat.getMessages(convId, 50, beforeId);
      return ApiResponse.success(res, { messages });
    } catch (err) {
      return ApiResponse.error(res, 'Failed to load messages');
    }
  }

  // Send message
  static async sendMessage(req, res) {
    try {
      const convId = parseInt(req.params.id);
      const { content } = req.body;

      if (!content || !content.trim()) return ApiResponse.error(res, 'Message cannot be empty', 400);

      const isParticipant = await BridgeChat.isParticipant(convId, req.user.id);
      if (!isParticipant) return ApiResponse.error(res, 'Access denied', 403);

      const message = await BridgeChat.sendMessage({
        conversation_id: convId,
        sender_id: req.user.id,
        content: content.trim()
      });

      // Get conversation to find the other user
      const conv = await BridgeChat.getConversation(convId);
      const otherUserId = conv.client_user_id === req.user.id ? conv.local_user_id : conv.client_user_id;

      // Emit via Socket.IO (main namespace — both sides use it)
      const { getIO } = require('../config/socket');
      try {
        const io = getIO();
        // Emit to both users
        io.to(`user:${otherUserId}`).emit('bridge:message', {
          ...message,
          conversation: conv
        });
        io.to(`user:${req.user.id}`).emit('bridge:message', {
          ...message,
          conversation: conv
        });
      } catch (_) {}

      return ApiResponse.success(res, { message }, 'Message sent');
    } catch (err) {
      console.error('Bridge send error:', err);
      return ApiResponse.error(res, 'Failed to send message');
    }
  }

  // Send file
  static async sendFile(req, res) {
    try {
      const convId = parseInt(req.params.id);
      if (!req.file) return ApiResponse.error(res, 'No file uploaded', 400);

      const isParticipant = await BridgeChat.isParticipant(convId, req.user.id);
      if (!isParticipant) return ApiResponse.error(res, 'Access denied', 403);

      // Upload to Google Drive
      const GoogleDriveService = require('../services/googleDriveService');
      const driveFile = await GoogleDriveService.uploadToFolder(process.env.BRIDGE_CHAT_DRIVE_FOLDER_ID, req.file);

      const message = await BridgeChat.sendMessage({
        conversation_id: convId,
        sender_id: req.user.id,
        content: req.file.originalname,
        type: 'file'
      });

      await BridgeChat.saveAttachment({
        message_id: message.id,
        drive_file_id: driveFile.id,
        file_name: req.file.originalname,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        uploaded_by: req.user.id
      });

      // Re-fetch with attachment
      const messages = await BridgeChat.getMessages(convId, 1);
      const fullMessage = messages[messages.length - 1];

      const conv = await BridgeChat.getConversation(convId);
      const otherUserId = conv.client_user_id === req.user.id ? conv.local_user_id : conv.client_user_id;

      const { getIO } = require('../config/socket');
      try {
        const io = getIO();
        io.to(`user:${otherUserId}`).emit('bridge:message', { ...fullMessage, conversation: conv });
        io.to(`user:${req.user.id}`).emit('bridge:message', { ...fullMessage, conversation: conv });
      } catch (_) {}

      return ApiResponse.success(res, { message: fullMessage }, 'File sent');
    } catch (err) {
      console.error('Bridge send file error:', err);
      return ApiResponse.error(res, 'Failed to send file');
    }
  }

  // Mark as read
  static async markAsRead(req, res) {
    try {
      const convId = parseInt(req.params.id);
      await BridgeChat.markAsRead(convId, req.user.id);

      // Notify the other side
      const conv = await BridgeChat.getConversation(convId);
      const otherUserId = conv.client_user_id === req.user.id ? conv.local_user_id : conv.client_user_id;

      const { getIO } = require('../config/socket');
      try {
        const io = getIO();
        io.to(`user:${otherUserId}`).emit('bridge:read', { conversation_id: convId, read_by: req.user.id });
      } catch (_) {}

      return ApiResponse.success(res, {}, 'Marked as read');
    } catch (err) {
      return ApiResponse.error(res, 'Failed to mark as read');
    }
  }

  // Delete message
  static async deleteMessage(req, res) {
    try {
      const messageId = parseInt(req.params.messageId);
      const result = await BridgeChat.deleteMessage(messageId, req.user.id);
      if (!result) return ApiResponse.error(res, 'Cannot delete this message', 403);

      // Notify the other side
      const conv = await BridgeChat.getConversation(result.conversation_id);
      const otherUserId = conv.client_user_id === req.user.id ? conv.local_user_id : conv.client_user_id;

      const { getIO } = require('../config/socket');
      try {
        const io = getIO();
        io.to(`user:${otherUserId}`).emit('bridge:message:delete', {
          id: result.id,
          conversation_id: result.conversation_id
        });
        io.to(`user:${req.user.id}`).emit('bridge:message:delete', {
          id: result.id,
          conversation_id: result.conversation_id
        });
      } catch (_) {}

      return ApiResponse.success(res, {}, 'Message deleted');
    } catch (err) {
      return ApiResponse.error(res, 'Failed to delete message');
    }
  }

  // Serve attachment
  static async serveAttachment(req, res) {
    try {
      const messageId = parseInt(req.params.messageId);
      const attachment = await BridgeChat.getAttachment(messageId);
      if (!attachment) return res.status(404).json({ success: false, message: 'Not found' });

      // Check participant
      const [msgRows] = await require('../config/db').query(
        'SELECT conversation_id FROM bridge_messages WHERE id = ?', [messageId]
      );
      if (!msgRows.length) return res.status(404).json({ success: false, message: 'Not found' });

      const isParticipant = await BridgeChat.isParticipant(msgRows[0].conversation_id, req.user.id);
      if (!isParticipant) return res.status(403).json({ success: false, message: 'Access denied' });

      res.setHeader('Content-Disposition', `inline; filename="${attachment.file_name}"`);
      res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');

      if (attachment.drive_file_id) {
        const GoogleDriveService = require('../services/googleDriveService');
        const { stream } = await GoogleDriveService.downloadFile(attachment.drive_file_id);
        return stream.pipe(res);
      }

      if (attachment.file_path) {
        const filePath = path.join(__dirname, '../uploads', attachment.file_path);
        if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found' });
        return res.sendFile(filePath);
      }

      return res.status(404).json({ success: false, message: 'File not found' });
    } catch (err) {
      console.error('Bridge serveAttachment error:', err);
      return res.status(500).json({ success: false, message: 'Failed to serve file' });
    }
  }

  // Get unread count (total + per-user breakdown)
  static async unreadCount(req, res) {
    try {
      const total = await BridgeChat.getUnreadCount(req.user.id);
      const by_user = await BridgeChat.getUnreadCountByUser(req.user.id);
      return ApiResponse.success(res, { total, by_user });
    } catch (err) {
      return ApiResponse.error(res, 'Failed to get count');
    }
  }

  // Get conversations for local user (floating widget)
  static async getMyConversations(req, res) {
    try {
      const convs = await BridgeChat.getConversationsForLocalUser(req.user.id);
      return ApiResponse.success(res, { conversations: convs });
    } catch (err) {
      return ApiResponse.error(res, 'Failed to load conversations');
    }
  }

  // List bridge conversations for a portal (client) user — inline chat
  static async getMyConversationsForPortal(req, res) {
    try {
      const convs = await BridgeChat.getConversationsForClientUser(req.user.id);
      return ApiResponse.success(res, { conversations: convs });
    } catch (err) {
      return ApiResponse.error(res, 'Failed to load conversations');
    }
  }
}

module.exports = BridgeChatController;
