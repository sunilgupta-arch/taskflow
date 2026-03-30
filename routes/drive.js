const express = require('express');
const router = express.Router();
const multer = require('multer');
const authenticate = require('../middleware/authenticate');
const DriveController = require('../controllers/driveController');

// Multer: memory storage (buffer) for Google Drive upload, 100MB max
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

router.use(authenticate);

// Page
router.get('/', DriveController.index);

// API
router.get('/files', DriveController.listFiles);
router.post('/upload', upload.array('files', 20), DriveController.upload);
router.post('/folder', DriveController.createFolder);
router.put('/rename/:fileId', DriveController.rename);
router.delete('/:fileId', DriveController.delete);
router.get('/download/:fileId', DriveController.download);

module.exports = router;
