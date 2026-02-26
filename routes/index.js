const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const { requireRoles } = require('../middleware/authorize');

const DashboardController = require('../controllers/dashboardController');
const UserController = require('../controllers/userController');
const RewardController = require('../controllers/rewardController');
const ReportController = require('../controllers/reportController');

// Dashboard
router.get('/dashboard', authenticate, DashboardController.show);

// Users (OUR_ADMIN only)
router.get('/users', authenticate, requireRoles('OUR_ADMIN'), UserController.index);
router.post('/users', authenticate, requireRoles('OUR_ADMIN'), UserController.create);
router.put('/users/:id', authenticate, requireRoles('OUR_ADMIN'), UserController.update);
router.patch('/users/leave', authenticate, requireRoles('OUR_ADMIN'), UserController.updateLeave);
router.post('/users/:id/reset-password', authenticate, requireRoles('OUR_ADMIN'), UserController.resetPassword);
router.patch('/users/:id/toggle', authenticate, requireRoles('OUR_ADMIN'), UserController.toggleActive);

// Rewards
router.get('/rewards', authenticate, RewardController.index);
router.post('/rewards/mark-paid/:id', authenticate, requireRoles('OUR_ADMIN'), RewardController.markPaid);

// Reports
router.get('/reports/completion', authenticate, requireRoles('CFC_ADMIN', 'OUR_ADMIN', 'CFC_MANAGER', 'OUR_MANAGER'), ReportController.completionReport);
router.get('/reports/rewards', authenticate, requireRoles('CFC_ADMIN', 'OUR_ADMIN', 'CFC_MANAGER', 'OUR_MANAGER'), ReportController.rewardReport);
router.get('/attendance', authenticate, requireRoles('OUR_ADMIN', 'OUR_MANAGER', 'CFC_ADMIN'), ReportController.attendanceReport);

module.exports = router;
