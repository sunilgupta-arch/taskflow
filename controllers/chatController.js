const ChatModel = require('../models/Chat');
const GoogleDriveService = require('../services/googleDriveService');
const db = require('../config/db');
const { ApiResponse } = require('../utils/response');
const { getIO } = require('../config/socket');


// Max attachment size by role
const MAX_ATTACH_SIZE = {
  LOCAL_USER: 10 * 1024 * 1024,
  LOCAL_MANAGER: 100 * 1024 * 1024,
  LOCAL_ADMIN: 100 * 1024 * 1024,
  CLIENT_MANAGER: 100 * 1024 * 1024,
  CLIENT_ADMIN: 100 * 1024 * 1024
};

// Helper: emit message to conversation participants
function emitToParticipants(io, participantIds, senderId, conversationId, message) {
  participantIds.forEach(uid => {
    if (uid !== senderId) {
      io.to(`user:${uid}`).emit('chat:message', { conversation_id: conversationId, message });
    }
  });
}

class ChatController {

  // GET /chat — render chat page
  static async index(req, res) {
    try {
      const conversations = await ChatModel.getConversationsForUser(req.user.id);
      const users = await ChatModel.getChatableUsers(req.user.id);

      // Get user's drive files for the "pick from drive" modal
      let driveFiles = [];
      try {
        const folderId = await GoogleDriveService.getUserFolder(req.user);
        driveFiles = await GoogleDriveService.listFiles(folderId);
      } catch (e) {
        // Drive not set up yet — that's fine
      }

      res.render('chat/index', {
        title: 'Chat',
        conversations,
        users,
        driveFiles,
        canInitiate: true,
        activeConversationId: req.query.c ? parseInt(req.query.c) : null,
        maxAttachMB: Math.round((MAX_ATTACH_SIZE[req.user.role_name] || 10 * 1024 * 1024) / (1024 * 1024))
      });
    } catch (err) {
      console.error('Chat index error:', err);
      res.status(500).render('error', { title: 'Error', message: 'Failed to load chat', code: 500, layout: false });
    }
  }

  // GET /chat/conversations — API: list conversations
  static async listConversations(req, res) {
    try {
      const conversations = await ChatModel.getConversationsForUser(req.user.id);
      return ApiResponse.success(res, { conversations });
    } catch (err) {
      console.error('List conversations error:', err);
      return ApiResponse.error(res, 'Failed to load conversations');
    }
  }

  // POST /chat/conversations — API: create conversation
  static async createConversation(req, res) {
    try {
      const { type, name, participant_ids } = req.body;

      if (!participant_ids || !participant_ids.length) {
        return ApiResponse.error(res, 'Please select at least one user', 400);
      }

      const ids = participant_ids.map(id => parseInt(id));

      // For direct chat, check if one already exists
      if (type === 'direct' || ids.length === 1) {
        const existing = await ChatModel.findDirectConversation(req.user.id, ids[0]);
        if (existing) {
          return ApiResponse.success(res, { conversation_id: existing.id, existing: true }, 'Conversation exists');
        }

        const conversationId = await ChatModel.createConversation({
          type: 'direct',
          name: null,
          created_by: req.user.id,
          participant_ids: ids
        });
        return ApiResponse.success(res, { conversation_id: conversationId }, 'Conversation created', 201);
      }

      // Group chat
      if (!name || !name.trim()) {
        return ApiResponse.error(res, 'Group name is required', 400);
      }

      const conversationId = await ChatModel.createConversation({
        type: 'group',
        name: name.trim(),
        created_by: req.user.id,
        participant_ids: ids
      });

      return ApiResponse.success(res, { conversation_id: conversationId }, 'Group created', 201);
    } catch (err) {
      console.error('Create conversation error:', err);
      return ApiResponse.error(res, 'Failed to create conversation');
    }
  }

