const RewardModel = require('../models/Reward');
const { ApiResponse, getPaginationMeta } = require('../utils/response');

class RewardController {
  static async index(req, res) {
    try {
      const { page = 1, limit = 20, status, user_id } = req.query;
      const role = req.user.role_name;

      // Non-admins see only their own rewards
      const isRegularUser = ['OUR_USER', 'OUR_MANAGER', 'CFC_MANAGER'].includes(role);
      const filterUserId = isRegularUser ? req.user.id : user_id;

      const { rows, total } = await RewardModel.getAll({ status, user_id: filterUserId, page, limit });
      let summary;
      if (isRegularUser) {
        const userSummary = await RewardModel.getUserSummary(req.user.id);
        summary = { total: userSummary.total_earned, pending: userSummary.pending_amount, paid: userSummary.paid_amount };
      } else {
        summary = await RewardModel.getGlobalSummary();
      }
      const perUser = !isRegularUser ? await RewardModel.getPerUserSummary() : null;

      res.render('rewards/index', {
        title: 'Reward Management',
        rewards: rows,
        summary,
        perUser,
        pagination: getPaginationMeta(total, page, limit),
        filters: { status, user_id: filterUserId },
        role
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  static async markPaid(req, res) {
    try {
      const success = await RewardModel.markPaid(req.params.id, req.user.id);
      if (!success) return ApiResponse.error(res, 'Reward not found or already paid', 400);
      return ApiResponse.success(res, {}, 'Reward marked as paid');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }
}

module.exports = RewardController;
