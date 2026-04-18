const UrgentChat = require('../models/UrgentChat');
const { ApiResponse } = require('../../utils/response');
const path = require('path');
const fs = require('fs');

class UrgentController {

  // ── Portal Side (Client creates urgent) ───────────────────

  // Create an urgent chat
  static async create(req, res) {
    try {
      const { message } = req.body;
      if (!message || !message.trim()) {
        return ApiResponse.error(res, 'Message is required', 400);
      }

      // Check if there's already an active urgent chat
      const existing = await UrgentChat.getActive();
      if (existing) {
        return ApiResponse.error(res, 'An urgent chat is already active', 400);
      }

      const chatId = await UrgentChat.create({
        created_by: req.user.id,
        message: message.trim()
      });

      // Add the initial message as a text message
      await UrgentChat.sendMessage({
        urgent_chat_id: chatId,
        sender_id: req.user.id,
        content: message.trim(),
        type: 'text'
      });

      const chat = await UrgentChat.getById(chatId);

      // Emit to all local users via main socket namespace
      const { getIO } = require('../../config/socket');
      try {
        const io = getIO();
        io.emit('urgent:new', {
          id: chat.id,
          created_by: chat.created_by,
          created_by_name: chat.created_by_name,
          created_by_role: chat.created_by_role,
          message: chat.message,
          status: chat.status,
          created_at: chat.created_at
        });
      } catch (_) {}

      return ApiResponse.success(res, { chat }, 'Urgent chat created');
    } catch (err) {
      console.error('Urgent create error:', err);
      return ApiResponse.error(res, 'Failed to create urgent chat');
    }
  }

  // Get active urgent chat (both sides use this)
  static async getActive(req, res) {
    try {
      const chat = await UrgentChat.getActive();
      return ApiResponse.success(res, { chat });
    } catch (err) {
      console.error('Urgent getActive error:', err);
      return ApiResponse.error(res, 'Failed to get active urgent chat');
    }
  }

  // Get messages for an urgent chat
  static async getMessages(req, res) {
    try {
      const chatId = parseInt(req.params.id);
      const messages = await UrgentChat.getMessages(chatId);
      return ApiResponse.success(res, { messages });
    } catch (err) {
      console.error('Urgent getMessages error:', err);
      return ApiResponse.error(res, 'Failed to load messages');
    }
  }

  // Send a message in an urgent chat
  static async sendMessage(req, res) {
    try {
      const chatId = parseInt(req.params.id);
      const { content } = req.body;

      if (!content || !content.trim()) {
        return ApiResponse.error(res, 'Message cannot be empty', 400);
      }

      const chat = await UrgentChat.getById(chatId);
      if (!chat || chat.status === 'resolved') {
        return ApiResponse.error(res, 'Urgent chat not found or already resolved', 400);
      }

      const message = await UrgentChat.sendMessage({
        urgent_chat_id: chatId,
        sender_id: req.user.id,
        content: content.trim(),
        type: 'text'
      });

      // Emit to everyone
      const { getIO } = require('../../config/socket');
      try {
        const io = getIO();
        io.emit('urgent:message', { ...message, urgent_chat_id: chatId });
        io.of('/portal').emit('urgent:message', { ...message, urgent_chat_id: chatId });
      } catch (_) {}

      return ApiResponse.success(res, { message }, 'Message sent');
    } catch (err) {
      console.error('Urgent sendMessage error:', err);
      return ApiResponse.error(res, 'Failed to send message');
    }
  }

  // Send a file in an urgent chat
  static async sendFile(req, res) {
    try {
      const chatId = parseInt(req.params.id);

      if (!req.file) {
        return ApiResponse.error(res, 'No file uploaded', 400);
      }

      const chat = await UrgentChat.getById(chatId);
      if (!chat || chat.status === 'resolved') {
        return ApiResponse.error(res, 'Urgent chat not found or already resolved', 400);
      }

      // Upload to Google Drive
      const GoogleDriveService = require('../../services/googleDriveService');
      const driveFile = await GoogleDriveService.uploadToFolder(process.env.URGENT_DRIVE_FOLDER_ID, req.file);

      // Create file message
      const message = await UrgentChat.sendMessage({
        urgent_chat_id: chatId,
        sender_id: req.user.id,
        content: req.file.originalname,
        type: 'file'
      });

      // Save attachment
      await UrgentChat.saveAttachment({
        message_id: message.id,
        drive_file_id: driveFile.id,
        file_name: req.file.originalname,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        uploaded_by: req.user.id
      });

      // Re-fetch with attachment
      const messages = await UrgentChat.getMessages(chatId);
      const fullMessage = messages.find(m => m.id === message.id);

      // Emit to everyone
      const { getIO } = require('../../config/socket');
      try {
        const io = getIO();
        io.emit('urgent:message', { ...fullMessage, urgent_chat_id: chatId });
        io.of('/portal').emit('urgent:message', { ...fullMessage, urgent_chat_id: chatId });
      } catch (_) {}

      return ApiResponse.success(res, { message: fullMessage }, 'File sent');
    } catch (err) {
      console.error('Urgent sendFile error:', err);
      return ApiResponse.error(res, 'Failed to send file');
    }
  }