  // GET /chat/conversations/:id/messages — API: get messages
  static async getMessages(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const isParticipant = await ChatModel.isParticipant(conversationId, req.user.id);

      if (!isParticipant) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      const before_id = req.query.before ? parseInt(req.query.before) : null;
      const messages = await ChatModel.getMessages(conversationId, { limit: 50, before_id, currentUserId: req.user.id });
      const conversation = await ChatModel.getConversationById(conversationId);

      // Get which attachments this user has already saved
      const msgIds = messages.filter(m => m.attachment_drive_id).map(m => m.id);
      let savedSet = new Set();
      if (msgIds.length > 0) {
        const [saved] = await db.query(
          `SELECT message_id FROM chat_saved_attachments WHERE user_id = ? AND message_id IN (${msgIds.map(() => '?').join(',')})`,
          [req.user.id, ...msgIds]
        );
        savedSet = new Set(saved.map(r => r.message_id));
      }

      // Tag each message with saved status
      messages.forEach(m => {
        m.saved_to_drive = savedSet.has(m.id);
      });

      // Mark as read
      await ChatModel.markAsRead(conversationId, req.user.id);

      return ApiResponse.success(res, { messages, conversation });
    } catch (err) {
      console.error('Get messages error:', err);
      return ApiResponse.error(res, 'Failed to load messages');
    }
  }

  // POST /chat/conversations/:id/messages — API: send text message
  static async sendMessage(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;

      if (!content || !content.trim()) {
        return ApiResponse.error(res, 'Message cannot be empty', 400);
      }

      const isParticipant = await ChatModel.isParticipant(conversationId, req.user.id);
      if (!isParticipant) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      // Block replies on system conversations
      const conversation = await ChatModel.getConversationById(conversationId);
      if (conversation && conversation.type === 'system') {
        return ApiResponse.error(res, 'Cannot reply to system notifications', 403);
      }

      const message = await ChatModel.sendMessage({
        conversation_id: conversationId,
        sender_id: req.user.id,
        content: content.trim()
      });

      await ChatModel.markAsRead(conversationId, req.user.id);

      const participantIds = await ChatModel.getParticipantIds(conversationId);
      emitToParticipants(getIO(), participantIds, req.user.id, conversationId, message);

      return ApiResponse.success(res, { message }, 'Message sent', 201);
    } catch (err) {
      console.error('Send message error:', err);
      return ApiResponse.error(res, 'Failed to send message');
    }
  }

  // POST /chat/conversations/:id/attach-local — upload local file as attachment
  static async attachLocal(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const maxSize = MAX_ATTACH_SIZE[req.user.role_name] || 10 * 1024 * 1024;

      const isParticipant = await ChatModel.isParticipant(conversationId, req.user.id);
      if (!isParticipant) return ApiResponse.error(res, 'Access denied', 403);

      if (!req.file) return ApiResponse.error(res, 'No file provided', 400);

      if (req.file.size > maxSize) {
        return ApiResponse.error(res, `File exceeds ${Math.round(maxSize / (1024 * 1024))}MB limit`, 400);
      }

      // Upload to user's chat_attachments folder in Drive
      const userFolderId = await GoogleDriveService.getUserFolder(req.user);
      const driveFile = await GoogleDriveService.uploadChatAttachment(userFolderId, req.file);

      const message = await ChatModel.sendMessage({
        conversation_id: conversationId,
        sender_id: req.user.id,
        content: req.body.content || null,
        attachment: {
          drive_id: driveFile.id,
          name: driveFile.name,
          mime: driveFile.mimeType,
          size: driveFile.size ? parseInt(driveFile.size) : req.file.size,
          link: driveFile.webViewLink || driveFile.webContentLink || null
        }
      });

      await ChatModel.markAsRead(conversationId, req.user.id);

      const participantIds = await ChatModel.getParticipantIds(conversationId);
      emitToParticipants(getIO(), participantIds, req.user.id, conversationId, message);

      return ApiResponse.success(res, { message }, 'Attachment sent', 201);
    } catch (err) {
      console.error('Attach local error:', err);
      return ApiResponse.error(res, 'Failed to send attachment');
    }
  }

  // POST /chat/conversations/:id/attach-drive — pick file from user's drive
  static async attachDrive(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const { drive_file_id, content } = req.body;

      if (!drive_file_id) return ApiResponse.error(res, 'No file selected', 400);

      const isParticipant = await ChatModel.isParticipant(conversationId, req.user.id);
      if (!isParticipant) return ApiResponse.error(res, 'Access denied', 403);

      // Verify the file belongs to this user's drive
      const userFolderId = await GoogleDriveService.getUserFolder(req.user);
      const allowed = await GoogleDriveService.isInsideFolder(drive_file_id, userFolderId);
      if (!allowed) return ApiResponse.error(res, 'Access denied to this file', 403);

      // Get file metadata
      const driveFile = await GoogleDriveService.getFile(drive_file_id);

      const message = await ChatModel.sendMessage({
        conversation_id: conversationId,
        sender_id: req.user.id,
        content: content || null,
        attachment: {
          drive_id: driveFile.id,
          name: driveFile.name,
          mime: driveFile.mimeType,
          size: driveFile.size ? parseInt(driveFile.size) : 0,
          link: driveFile.webViewLink || driveFile.webContentLink || null
        }
      });

      await ChatModel.markAsRead(conversationId, req.user.id);

      const participantIds = await ChatModel.getParticipantIds(conversationId);
      emitToParticipants(getIO(), participantIds, req.user.id, conversationId, message);

      return ApiResponse.success(res, { message }, 'Attachment sent', 201);
    } catch (err) {
      console.error('Attach drive error:', err);
      return ApiResponse.error(res, 'Failed to send attachment');
    }
  }

  // POST /chat/save-to-drive — copy a chat attachment to user's chat_attachments folder
  static async saveToDrive(req, res) {
    try {
      const { drive_file_id, file_name, message_id } = req.body;

      if (!drive_file_id || !message_id) return ApiResponse.error(res, 'No file specified', 400);

      // Check if already saved
      const [existing] = await db.query(
        'SELECT id FROM chat_saved_attachments WHERE user_id = ? AND message_id = ?',
        [req.user.id, parseInt(message_id)]
      );
      if (existing.length > 0) {
        return ApiResponse.error(res, 'Already saved to your Drive', 409);
      }

      // Save to user's chat_attachments folder
      const userFolderId = await GoogleDriveService.getUserFolder(req.user);
      const attachFolderId = await GoogleDriveService.getChatAttachmentsFolder(userFolderId);
      const copied = await GoogleDriveService.copyFile(drive_file_id, attachFolderId, file_name);

      // Track in DB
      await db.query(
        'INSERT INTO chat_saved_attachments (user_id, message_id, drive_file_id) VALUES (?, ?, ?)',
        [req.user.id, parseInt(message_id), copied.id]
      );

      return ApiResponse.success(res, { file: copied }, 'Saved to your Drive');
    } catch (err) {
      console.error('Save to drive error:', err);
      return ApiResponse.error(res, 'Failed to save to Drive');
    }
  }

  // GET /chat/drive-files — API: list user's drive files for picker
  static async listDriveFiles(req, res) {
    try {
      const userFolderId = await GoogleDriveService.getUserFolder(req.user);
      const subfolder = req.query.folder || null;

      if (subfolder && subfolder !== userFolderId) {
        const allowed = await GoogleDriveService.isInsideFolder(subfolder, userFolderId);
        if (!allowed) return ApiResponse.error(res, 'Access denied', 403);
      }

      const files = await GoogleDriveService.listFiles(userFolderId, subfolder);
      return ApiResponse.success(res, { files, currentFolderId: subfolder || userFolderId, rootFolderId: userFolderId });
    } catch (err) {
      console.error('List drive files error:', err);
      return ApiResponse.error(res, 'Failed to list drive files');
    }
  }

  // POST /chat/conversations/:id/read — API: mark as read
  static async markAsRead(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const isParticipant = await ChatModel.isParticipant(conversationId, req.user.id);

      if (!isParticipant) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      const lastReadId = await ChatModel.markAsRead(conversationId, req.user.id);

      // Notify other participants so their sent-message ticks turn blue
      if (lastReadId) {
        const io = getIO();
        const participantIds = await ChatModel.getParticipantIds(conversationId);
        participantIds.forEach(uid => {
          if (uid !== req.user.id) {
            io.to(`user:${uid}`).emit('chat:read', {
              conversation_id: conversationId,
              reader_id: req.user.id,
              last_read_message_id: lastReadId
            });
          }
        });
      }

      return ApiResponse.success(res, {}, 'Marked as read');
    } catch (err) {
      console.error('Mark as read error:', err);
      return ApiResponse.error(res, 'Failed to mark as read');
    }
  }

  // POST /chat/conversations/:id/clear — API: clear chat for current user only
  static async clearChat(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const isParticipant = await ChatModel.isParticipant(conversationId, req.user.id);
      if (!isParticipant) return ApiResponse.error(res, 'Access denied', 403);

      await ChatModel.clearChatForUser(conversationId, req.user.id);
      return ApiResponse.success(res, {}, 'Chat cleared');
    } catch (err) {
      console.error('Clear chat error:', err);
      return ApiResponse.error(res, 'Failed to clear chat');
    }
  }

  // GET /chat/unread-count — API: total unread count (for badge)
  static async unreadCount(req, res) {
    try {
      const count = await ChatModel.getTotalUnreadCount(req.user.id);
      return ApiResponse.success(res, { count });
    } catch (err) {
      return ApiResponse.success(res, { count: 0 });
    }
  }

  // GET /chat/attachment/:messageId?action=view|download
  static async serveAttachment(req, res) {
    try {
      const messageId = parseInt(req.params.messageId);
      const action = req.query.action === 'download' ? 'download' : 'view';

      const [rows] = await db.query(
        `SELECT m.attachment_drive_id, m.attachment_name, m.attachment_mime, m.conversation_id
         FROM chat_messages m WHERE m.id = ? AND m.attachment_drive_id IS NOT NULL`,
        [messageId]
      );
      if (!rows.length) return ApiResponse.error(res, 'Attachment not found', 404);

      const msg = rows[0];
      const isParticipant = await ChatModel.isParticipant(msg.conversation_id, req.user.id);
      if (!isParticipant) return ApiResponse.error(res, 'Access denied', 403);

      const { stream, name, mimeType } = await GoogleDriveService.downloadFile(msg.attachment_drive_id);
      const filename = encodeURIComponent(msg.attachment_name || name);

      if (action === 'view') {
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      } else {
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      }
      res.setHeader('Content-Type', msg.attachment_mime || mimeType);
      stream.pipe(res);
    } catch (err) {
      console.error('Serve attachment error:', err);
      return ApiResponse.error(res, 'Failed to serve attachment');
    }
  }

}

module.exports = ChatController;
