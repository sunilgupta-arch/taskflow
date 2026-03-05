const express = require('express');
const router = express.Router();
const TaskController = require('../controllers/taskController');
const authenticate = require('../middleware/authenticate');
const { authorize, requireRoles } = require('../middleware/authorize');
const upload = require('../config/multer');
const auditLog = require('../middleware/auditLog');

router.use(authenticate);

router.get('/', TaskController.index);
router.get('/my', TaskController.myTasks);
router.get('/create', requireRoles('CLIENT_ADMIN', 'CLIENT_MANAGER', 'LOCAL_ADMIN', 'LOCAL_MANAGER', 'LOCAL_USER'), TaskController.showCreate);
router.post('/create', requireRoles('CLIENT_ADMIN', 'CLIENT_MANAGER', 'LOCAL_ADMIN', 'LOCAL_MANAGER', 'LOCAL_USER'), auditLog('CREATE', 'task'), TaskController.create);
router.post('/assign', requireRoles('CLIENT_ADMIN', 'CLIENT_MANAGER', 'LOCAL_ADMIN', 'LOCAL_MANAGER'), auditLog('ASSIGN', 'task'), TaskController.assign);
router.post('/pick/:id', requireRoles('LOCAL_USER'), TaskController.pick);
router.post('/start/:id', requireRoles('LOCAL_USER', 'LOCAL_MANAGER', 'LOCAL_ADMIN'), TaskController.start);
router.post('/complete/:id', requireRoles('LOCAL_USER', 'LOCAL_MANAGER', 'LOCAL_ADMIN'), auditLog('COMPLETE', 'task'), TaskController.complete);
router.post('/deactivate/:id', requireRoles('CLIENT_ADMIN', 'CLIENT_MANAGER', 'LOCAL_ADMIN', 'LOCAL_MANAGER'), auditLog('DEACTIVATE', 'task'), TaskController.deactivate);
router.get('/:id', TaskController.show);
router.get('/:id/comments', TaskController.getComments);
router.post('/:id/comments', TaskController.addComment);
router.post('/:id/upload', upload.array('files', 5), TaskController.uploadAttachments);
router.delete('/:id', requireRoles('CLIENT_ADMIN', 'LOCAL_ADMIN'), TaskController.destroy);

module.exports = router;
