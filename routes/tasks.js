const express = require('express');
const router = express.Router();
const TaskController = require('../controllers/taskController');
const authenticate = require('../middleware/authenticate');
const { authorize, requireRoles } = require('../middleware/authorize');
const upload = require('../config/multer');
const auditLog = require('../middleware/auditLog');

router.use(authenticate);

router.get('/', TaskController.index);
router.get('/create', requireRoles('CFC_ADMIN', 'CFC_MANAGER'), TaskController.showCreate);
router.post('/create', requireRoles('CFC_ADMIN', 'CFC_MANAGER'), auditLog('CREATE', 'task'), TaskController.create);
router.post('/assign', requireRoles('CFC_ADMIN', 'CFC_MANAGER', 'OUR_ADMIN', 'OUR_MANAGER'), auditLog('ASSIGN', 'task'), TaskController.assign);
router.post('/pick/:id', requireRoles('OUR_USER'), TaskController.pick);
router.post('/complete/:id', requireRoles('OUR_USER', 'OUR_MANAGER', 'OUR_ADMIN'), auditLog('COMPLETE', 'task'), TaskController.complete);
router.get('/:id', TaskController.show);
router.post('/:id/comments', TaskController.addComment);
router.post('/:id/upload', upload.array('files', 5), TaskController.uploadAttachments);
router.delete('/:id', requireRoles('CFC_ADMIN', 'OUR_ADMIN'), TaskController.destroy);

module.exports = router;