  // Serve an urgent file attachment
  static async serveAttachment(req, res) {
    try {
      const messageId = parseInt(req.params.messageId);
      const attachment = await UrgentChat.getAttachment(messageId);

      if (!attachment) {
        return res.status(404).json({ success: false, message: 'Attachment not found' });
      }

      res.setHeader('Content-Disposition', `inline; filename="${attachment.file_name}"`);
      res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');

      if (attachment.drive_file_id) {
        const GoogleDriveService = require('../../services/googleDriveService');
        const { stream } = await GoogleDriveService.downloadFile(attachment.drive_file_id);
        return stream.pipe(res);
      }

      if (attachment.file_path) {
        const filePath = path.join(__dirname, '../../uploads', attachment.file_path);
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ success: false, message: 'File not found on disk' });
        }
        return res.sendFile(filePath);
      }

      return res.status(404).json({ success: false, message: 'File not found' });
    } catch (err) {
      console.error('Urgent serveAttachment error:', err);
      return res.status(500).json({ success: false, message: 'Failed to serve file' });
    }
  }

  // ── Local Side (Accept) ───────────────────────────────────

  // Accept an urgent chat
  static async accept(req, res) {
    try {
      const chatId = parseInt(req.params.id);

      const chat = await UrgentChat.getById(chatId);
      if (!chat) {
        return ApiResponse.error(res, 'Urgent chat not found', 404);
      }
      if (chat.status !== 'waiting') {
        return ApiResponse.error(res, 'Already accepted', 400);
      }

      const updated = await UrgentChat.accept(chatId, req.user.id);

      // System message
      await UrgentChat.sendMessage({
        urgent_chat_id: chatId,
        sender_id: req.user.id,
        content: `${req.user.name} accepted this urgent request`,
        type: 'system'
      });

      // Emit to everyone
      const { getIO } = require('../../config/socket');
      try {
        const io = getIO();
        io.emit('urgent:accepted', {
          id: chatId,
          accepted_by: req.user.id,
          accepted_by_name: req.user.name,
          accepted_at: updated.accepted_at
        });
        io.of('/portal').emit('urgent:accepted', {
          id: chatId,
          accepted_by: req.user.id,
          accepted_by_name: req.user.name,
          accepted_at: updated.accepted_at
        });
      } catch (_) {}

      return ApiResponse.success(res, { chat: updated }, 'Urgent chat accepted');
    } catch (err) {
      console.error('Urgent accept error:', err);
      return ApiResponse.error(res, 'Failed to accept urgent chat');
    }
  }

  // Resolve an urgent chat
  static async resolve(req, res) {
    try {
      const chatId = parseInt(req.params.id);

      const chat = await UrgentChat.getById(chatId);
      if (!chat || chat.status === 'resolved') {
        return ApiResponse.error(res, 'Urgent chat not found or already resolved', 400);
      }

      // System message
      await UrgentChat.sendMessage({
        urgent_chat_id: chatId,
        sender_id: req.user.id,
        content: `${req.user.name} resolved this urgent request`,
        type: 'system'
      });

      const updated = await UrgentChat.resolve(chatId, req.user.id);

      // Emit to everyone
      const { getIO } = require('../../config/socket');
      try {
        const io = getIO();
        io.emit('urgent:resolved', { id: chatId, resolved_by: req.user.id, resolved_by_name: req.user.name });
        io.of('/portal').emit('urgent:resolved', { id: chatId, resolved_by: req.user.id, resolved_by_name: req.user.name });
      } catch (_) {}

      return ApiResponse.success(res, { chat: updated }, 'Urgent chat resolved');
    } catch (err) {
      console.error('Urgent resolve error:', err);
      return ApiResponse.error(res, 'Failed to resolve urgent chat');
    }
  }

  // Get urgent chat history
  static async getHistory(req, res) {
    try {
      const chats = await UrgentChat.getHistory();
      return ApiResponse.success(res, { chats });
    } catch (err) {
      console.error('Urgent getHistory error:', err);
      return ApiResponse.error(res, 'Failed to load history');
    }
  }

  // Buzz — client presses buzzer to get attention
  static async buzz(req, res) {
    try {
      const chatId = parseInt(req.params.id);
      const chat = await UrgentChat.getById(chatId);
      if (!chat || chat.status === 'resolved') {
        return ApiResponse.error(res, 'No active urgent chat', 400);
      }

      // Emit buzz to all local users via main namespace
      const { getIO } = require('../../config/socket');
      try {
        const io = getIO();
        io.emit('urgent:buzz', { id: chatId, from: req.user.name });
      } catch (_) {}

      return ApiResponse.success(res, {}, 'Buzz sent');
    } catch (err) {
      console.error('Urgent buzz error:', err);
      return ApiResponse.error(res, 'Failed to send buzz');
    }
  }

  // Typing indicator
  static async typing(req, res) {
    try {
      const chatId = parseInt(req.params.id);
      const { getIO } = require('../../config/socket');
      const io = getIO();
      // Emit to both namespaces so both sides see it
      io.emit('urgent:typing', { id: chatId, user_id: req.user.id, user_name: req.user.name });
      io.of('/portal').emit('urgent:typing', { id: chatId, user_id: req.user.id, user_name: req.user.name });
      return res.json({ success: true });
    } catch (_) {
      return res.json({ success: true });
    }
  }

  // Stop typing indicator
  static async stopTyping(req, res) {
    try {
      const chatId = parseInt(req.params.id);
      const { getIO } = require('../../config/socket');
      const io = getIO();
      io.emit('urgent:stop-typing', { id: chatId, user_id: req.user.id });
      io.of('/portal').emit('urgent:stop-typing', { id: chatId, user_id: req.user.id });
      return res.json({ success: true });
    } catch (_) {
      return res.json({ success: true });
    }
  }
}

module.exports = UrgentController;
