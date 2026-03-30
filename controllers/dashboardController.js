const DashboardService = require('../services/dashboardService');
const { ROLES } = require('../config/constants');
const { getEffectiveWorkDate } = require('../utils/timezone');

class DashboardController {
  static async show(req, res) {
    try {
      const role = req.user.role_name;
      let data = {};

      const tz = req.user.org_timezone || 'UTC';
      if (['CLIENT_ADMIN', 'LOCAL_ADMIN', 'CLIENT_MANAGER', 'LOCAL_MANAGER'].includes(role)) {
        data = await DashboardService.getAdminDashboard(req.user.organization_type, tz);
      } else {
        const workDate = getEffectiveWorkDate(tz, req.user.shift_start, req.user.shift_hours);
        data = await DashboardService.getUserDashboard(req.user.id, req.query.date || null, tz, workDate);
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
