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
router.get('/unread-count', ChatController.unreadCount);

module.exports = router;
