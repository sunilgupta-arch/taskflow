const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');

router.get('/login', AuthController.showLogin);
router.post('/login', AuthController.login);
router.get('/logout', authenticate, AuthController.logout);
router.get('/profile', authenticate, AuthController.getProfile);

module.exports = router;
