class AdminHubController {
  static async dashboard(req, res) {
    res.render('admin/dashboard', { title: 'Admin Hub', layout: 'admin/layout', section: 'dashboard' });
  }
  static async work(req, res) {
    res.render('admin/work', { title: 'Work', layout: 'admin/layout', section: 'work' });
  }
  static async team(req, res) {
    res.render('admin/team', { title: 'Team', layout: 'admin/layout', section: 'team' });
  }
  static async reports(req, res) {
    res.render('admin/reports', { title: 'Reports', layout: 'admin/layout', section: 'reports' });
  }
  static async comms(req, res) {
    res.render('admin/comms', { title: 'Communications', layout: 'admin/layout', section: 'comms' });
  }
  static async tools(req, res) {
    res.render('admin/tools', { title: 'Tools', layout: 'admin/layout', section: 'tools' });
  }
}

module.exports = AdminHubController;
