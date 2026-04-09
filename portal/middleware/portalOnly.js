const portalOnly = (req, res, next) => {
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
  next();
};

module.exports = portalOnly;
