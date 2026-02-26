const jwt = require('jsonwebtoken');
const db = require('../config/db');

const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      if (req.xhr || req.path.startsWith('/api/')) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      return res.redirect('/auth/login');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const [users] = await db.query(
      `SELECT u.*, r.name as role_name, r.organization_type, o.name as org_name, o.org_type
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       JOIN organizations o ON u.organization_id = o.id
       WHERE u.id = ? AND u.is_active = 1`,
      [decoded.id]
    );

    if (!users.length) {
      if (req.xhr || req.path.startsWith('/api/')) {
        return res.status(401).json({ success: false, message: 'User not found or inactive' });
      }
      res.clearCookie('token');
      return res.redirect('/auth/login');
    }

    req.user = users[0];
    res.locals.user = users[0];
    next();
  } catch (err) {
    if (req.xhr || req.path.startsWith('/api/')) {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
    res.clearCookie('token');
    return res.redirect('/auth/login');
  }
};

module.exports = authenticate;
