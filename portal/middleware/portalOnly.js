const db = require('../../config/db');

let cachedLocalAdmin = null;
let cachedDelegate = null;
let delegateFetched = false;

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

  // Cache delegated support user
  if (!delegateFetched) {
    try {
      const [[org]] = await db.query("SELECT delegated_support_id FROM organizations WHERE org_type = 'LOCAL' LIMIT 1");
      if (org && org.delegated_support_id) {
        const [users] = await db.query("SELECT id, name FROM users WHERE id = ? AND is_active = 1", [org.delegated_support_id]);
        cachedDelegate = users[0] || null;
      }
      delegateFetched = true;
    } catch (_) {}
  }
  res.locals.delegateSupport = cachedDelegate;

  next();
};

// Called when admin updates the delegate
portalOnly.clearDelegateCache = function() {
  cachedDelegate = null;
  delegateFetched = false;
};

module.exports = portalOnly;
