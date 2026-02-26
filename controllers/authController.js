const AuthService = require('../services/authService');
const { ApiResponse } = require('../utils/response');

class AuthController {
  static showLogin(req, res) {
    if (req.cookies?.token) return res.redirect('/dashboard');
    res.render('auth/login', { title: 'Login - TaskFlow', layout: false });
  }

  static async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email and password are required' });
      }

      const { token, user } = await AuthService.login(email, password);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      return ApiResponse.success(res, { user, redirectUrl: '/dashboard' }, 'Login successful');
    } catch (err) {
      return res.status(401).json({ success: false, message: err.message });
    }
  }

  static async logout(req, res) {
    try {
      if (req.user?.id) {
        await AuthService.recordLogout(req.user.id);
      }
    } catch (e) {}
    
    res.clearCookie('token');
    res.redirect('/auth/login');
  }

  static getProfile(req, res) {
    return ApiResponse.success(res, { user: req.user });
  }
}

module.exports = AuthController;
