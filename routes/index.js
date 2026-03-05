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

// Dashboard
router.get('/dashboard', authenticate, DashboardController.show);

// Users
router.get('/users', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER'), UserController.index);
router.post('/users', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER'), UserController.create);
router.put('/users/:id', authenticate, requireRoles('LOCAL_ADMIN'), UserController.update);
router.get('/users/:id/progress', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER', 'CLIENT_ADMIN', 'CLIENT_MANAGER'), UserController.showProgress);
router.get('/users/:id/monthly-report', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER', 'CLIENT_ADMIN', 'CLIENT_MANAGER'), UserController.monthlyReport);
router.post('/users/:id/reset-password', authenticate, requireRoles('LOCAL_ADMIN'), UserController.resetPassword);
router.patch('/users/:id/toggle', authenticate, requireRoles('LOCAL_ADMIN'), UserController.toggleActive);

// Change Password (all authenticated users)
router.post('/change-password', authenticate, UserController.changePassword);

// Rewards
router.get('/rewards', authenticate, RewardController.index);
router.post('/rewards/mark-paid/:id', authenticate, requireRoles('LOCAL_ADMIN'), RewardController.markPaid);

// Reports
router.get('/reports/completion', authenticate, requireRoles('CLIENT_ADMIN', 'LOCAL_ADMIN', 'CLIENT_MANAGER', 'LOCAL_MANAGER'), ReportController.completionReport);
router.get('/reports/rewards', authenticate, requireRoles('CLIENT_ADMIN', 'LOCAL_ADMIN', 'CLIENT_MANAGER', 'LOCAL_MANAGER'), ReportController.rewardReport);
router.get('/attendance', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER', 'CLIENT_ADMIN', 'CLIENT_MANAGER'), ReportController.attendanceReport);

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

module.exports = router;
