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

  // PATCH /chat/messages/:id — edit a message
  static async editMessage(req, res) {
    try {
      const messageId = parseInt(req.params.id);
      const { content } = req.body;
      const updated = await ChatModel.editMessage(messageId, req.user.id, content);
      try {
        const io = getIO();
        const participantIds = await ChatModel.getParticipantIds(updated.conversation_id);
        participantIds.forEach(uid => io.to(`user:${uid}`).emit('chat:message_edited', { message: updated }));
      } catch (_) {}
      return ApiResponse.success(res, { message: updated });
    } catch (err) {
      return ApiResponse.error(res, err.message || 'Failed to edit message', 400);
    }
  }

  // DELETE /chat/messages/:id — soft-delete a message
  static async deleteMessage(req, res) {
    try {
      const messageId = parseInt(req.params.id);
      const [[msg]] = await db.query('SELECT conversation_id FROM chat_messages WHERE id = ?', [messageId]);
      if (!msg) return ApiResponse.error(res, 'Not found', 404);
      await ChatModel.deleteMessage(messageId, req.user.id, req.user.role_name);
      try {
        const io = getIO();
        const participantIds = await ChatModel.getParticipantIds(msg.conversation_id);
        participantIds.forEach(uid => io.to(`user:${uid}`).emit('chat:message_deleted', { message_id: messageId, conversation_id: msg.conversation_id }));
      } catch (_) {}
      return ApiResponse.success(res, {}, 'Message deleted');
    } catch (err) {
      return ApiResponse.error(res, err.message || 'Failed to delete message', 400);
    }
  }

  // POST /chat/conversations/:id/reply
  static async sendReply(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const { content, reply_to_id } = req.body;
      if (!reply_to_id) return ApiResponse.error(res, 'reply_to_id is required', 400);
      const isParticipant = await ChatModel.isParticipant(conversationId, req.user.id);
      if (!isParticipant) return ApiResponse.error(res, 'Access denied', 403);
      const message = await ChatModel.sendReply({ conversation_id: conversationId, sender_id: req.user.id, content, reply_to_id: parseInt(reply_to_id) });
      const participantIds = await ChatModel.getParticipantIds(conversationId);
      try {
        const io = getIO();
        emitToParticipants(io, participantIds, req.user.id, conversationId, message);
      } catch (_) {}
      return ApiResponse.success(res, { message }, 'Reply sent', 201);
    } catch (err) {
      return ApiResponse.error(res, err.message || 'Failed to send reply', 400);
    }
  }

  // POST /chat/messages/:id/react
  static async toggleReaction(req, res) {
    try {
      const messageId = parseInt(req.params.id);
      const { emoji } = req.body;
      if (!emoji) return ApiResponse.error(res, 'Emoji is required', 400);
      const [[msg]] = await db.query('SELECT conversation_id FROM chat_messages WHERE id = ?', [messageId]);
      if (!msg) return ApiResponse.error(res, 'Not found', 404);
      const result = await ChatModel.toggleReaction(messageId, req.user.id, emoji);
      const reactions = await ChatModel.getReactions([messageId]);
      try {
        const io = getIO();
        const participantIds = await ChatModel.getParticipantIds(msg.conversation_id);
        participantIds.forEach(uid => io.to(`user:${uid}`).emit('chat:reaction', { message_id: messageId, conversation_id: msg.conversation_id, reactions: reactions[messageId] || {} }));
      } catch (_) {}
      return ApiResponse.success(res, { action: result.action, reactions: reactions[messageId] || {} });
    } catch (err) {
      return ApiResponse.error(res, err.message || 'Failed to react', 400);
    }
  }

  // GET /chat/conversations/:id/search?q=
  static async searchMessages(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const q = (req.query.q || '').trim();
      if (q.length < 2) return ApiResponse.error(res, 'Search query too short', 400);
      const isParticipant = await ChatModel.isParticipant(conversationId, req.user.id);
      if (!isParticipant) return ApiResponse.error(res, 'Access denied', 403);
      const messages = await ChatModel.searchMessages(conversationId, q, req.user.id);
      return ApiResponse.success(res, { messages, query: q });
    } catch (err) {
      return ApiResponse.error(res, 'Search failed', 500);
    }
  }

  // POST /chat/conversations/:id/members — add members to group
  static async addMembers(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const { user_ids } = req.body;
      if (!Array.isArray(user_ids) || !user_ids.length) return ApiResponse.error(res, 'No users selected', 400);
      const ids = user_ids.map(id => parseInt(id));
      const added = await ChatModel.addMembers(conversationId, ids, req.user.id, req.user.role_name);
      if (added.length) {
        const conv = await ChatModel.getConversationById(conversationId);
        try {
          const io = getIO();
          const participantIds = await ChatModel.getParticipantIds(conversationId);
          participantIds.forEach(uid => io.to(`user:${uid}`).emit('chat:members_added', { conversation_id: conversationId, conversation: conv }));
        } catch (_) {}
      }
      return ApiResponse.success(res, { added }, added.length ? `${added.length} member(s) added` : 'All selected users are already members');
    } catch (err) {
      return ApiResponse.error(res, err.message || 'Failed to add members', 400);
    }
  }

  // PATCH /chat/conversations/:id/name — rename group
  static async renameGroup(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const { name } = req.body;
      await ChatModel.renameGroup(conversationId, name, req.user.id, req.user.role_name);
      try {
        const io = getIO();
        const participantIds = await ChatModel.getParticipantIds(conversationId);
        participantIds.forEach(uid => io.to(`user:${uid}`).emit('chat:renamed', { conversation_id: conversationId, name: name.trim() }));
      } catch (_) {}
      return ApiResponse.success(res, { name: name.trim() }, 'Group renamed');
    } catch (err) {
      return ApiResponse.error(res, err.message || 'Failed to rename group', 400);
    }
  }

  // POST /chat/conversations/:id/mute — toggle mute
  static async toggleMute(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const result = await ChatModel.toggleMute(conversationId, req.user.id);
      return ApiResponse.success(res, result, result.muted ? 'Conversation muted' : 'Conversation unmuted');
    } catch (err) {
      return ApiResponse.error(res, err.message || 'Failed to toggle mute', 400);
    }
  }

  // POST /chat/conversations/:id/leave
  static async leaveGroup(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      await ChatModel.leaveGroup(conversationId, req.user.id);
      try {
        const io = getIO();
        io.emit('chat:member_removed', { conversation_id: conversationId, user_id: req.user.id });
      } catch (_) {}
      return ApiResponse.success(res, {}, 'You have left the group');
    } catch (err) {
      console.error('Leave group error:', err);
      return ApiResponse.error(res, err.message || 'Failed to leave group', 400);
    }
  }

  // DELETE /chat/conversations/:id
  static async deleteGroup(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const participantIds = await ChatModel.getParticipantIds(conversationId);
      await ChatModel.deleteGroup(conversationId, req.user.id, req.user.role_name);
      try {
        const io = getIO();
        participantIds.forEach(uid => {
          io.to(`user:${uid}`).emit('chat:group_deleted', { conversation_id: conversationId });
        });
      } catch (_) {}
      return ApiResponse.success(res, {}, 'Group deleted');
    } catch (err) {
      console.error('Delete group error:', err);
      return ApiResponse.error(res, err.message || 'Failed to delete group', 400);
    }
  }

  // DELETE /chat/conversations/:id/members/:userId
  static async removeMember(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const targetUserId   = parseInt(req.params.userId);
      await ChatModel.removeMember(conversationId, targetUserId, req.user.id, req.user.role_name);
      try {
        const io = getIO();
        io.emit('chat:member_removed', { conversation_id: conversationId, user_id: targetUserId });
      } catch (_) {}
      return ApiResponse.success(res, {}, 'Member removed');
    } catch (err) {
      console.error('Remove member error:', err);
      return ApiResponse.error(res, err.message || 'Failed to remove member', 400);
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
