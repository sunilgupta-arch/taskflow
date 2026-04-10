const db = require('../../config/db');

let cachedLocalAdmin = null;

const portalOnly = async (req, res, next) => {
  const role = req.user?.role_name;
  if (!role || !role.startsWith('CLIENT_')) {
    if (req.xhr || req.path.startsWith('/api/')) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    return res.status(403).render('error', {
      title: 'Access Denied',
      message: 'You do not have access to the Client Portal.',
      code: 403,
      layout: false
    });
  }

  // Cache local admin info for all portal views
  if (!cachedLocalAdmin) {
    try {
      const [admins] = await db.query(
        `SELECT u.id, u.name FROM users u JOIN roles r ON u.role_id = r.id
         WHERE r.name = 'LOCAL_ADMIN' AND u.is_active = 1 LIMIT 1`
      );
      cachedLocalAdmin = admins[0] || null;
    } catch (_) {}
  }
  res.locals.localAdmin = cachedLocalAdmin;

  next();
};

module.exports = portalOnly;
