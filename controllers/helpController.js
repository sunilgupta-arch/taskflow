class HelpController {
  static async index(req, res) {
    const topic = req.query.topic || null;
    const role = req.user.role_name;
    const isAdmin = ['LOCAL_ADMIN', 'CLIENT_ADMIN'].includes(role);
    const isManager = ['LOCAL_MANAGER', 'CLIENT_MANAGER'].includes(role);
    const isUser = role === 'LOCAL_USER';
    res.render('help/index', {
      title: 'Help & Training',
      activeTopic: topic,
      role,
      isAdmin,
      isManager,
      isUser
    });
  }
}

module.exports = HelpController;
