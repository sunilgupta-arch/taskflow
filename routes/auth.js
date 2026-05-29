const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const authenticate = require('../middleware/authenticate');
const botDetect = require('../middleware/botDetect');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  keyGenerator: (req) => ipKeyGenerator(req),
  handler: (req, res) => {
    const logger = require('../utils/logger');
    logger.warn('[SECURITY] Login rate limit exceeded', {
      ip: req.ip,
      email: req.body?.email || '(unknown)',
      ua: req.headers['user-agent'] || '(none)',
    });
    res.status(429).json({
      success: false,
      message: 'Too many login attempts. Please try again in 15 minutes.'
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/login', AuthController.showLogin);
router.post('/login', loginLimiter, botDetect, AuthController.login);
router.get('/google', AuthController.googleAuth);
router.get('/google/callback', AuthController.googleCallback);
router.get('/logout', authenticate, AuthController.logout);
router.post('/logout', authenticate, AuthController.logout);
// No authenticate — this is the escape hatch when the token itself is the problem
router.get('/clear-session', (req, res) => {
  res.clearCookie('token');
  res.clearCookie('tf-token');
  res.redirect('/auth/login');
});
router.get('/profile', authenticate, AuthController.getProfile);
router.get('/check-late', authenticate, AuthController.checkLateLogin);
router.post('/late-reason', authenticate, AuthController.submitLateReason);

module.exports = router;
