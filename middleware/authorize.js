const { PERMISSIONS } = require('../config/constants');

// Safe home page for each role family — guaranteed accessible to all roles in that family
function safeHome(role) {
  if (!role) return '/auth/login';
  if (role.startsWith('CLIENT_')) return '/portal';
  return '/admin'; // /admin uses requireLocalAll — accessible to every LOCAL_* role
}

const authorize = (...permissions) => {
  return (req, res, next) => {
    const userRole = req.user?.role_name;
    if (!userRole) {
      if (req.xhr || req.path.startsWith('/api/')) return res.status(403).json({ success: false, message: 'Access denied' });
      return res.redirect('/auth/login');
    }

    const userPermissions = PERMISSIONS[userRole] || [];
    const hasPermission = permissions.some(p => userPermissions.includes(p));

    if (!hasPermission) {
      if (req.xhr || req.path.startsWith('/api/')) {
        return res.status(403).json({ success: false, message: 'Insufficient permissions' });
      }
      return res.redirect(safeHome(userRole));
    }

    next();
  };
};

const requireRoles = (...roles) => {
  return (req, res, next) => {
    const userRole = req.user?.role_name;
    if (!roles.includes(userRole)) {
      if (req.xhr || req.path.startsWith('/api/')) {
        return res.status(403).json({ success: false, message: 'Role not authorized' });
      }
      return res.redirect(safeHome(userRole));
    }
    next();
  };
};

const requireOrgType = (...orgTypes) => {
  return (req, res, next) => {
    const orgType = req.user?.organization_type;
    if (!orgTypes.includes(orgType)) {
      return res.status(403).json({ success: false, message: 'Organization not authorized' });
    }
    next();
  };
};

module.exports = { authorize, requireRoles, requireOrgType };
