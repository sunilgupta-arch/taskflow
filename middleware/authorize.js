const { PERMISSIONS } = require('../config/constants');

const authorize = (...permissions) => {
  return (req, res, next) => {
    const userRole = req.user?.role_name;
    if (!userRole) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const userPermissions = PERMISSIONS[userRole] || [];
    const hasPermission = permissions.some(p => userPermissions.includes(p));

    if (!hasPermission) {
      if (req.xhr || req.path.startsWith('/api/')) {
        return res.status(403).json({ success: false, message: 'Insufficient permissions' });
      }
      return res.status(403).render('error', {
        title: 'Access Denied',
        message: 'You do not have permission to access this page.',
        code: 403,
        layout: false
      });
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
      return res.status(403).render('error', {
        title: 'Access Denied',
        message: 'Your role does not have access to this resource.',
        code: 403,
        layout: false
      });
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
