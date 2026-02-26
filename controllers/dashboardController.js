const DashboardService = require('../services/dashboardService');
const { ROLES } = require('../config/constants');

class DashboardController {
  static async show(req, res) {
    try {
      const role = req.user.role_name;
      let data = {};

      if (['CFC_ADMIN', 'OUR_ADMIN', 'CFC_MANAGER', 'OUR_MANAGER'].includes(role)) {
        data = await DashboardService.getAdminDashboard();
      } else {
        data = await DashboardService.getUserDashboard(req.user.id);
      }

      res.render('dashboard/index', {
        title: 'Dashboard - TaskFlow',
        ...data,
        role
      });
    } catch (err) {
      console.error('Dashboard error:', err);
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }
}

module.exports = DashboardController;
