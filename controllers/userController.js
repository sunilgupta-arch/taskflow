const UserModel = require('../models/User');
const { ApiResponse, getPaginationMeta } = require('../utils/response');
const db = require('../config/db');

class UserController {
  static async index(req, res) {
    try {
      const { page = 1, limit = 20, org_type, role_id, search } = req.query;
      const { rows, total } = await UserModel.getAll({ org_type, role_id, search, page, limit });
      const [roles] = await db.query('SELECT * FROM roles');
      const [orgs] = await db.query('SELECT * FROM organizations');

      res.render('users/index', {
        title: 'User Management',
        users: rows,
        roles,
        orgs,
        pagination: getPaginationMeta(total, page, limit),
        filters: { org_type, role_id, search }
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  static async create(req, res) {
    try {
      const userId = await UserModel.create(req.body);
      const user = await UserModel.findById(userId);
      return ApiResponse.success(res, user, 'User created successfully', 201);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return ApiResponse.error(res, 'Email already exists', 409);
      }
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async update(req, res) {
    try {
      await UserModel.update(req.params.id, req.body);
      const user = await UserModel.findById(req.params.id);
      return ApiResponse.success(res, user, 'User updated successfully');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async toggleActive(req, res) {
    try {
      const user = await UserModel.findById(req.params.id);
      if (!user) return ApiResponse.error(res, 'User not found', 404);
      await UserModel.update(req.params.id, { is_active: user.is_active ? 0 : 1 });
      return ApiResponse.success(res, {}, `User ${user.is_active ? 'deactivated' : 'activated'}`);
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async resetPassword(req, res) {
    try {
      const { password } = req.body;
      if (!password || password.length < 6) {
        return ApiResponse.error(res, 'Password must be at least 6 characters', 400);
      }
      const user = await UserModel.findById(req.params.id);
      if (!user) return ApiResponse.error(res, 'User not found', 404);
      await UserModel.update(req.params.id, { password });
      return ApiResponse.success(res, {}, 'Password reset successfully');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  static async updateLeave(req, res) {
    try {
      const { user_id, leave_status } = req.body;
      await UserModel.update(user_id, { leave_status });
      return ApiResponse.success(res, {}, 'Leave status updated');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }
}

module.exports = UserController;
