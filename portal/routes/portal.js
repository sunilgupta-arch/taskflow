const express = require('express');
const router = express.Router();
const multer = require('multer');
const authenticate = require('../../middleware/authenticate');
const portalOnly = require('../middleware/portalOnly');
const PortalChatController = require('../controllers/chatController');
const PortalTaskController = require('../controllers/taskController');
const PortalUserController = require('../controllers/userController');
const PortalTeamStatusController = require('../controllers/teamStatusController');
const { requireRoles } = require('../../middleware/authorize');

// Multer: memory storage for portal file uploads, 100MB max
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

// All portal routes require auth + client role
router.use(authenticate);
router.use(portalOnly);

// ── Portal landing (redirect to chat) ────────────────────
router.get('/', (req, res) => res.redirect('/portal/chat'));

// ── Chat Pages & API ─────────────────────────────────────
router.get('/chat', PortalChatController.index);
router.get('/chat/conversations', PortalChatController.listConversations);
router.post('/chat/conversations', PortalChatController.createConversation);
router.get('/chat/conversations/:id/messages', PortalChatController.getMessages);
router.post('/chat/conversations/:id/messages', PortalChatController.sendMessage);
router.post('/chat/conversations/:id/file', upload.single('file'), PortalChatController.sendFile);
router.get('/chat/attachment/:messageId', PortalChatController.serveAttachment);
router.post('/chat/conversations/:id/read', PortalChatController.markAsRead);
router.get('/chat/unread-count', PortalChatController.unreadCount);
router.get('/chat/conversations/:id/search', PortalChatController.searchMessages);
router.put('/chat/messages/:messageId', PortalChatController.editMessage);
router.delete('/chat/messages/:messageId', PortalChatController.deleteMessage);
router.get('/chat/conversations/:id/members', PortalChatController.getGroupMembers);
router.post('/chat/conversations/:id/members', PortalChatController.addGroupMembers);
router.delete('/chat/conversations/:id/members/:userId', PortalChatController.removeGroupMember);

// ── Tasks Pages & API ────────────────────────────────────
router.get('/tasks', PortalTaskController.index);
router.get('/tasks/list', PortalTaskController.list);
router.post('/tasks', PortalTaskController.create);
router.get('/tasks/:id', PortalTaskController.getTask);
router.put('/tasks/:id', PortalTaskController.update);
router.post('/tasks/:id/comments', upload.single('file'), PortalTaskController.addComment);
router.get('/tasks/attachment/:attachmentId', PortalTaskController.serveAttachment);

// ── Notes ────────────────────────────────────────────────
const NoteModel = require('../../models/Note');
const { ApiResponse: NoteApiResponse } = require('../../utils/response');

router.get('/notes', (req, res) => {
  res.render('portal/notes', {
    title: 'Notes - Client Portal',
    layout: 'portal/layout',
    section: 'notes'
  });
});

router.get('/notes/list', async (req, res) => {
  try {
    const { search } = req.query;
    const { rows } = await NoteModel.getAll({ user_id: req.user.id, search, page: 1, limit: 100 });
    return NoteApiResponse.success(res, { notes: rows });
  } catch (err) {
    return NoteApiResponse.error(res, 'Failed to load notes');
  }
});

router.post('/notes', async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !title.trim()) return NoteApiResponse.error(res, 'Title is required', 400);
    const noteId = await NoteModel.create({ user_id: req.user.id, title: title.trim(), content: content?.trim() || null });
    const note = await NoteModel.findById(noteId);
    return NoteApiResponse.success(res, { note }, 'Note created', 201);
  } catch (err) {
    return NoteApiResponse.error(res, err.message, 400);
  }
});

router.put('/notes/:id', async (req, res) => {
  try {
    const note = await NoteModel.findById(req.params.id);
    if (!note || note.user_id !== req.user.id) return NoteApiResponse.error(res, 'Not found', 404);
    const { title, content } = req.body;
    if (!title || !title.trim()) return NoteApiResponse.error(res, 'Title is required', 400);
    await NoteModel.update(req.params.id, { title: title.trim(), content: content?.trim() || null });
    const updated = await NoteModel.findById(req.params.id);
    return NoteApiResponse.success(res, { note: updated }, 'Note saved');
  } catch (err) {
    return NoteApiResponse.error(res, err.message, 400);
  }
});

router.delete('/notes/:id', async (req, res) => {
  try {
    const note = await NoteModel.findById(req.params.id);
    if (!note || note.user_id !== req.user.id) return NoteApiResponse.error(res, 'Not found', 404);
    await NoteModel.delete(req.params.id);
    return NoteApiResponse.success(res, {}, 'Note deleted');
  } catch (err) {
    return NoteApiResponse.error(res, err.message, 400);
  }
});

// ── Team India (Live Status) ─────────────────────────────
router.get('/team-status', requireRoles('CLIENT_ADMIN', 'CLIENT_MANAGER'), PortalTeamStatusController.index);
router.get('/team-status/data', requireRoles('CLIENT_ADMIN', 'CLIENT_MANAGER'), PortalTeamStatusController.getData);
router.get('/team-status/employee-tasks/:userId', requireRoles('CLIENT_ADMIN', 'CLIENT_MANAGER'), PortalTeamStatusController.getEmployeeTasks);

// ── Bridge Chat (Client <-> Local) ───────────────────────
const BridgeChatController = require('../../controllers/bridgeChatController');
router.post('/bridge/conversations', BridgeChatController.getOrCreateConversation);
router.get('/bridge/conversations/:id/messages', BridgeChatController.getMessages);
router.post('/bridge/conversations/:id/messages', BridgeChatController.sendMessage);
router.post('/bridge/conversations/:id/file', upload.single('file'), BridgeChatController.sendFile);
router.post('/bridge/conversations/:id/read', BridgeChatController.markAsRead);
router.delete('/bridge/messages/:messageId', BridgeChatController.deleteMessage);
router.get('/bridge/attachment/:messageId', BridgeChatController.serveAttachment);
router.get('/bridge/unread-count', BridgeChatController.unreadCount);

// ── Change Password (all portal users) ───────────────────
router.post('/change-password', (req, res) => {
  const UserModel = require('../../models/User');
  const { ApiResponse } = require('../../utils/response');

  const { new_password, confirm_password } = req.body;
  if (!new_password || !confirm_password) return ApiResponse.error(res, 'All fields are required', 400);
  if (new_password.length < 6) return ApiResponse.error(res, 'Password must be at least 6 characters', 400);
  if (new_password !== confirm_password) return ApiResponse.error(res, 'Passwords do not match', 400);

  UserModel.update(req.user.id, { password: new_password })
    .then(() => ApiResponse.success(res, {}, 'Password changed successfully'))
    .catch(err => ApiResponse.error(res, err.message, 400));
});

// ── Users Management (Admin only) ────────────────────────
router.get('/users', requireRoles('CLIENT_ADMIN'), PortalUserController.index);
router.get('/users/list', requireRoles('CLIENT_ADMIN'), PortalUserController.list);
router.post('/users', requireRoles('CLIENT_ADMIN'), PortalUserController.create);
router.put('/users/:id', requireRoles('CLIENT_ADMIN'), PortalUserController.update);
router.post('/users/:id/reset-password', requireRoles('CLIENT_ADMIN'), PortalUserController.resetPassword);
router.patch('/users/:id/toggle', requireRoles('CLIENT_ADMIN'), PortalUserController.toggleActive);

module.exports = router;
