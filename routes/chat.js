const express = require('express');
const router = express.Router();
const multer = require('multer');
const authenticate = require('../middleware/authenticate');
const ChatController = require('../controllers/chatController');

// Multer: memory storage for chat attachments, 100MB max
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

router.use(authenticate);

// Page
router.get('/', ChatController.index);

// API
router.get('/conversations', ChatController.listConversations);
router.post('/conversations', ChatController.createConversation);
router.get('/conversations/:id/messages', ChatController.getMessages);
router.post('/conversations/:id/messages', ChatController.sendMessage);
router.post('/conversations/:id/attach-local', upload.single('file'), ChatController.attachLocal);
router.post('/conversations/:id/attach-drive', ChatController.attachDrive);
router.post('/save-to-drive', ChatController.saveToDrive);
router.get('/drive-files', ChatController.listDriveFiles);
router.post('/conversations/:id/read', ChatController.markAsRead);
router.post('/conversations/:id/clear', ChatController.clearChat);
router.patch('/messages/:id', ChatController.editMessage);
router.delete('/messages/:id', ChatController.deleteMessage);
router.post('/conversations/:id/reply', ChatController.sendReply);
router.post('/messages/:id/react', ChatController.toggleReaction);
router.get('/conversations/:id/search', ChatController.searchMessages);
router.post('/conversations/:id/members', ChatController.addMembers);
router.patch('/conversations/:id/name', ChatController.renameGroup);
router.post('/conversations/:id/mute', ChatController.toggleMute);
router.post('/conversations/:id/leave', ChatController.leaveGroup);
router.delete('/conversations/:id', ChatController.deleteGroup);
router.delete('/conversations/:id/members/:userId', ChatController.removeMember);
router.get('/unread-count', ChatController.unreadCount);
router.get('/users', ChatController.listUsers);
router.get('/attachment/:messageId', ChatController.serveAttachment);

module.exports = router;
