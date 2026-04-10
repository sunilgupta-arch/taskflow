const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requireRoles } = require('../middleware/authorize');

const DashboardController = require('../controllers/dashboardController');
const UserController = require('../controllers/userController');
const RewardController = require('../controllers/rewardController');
const ReportController = require('../controllers/reportController');
const NoteController = require('../controllers/noteController');
const LeaveController = require('../controllers/leaveController');
const BackupController = require('../controllers/backupController');
const LiveStatusController = require('../controllers/liveStatusController');
const AnnouncementController = require('../controllers/announcementController');

// Dashboard — old dashboard at /dashboard/overview; /dashboard redirects to task board
router.get('/dashboard/overview', authenticate, DashboardController.show);
router.get('/dashboard', authenticate, (req, res) => res.redirect('/tasks/board'));

// Self-service progress & reports (any authenticated user)
router.get('/my-progress', authenticate, UserController.showMyProgress);
router.get('/my-monthly-report', authenticate, UserController.myMonthlyReport);

// Users
router.get('/users', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER'), UserController.index);
router.post('/users', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER'), UserController.create);
router.put('/users/:id', authenticate, requireRoles('LOCAL_ADMIN'), UserController.update);
router.get('/users/:id/progress', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER', 'CLIENT_ADMIN', 'CLIENT_MANAGER'), (req, res) => UserController.showProgress(req, res, false));
router.get('/users/:id/monthly-report', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER', 'CLIENT_ADMIN', 'CLIENT_MANAGER'), UserController.monthlyReport);
router.post('/users/:id/reset-password', authenticate, requireRoles('LOCAL_ADMIN'), UserController.resetPassword);
router.patch('/users/:id/toggle', authenticate, requireRoles('LOCAL_ADMIN'), UserController.toggleActive);

// Change Password (all authenticated users)
router.post('/change-password', authenticate, UserController.changePassword);

// Rewards
router.get('/rewards', authenticate, RewardController.index);
router.post('/rewards/mark-paid/:id', authenticate, requireRoles('LOCAL_ADMIN'), RewardController.markPaid);

// Live Status
router.get('/live-status', authenticate, requireRoles('CLIENT_ADMIN', 'CLIENT_MANAGER', 'LOCAL_ADMIN', 'LOCAL_MANAGER'), LiveStatusController.show);

// Reports
router.get('/reports', authenticate, requireRoles('CLIENT_ADMIN', 'LOCAL_ADMIN', 'CLIENT_MANAGER', 'LOCAL_MANAGER'), ReportController.reportsIndex);
router.get('/reports/completion', authenticate, requireRoles('CLIENT_ADMIN', 'LOCAL_ADMIN', 'CLIENT_MANAGER', 'LOCAL_MANAGER'), ReportController.completionReport);
router.get('/reports/rewards', authenticate, requireRoles('CLIENT_ADMIN', 'LOCAL_ADMIN', 'CLIENT_MANAGER', 'LOCAL_MANAGER'), ReportController.rewardReport);
router.get('/attendance', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER', 'CLIENT_ADMIN', 'CLIENT_MANAGER'), ReportController.attendanceReport);
router.get('/reports/task-completion', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER', 'CLIENT_ADMIN', 'CLIENT_MANAGER'), ReportController.taskCompletionReport);
router.get('/reports/task-day-detail', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER', 'CLIENT_ADMIN', 'CLIENT_MANAGER'), ReportController.taskDayDetail);
router.get('/reports/overdue', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER', 'CLIENT_ADMIN', 'CLIENT_MANAGER'), ReportController.overdueReport);
router.get('/reports/punctuality', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER', 'CLIENT_ADMIN', 'CLIENT_MANAGER'), ReportController.punctualityReport);
router.get('/reports/workload', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER', 'CLIENT_ADMIN', 'CLIENT_MANAGER'), ReportController.workloadReport);
router.get('/my-attendance', authenticate, ReportController.myAttendance);
router.post('/attendance/override', authenticate, requireRoles('LOCAL_ADMIN'), ReportController.attendanceOverride);
router.post('/attendance/force-logout', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER'), ReportController.forceLogout);
router.delete('/attendance/override', authenticate, requireRoles('LOCAL_ADMIN'), ReportController.removeOverride);
router.post('/attendance/holiday', authenticate, requireRoles('LOCAL_ADMIN'), ReportController.addHoliday);
router.delete('/attendance/holiday', authenticate, requireRoles('LOCAL_ADMIN'), ReportController.removeHoliday);

// Leaves (LOCAL roles only: users/managers apply, admin/manager approve/reject)
router.get('/leaves', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER', 'LOCAL_USER'), LeaveController.index);
router.post('/leaves', authenticate, requireRoles('LOCAL_MANAGER', 'LOCAL_USER'), LeaveController.apply);
router.post('/leaves/grant', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER'), LeaveController.grant);
router.patch('/leaves/:id/approve', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER'), LeaveController.approve);
router.patch('/leaves/:id/reject', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER'), LeaveController.reject);

// Notes (all authenticated users)
router.get('/notes', authenticate, NoteController.index);
router.post('/notes', authenticate, NoteController.create);
router.put('/notes/:id', authenticate, NoteController.update);
router.delete('/notes/:id', authenticate, NoteController.destroy);

// Backups (LOCAL_ADMIN only)
const multer = require('multer');
const backupUpload = multer({ dest: require('path').join(__dirname, '..', 'backups', 'uploads'), limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB max

router.get('/backups', authenticate, requireRoles('LOCAL_ADMIN'), BackupController.index);
router.post('/backups/create', authenticate, requireRoles('LOCAL_ADMIN'), BackupController.create);
router.post('/backups/upload-restore', authenticate, requireRoles('LOCAL_ADMIN'), backupUpload.single('backup'), BackupController.uploadRestore);
router.post('/backups/restore/:id', authenticate, requireRoles('LOCAL_ADMIN'), BackupController.restore);
router.post('/backups/settings', authenticate, requireRoles('LOCAL_ADMIN'), BackupController.updateSettings);
router.get('/backups/download/:id', authenticate, requireRoles('LOCAL_ADMIN'), BackupController.download);
router.post('/backups/upload-drive/:id', authenticate, requireRoles('LOCAL_ADMIN'), BackupController.uploadToDrive);
router.get('/backups/drive-list', authenticate, requireRoles('LOCAL_ADMIN'), BackupController.listDriveBackups);
router.post('/backups/restore-drive', authenticate, requireRoles('LOCAL_ADMIN'), BackupController.restoreFromDrive);
router.delete('/backups/:id', authenticate, requireRoles('LOCAL_ADMIN'), BackupController.destroy);

// Bridge Chat (for LOCAL users — floating widget)
const BridgeChatController = require('../controllers/bridgeChatController');
const bridgeUpload = require('multer')({ storage: require('multer').memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
router.get('/bridge/conversations', authenticate, BridgeChatController.getMyConversations);
router.get('/bridge/conversations/:id/messages', authenticate, BridgeChatController.getMessages);
router.post('/bridge/conversations/:id/messages', authenticate, BridgeChatController.sendMessage);
router.post('/bridge/conversations/:id/file', authenticate, bridgeUpload.single('file'), BridgeChatController.sendFile);
router.post('/bridge/conversations/:id/read', authenticate, BridgeChatController.markAsRead);
router.delete('/bridge/messages/:messageId', authenticate, BridgeChatController.deleteMessage);
router.get('/bridge/attachment/:messageId', authenticate, BridgeChatController.serveAttachment);
router.get('/bridge/unread-count', authenticate, BridgeChatController.unreadCount);

// Announcements / Info Board
router.get('/announcements', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER', 'LOCAL_USER', 'CLIENT_ADMIN', 'CLIENT_MANAGER'), AnnouncementController.index);
router.post('/announcements', authenticate, requireRoles('LOCAL_ADMIN', 'CLIENT_ADMIN', 'CLIENT_MANAGER'), AnnouncementController.create);
router.put('/announcements/:id/pin', authenticate, requireRoles('LOCAL_ADMIN', 'CLIENT_ADMIN'), AnnouncementController.togglePin);
router.delete('/announcements/:id', authenticate, requireRoles('LOCAL_ADMIN', 'CLIENT_ADMIN'), AnnouncementController.destroy);

module.exports = router;
