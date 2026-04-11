const PortalChat = require('../models/Chat');
const { ApiResponse } = require('../../utils/response');
const path = require('path');
const fs = require('fs');

class PortalChatController {

  // Render chat page
  static async index(req, res) {
    try {
      const contacts = await PortalChat.getClientUsers(req.user.id);
      res.render('portal/chat', {
        title: 'Chat - Client Portal',
        layout: 'portal/layout',
        section: 'chat',
        contacts
      });
    } catch (err) {
      console.error('Portal chat index error:', err);
      res.status(500).render('error', { title: 'Error', message: 'Failed to load chat', code: 500, layout: false });
    }
  }

  // List conversations
  static async listConversations(req, res) {
    try {
      const conversations = await PortalChat.getConversationsForUser(req.user.id);
      return ApiResponse.success(res, { conversations });
    } catch (err) {
      console.error('Portal list conversations error:', err);
      return ApiResponse.error(res, 'Failed to load conversations');
    }
  }

  // Create or get direct conversation / create group
  static async createConversation(req, res) {
    try {
      const { type, participant_ids, name } = req.body;

      if (type === 'direct') {
        if (!participant_ids || participant_ids.length !== 1) {
          return ApiResponse.error(res, 'Direct chat requires exactly one participant', 400);
        }
        // Check for existing direct conversation
        const existing = await PortalChat.findDirectConversation(req.user.id, participant_ids[0]);
        if (existing) {
          return ApiResponse.success(res, { conversation_id: existing.id, existing: true });
        }
      }

      if (type === 'group') {
        // Only admin and managers can create groups
        if (!['CLIENT_ADMIN', 'CLIENT_TOP_MGMT', 'CLIENT_MGMT', 'CLIENT_MANAGER'].includes(req.user.role_name)) {
          return ApiResponse.error(res, 'You cannot create group conversations', 403);
        }
        if (!participant_ids || participant_ids.length < 1) {
          return ApiResponse.error(res, 'Group requires at least one other participant', 400);
        }
      }

      const conversationId = await PortalChat.createConversation({
        type: type || 'direct',
        name: name || null,
        created_by: req.user.id,
        participant_ids: participant_ids || []
      });

      return ApiResponse.success(res, { conversation_id: conversationId }, 'Conversation created');
    } catch (err) {
      console.error('Portal create conversation error:', err);
      return ApiResponse.error(res, 'Failed to create conversation');
    }
  }

