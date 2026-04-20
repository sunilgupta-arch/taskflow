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
      `SELECT u.*, r.name as role_name, r.organization_type, o.name as org_name, o.org_type, o.timezone as org_timezone
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

    // Block CLIENT users from accessing local-side routes
    if (users[0].role_name.startsWith('CLIENT_')) {
      const url = req.originalUrl;
      if (!url.startsWith('/portal') && !url.startsWith('/auth') && !url.startsWith('/uploads')) {
        if (req.xhr || req.headers['x-requested-with']) {
          return res.status(403).json({ success: false, message: 'Access denied' });
        }
        return res.redirect('/portal');
      }
    }

    // Fetch the "other" org timezone (CLIENT for LOCAL users, LOCAL for CLIENT users)
    const otherOrgType = users[0].org_type === 'LOCAL' ? 'CLIENT' : 'LOCAL';
    const [otherOrgs] = await db.query(
      'SELECT timezone FROM organizations WHERE org_type = ? LIMIT 1',
      [otherOrgType]
    );
    res.locals.otherOrgTimezone = otherOrgs.length ? otherOrgs[0].timezone : users[0].org_timezone;
    res.locals.otherOrgType = otherOrgType;

    // Load latest announcements for banner (max 4, pinned first, filtered by audience)
    const isLocalOrg = users[0].org_type === 'LOCAL';
    const audienceFilter = isLocalOrg ? "a.audience IN ('local', 'all')" : "a.audience IN ('client', 'all')";
    const showBanner = ['LOCAL_ADMIN', 'LOCAL_MANAGER', 'LOCAL_USER', 'CLIENT_ADMIN', 'CLIENT_MANAGER'].includes(users[0].role_name);
    if (showBanner) {
      try {
        const [announcements] = await db.query(
          `SELECT a.id, a.title, a.body, a.is_pinned, a.audience, a.created_at, u.name as author_name
           FROM announcements a JOIN users u ON a.created_by = u.id
           WHERE ${audienceFilter}
           ORDER BY a.is_pinned DESC, a.created_at DESC LIMIT 4`
        );
        res.locals.announcements = announcements;
      } catch (e) {
        res.locals.announcements = [];
      }
    } else {
      res.locals.announcements = [];
    }

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
