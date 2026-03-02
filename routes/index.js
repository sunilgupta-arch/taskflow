const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requireRoles } = require('../middleware/authorize');

const DashboardController = require('../controllers/dashboardController');
const UserController = require('../controllers/userController');
const RewardController = require('../controllers/rewardController');
const ReportController = require('../controllers/reportController');
const NoteController = require('../controllers/noteController');

// Dashboard
router.get('/dashboard', authenticate, DashboardController.show);

// Users
router.get('/users', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER'), UserController.index);
router.post('/users', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER'), UserController.create);
router.put('/users/:id', authenticate, requireRoles('LOCAL_ADMIN'), UserController.update);
router.patch('/users/leave', authenticate, requireRoles('LOCAL_ADMIN'), UserController.updateLeave);
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
router.get('/attendance', authenticate, requireRoles('LOCAL_ADMIN', 'LOCAL_MANAGER', 'CLIENT_ADMIN'), ReportController.attendanceReport);

// Notes (all authenticated users)
router.get('/notes', authenticate, NoteController.index);
router.post('/notes', authenticate, NoteController.create);
router.put('/notes/:id', authenticate, NoteController.update);
router.delete('/notes/:id', authenticate, NoteController.destroy);

module.exports = router;