  // Get messages
  static async getMessages(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const beforeId = req.query.before ? parseInt(req.query.before) : null;

      // Privacy check
      const isParticipant = await PortalChat.isParticipant(conversationId, req.user.id);
      if (!isParticipant) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      const messages = await PortalChat.getMessages(conversationId, 50, beforeId, req.user.id);
      return ApiResponse.success(res, { messages });
    } catch (err) {
      console.error('Portal get messages error:', err);
      return ApiResponse.error(res, 'Failed to load messages');
    }
  }

  // Send a text message
  static async sendMessage(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;

      if (!content || !content.trim()) {
        return ApiResponse.error(res, 'Message cannot be empty', 400);
      }

      const isParticipant = await PortalChat.isParticipant(conversationId, req.user.id);
      if (!isParticipant) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      const message = await PortalChat.sendMessage({
        conversation_id: conversationId,
        sender_id: req.user.id,
        content: content.trim(),
        type: 'text'
      });

      // Emit via Socket.IO to conv room + all participant personal rooms
      const { getIO } = require('../../config/socket');
      try {
        const io = getIO();
        const portalNs = io.of('/portal');
        // Emit to conv room (for users who have it open)
        portalNs.to(`portal:conv:${conversationId}`).emit('portal:message', message);
        // Also emit to each participant's personal room (for notifications)
        const participants = await PortalChat.getParticipants(conversationId);
        const conv = await PortalChat.getConversation(conversationId);
        participants.forEach(p => {
          if (p.id !== req.user.id) {
            portalNs.to(`portal:user:${p.id}`).emit('portal:notify', {
              ...message,
              conversation_id: conversationId,
              sender_name: req.user.name,
              conversation_name: conv?.type === 'group' ? conv.name : null
            });
          }
        });
      } catch (_) {}

      return ApiResponse.success(res, { message }, 'Message sent');
    } catch (err) {
      console.error('Portal send message error:', err);
      return ApiResponse.error(res, 'Failed to send message');
    }
  }

  // Upload and send file
  static async sendFile(req, res) {
    try {
      const conversationId = parseInt(req.params.id);

      if (!req.file) {
        return ApiResponse.error(res, 'No file uploaded', 400);
      }

      const isParticipant = await PortalChat.isParticipant(conversationId, req.user.id);
      if (!isParticipant) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      // Save file to disk
      const uploadsDir = path.join(__dirname, '../../uploads/portal');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      const uniqueName = `${Date.now()}_${req.file.originalname}`;
      const filePath = path.join(uploadsDir, uniqueName);
      fs.writeFileSync(filePath, req.file.buffer);

      // Create file message
      const message = await PortalChat.sendMessage({
        conversation_id: conversationId,
        sender_id: req.user.id,
        content: req.file.originalname,
        type: 'file'
      });

      // Save attachment record
      await PortalChat.saveAttachment({
        message_id: message.id,
        file_name: req.file.originalname,
        file_path: `portal/${uniqueName}`,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        uploaded_by: req.user.id
      });

      // Re-fetch message with attachment
      const messages = await PortalChat.getMessages(conversationId, 1);
      const fullMessage = messages[messages.length - 1];

      // Emit via Socket.IO to conv room + all participant personal rooms
      const { getIO } = require('../../config/socket');
      try {
        const io = getIO();
        const portalNs = io.of('/portal');
        portalNs.to(`portal:conv:${conversationId}`).emit('portal:message', fullMessage);
        const participants = await PortalChat.getParticipants(conversationId);
        const conv = await PortalChat.getConversation(conversationId);
        participants.forEach(p => {
          if (p.id !== req.user.id) {
            portalNs.to(`portal:user:${p.id}`).emit('portal:notify', {
              ...fullMessage,
              conversation_id: conversationId,
              sender_name: req.user.name,
              conversation_name: conv?.type === 'group' ? conv.name : null
            });
          }
        });
      } catch (_) {}

      return ApiResponse.success(res, { message: fullMessage }, 'File sent');
    } catch (err) {
      console.error('Portal send file error:', err);
      return ApiResponse.error(res, 'Failed to send file');
    }
  }

  // Serve file attachment
  static async serveAttachment(req, res) {
    try {
      const messageId = parseInt(req.params.messageId);
      const attachment = await PortalChat.getAttachment(messageId);

      if (!attachment) {
        return res.status(404).json({ success: false, message: 'Attachment not found' });
      }

      // Privacy: check sender or participant
      const [msgRows] = await require('../../config/db').query(
        'SELECT conversation_id FROM portal_messages WHERE id = ?', [messageId]
      );
      if (!msgRows.length) return res.status(404).json({ success: false, message: 'Message not found' });

      const isParticipant = await PortalChat.isParticipant(msgRows[0].conversation_id, req.user.id);
      if (!isParticipant) return res.status(403).json({ success: false, message: 'Access denied' });

      const filePath = path.join(__dirname, '../../uploads', attachment.file_path);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'File not found on disk' });
      }

      res.setHeader('Content-Disposition', `inline; filename="${attachment.file_name}"`);
      res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
      res.sendFile(filePath);
    } catch (err) {
      console.error('Portal serve attachment error:', err);
      return res.status(500).json({ success: false, message: 'Failed to serve file' });
    }
  }

  // Mark as read
  static async markAsRead(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const lastReadId = await PortalChat.markAsRead(conversationId, req.user.id);
      return ApiResponse.success(res, { last_read_message_id: lastReadId }, 'Marked as read');
    } catch (err) {
      return ApiResponse.error(res, 'Failed to mark as read');
    }
  }

  // Total unread count
  static async unreadCount(req, res) {
    try {
      const total = await PortalChat.getTotalUnreadCount(req.user.id);
      return ApiResponse.success(res, { total });
    } catch (err) {
      return ApiResponse.error(res, 'Failed to get unread count');
    }
  }
  // Search messages in a conversation
  static async searchMessages(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const { q } = req.query;
      if (!q || !q.trim()) return ApiResponse.success(res, { messages: [] });

      const isParticipant = await PortalChat.isParticipant(conversationId, req.user.id);
      if (!isParticipant) return ApiResponse.error(res, 'Access denied', 403);

      const messages = await PortalChat.searchMessages(conversationId, q.trim());
      return ApiResponse.success(res, { messages });
    } catch (err) {
      return ApiResponse.error(res, 'Search failed');
    }
  }

  // Edit a message
  static async editMessage(req, res) {
    try {
      const messageId = parseInt(req.params.messageId);
      const { content } = req.body;
      if (!content || !content.trim()) return ApiResponse.error(res, 'Content required', 400);

      const result = await PortalChat.editMessage(messageId, req.user.id, content.trim());
      if (!result) return ApiResponse.error(res, 'Cannot edit this message', 403);

      // Emit edit event
      const { getIO } = require('../../config/socket');
      try {
        const io = getIO();
        io.of('/portal').to(`portal:conv:${result.conversation_id}`).emit('portal:message:edit', {
          id: result.id,
          conversation_id: result.conversation_id,
          content: result.content
        });
      } catch (_) {}

      return ApiResponse.success(res, { message: result }, 'Message edited');
    } catch (err) {
      return ApiResponse.error(res, 'Failed to edit message');
    }
  }

  // Delete a message
  static async deleteMessage(req, res) {
    try {
      const messageId = parseInt(req.params.messageId);

      const result = await PortalChat.deleteMessage(messageId, req.user.id);
      if (!result) return ApiResponse.error(res, 'Cannot delete this message', 403);

      // Emit delete event
      const { getIO } = require('../../config/socket');
      try {
        const io = getIO();
        io.of('/portal').to(`portal:conv:${result.conversation_id}`).emit('portal:message:delete', {
          id: result.id,
          conversation_id: result.conversation_id
        });
      } catch (_) {}

      return ApiResponse.success(res, {}, 'Message deleted');
    } catch (err) {
      return ApiResponse.error(res, 'Failed to delete message');
    }
  }

  // Add members to group
  static async addGroupMembers(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const { user_ids } = req.body;
      if (!user_ids || !user_ids.length) return ApiResponse.error(res, 'No users selected', 400);

      const conv = await PortalChat.getConversation(conversationId);
      if (!conv || conv.type !== 'group') return ApiResponse.error(res, 'Not a group conversation', 400);

      // Only creator or admin/manager can add
      if (conv.created_by !== req.user.id && !['CLIENT_ADMIN', 'CLIENT_TOP_MGMT', 'CLIENT_MGMT', 'CLIENT_MANAGER'].includes(req.user.role_name)) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      await PortalChat.addMembers(conversationId, user_ids);
      const participants = await PortalChat.getParticipants(conversationId);
      return ApiResponse.success(res, { participants }, 'Members added');
    } catch (err) {
      return ApiResponse.error(res, 'Failed to add members');
    }
  }

  // Remove member from group
  static async removeGroupMember(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const userId = parseInt(req.params.userId);

      const conv = await PortalChat.getConversation(conversationId);
      if (!conv || conv.type !== 'group') return ApiResponse.error(res, 'Not a group', 400);

      if (conv.created_by !== req.user.id && !['CLIENT_ADMIN', 'CLIENT_TOP_MGMT', 'CLIENT_MGMT', 'CLIENT_MANAGER'].includes(req.user.role_name)) {
        return ApiResponse.error(res, 'Access denied', 403);
      }

      if (userId === conv.created_by) return ApiResponse.error(res, 'Cannot remove group creator', 400);

      await PortalChat.removeMember(conversationId, userId);
      const participants = await PortalChat.getParticipants(conversationId);
      return ApiResponse.success(res, { participants }, 'Member removed');
    } catch (err) {
      return ApiResponse.error(res, 'Failed to remove member');
    }
  }

  // Get group members
  static async getGroupMembers(req, res) {
    try {
      const conversationId = parseInt(req.params.id);
      const isParticipant = await PortalChat.isParticipant(conversationId, req.user.id);
      if (!isParticipant) return ApiResponse.error(res, 'Access denied', 403);

      const participants = await PortalChat.getParticipants(conversationId);
      const conv = await PortalChat.getConversation(conversationId);
      return ApiResponse.success(res, { participants, conversation: conv });
    } catch (err) {
      return ApiResponse.error(res, 'Failed to load members');
    }
  }
}

module.exports = PortalChatController;
