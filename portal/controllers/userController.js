const db = require('../../config/db');
const UserModel = require('../../models/User');
const { ApiResponse } = require('../../utils/response');

class PortalUserController {

  // Render users page (admin only)
  static async index(req, res) {
    try {
      const [roles] = await db.query("SELECT * FROM roles WHERE name IN ('CLIENT_MANAGER', 'CLIENT_USER')");
      const [orgs] = await db.query("SELECT * FROM organizations WHERE org_type = 'CLIENT'");
      res.render('portal/users', {
        title: 'Team - Client Portal',
        layout: 'portal/layout',
        section: 'users',
        roles,
        clientOrg: orgs[0] || null
      });
    } catch (err) {
      console.error('Portal users index error:', err);
      res.status(500).render('error', { title: 'Error', message: 'Failed to load users', code: 500, layout: false });
    }
  }

  // List client users (API)
  static async list(req, res) {
    try {
      const [users] = await db.query(
        `SELECT u.id, u.name, u.email, u.is_active, u.created_at,
                r.name as role_name, r.id as role_id
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE r.name IN ('CLIENT_ADMIN', 'CLIENT_MANAGER', 'CLIENT_USER')
           AND u.email != 'system@taskflow.local'
         ORDER BY FIELD(r.name, 'CLIENT_ADMIN', 'CLIENT_MANAGER', 'CLIENT_USER'), u.name`
      );
      return ApiResponse.success(res, { users });
    } catch (err) {
      return ApiResponse.error(res, 'Failed to load users');
    }
  }

  // Create user
  static async create(req, res) {
    try {
      const { name, email, password, role_id } = req.body;

      if (!name || !email || !password) {
        return ApiResponse.error(res, 'Name, email, and password are required', 400);
      }
      if (password.length < 6) {
        return ApiResponse.error(res, 'Password must be at least 6 characters', 400);
      }

      // Ensure role is CLIENT_MANAGER or CLIENT_USER only
      const [[role]] = await db.query('SELECT name FROM roles WHERE id = ?', [role_id]);
      if (!role || !['CLIENT_MANAGER', 'CLIENT_USER'].includes(role.name)) {
        return ApiResponse.error(res, 'Invalid role selected', 400);
      }

      // Get client org
      const [[clientOrg]] = await db.query("SELECT id FROM organizations WHERE org_type = 'CLIENT' LIMIT 1");
      if (!clientOrg) return ApiResponse.error(res, 'Client organization not found', 500);

      const userId = await UserModel.create({
        organization_id: clientOrg.id,
        role_id,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        changed_by: req.user.id
      });

      const user = await UserModel.findById(userId);
      return ApiResponse.success(res, { user }, 'User created successfully', 201);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return ApiResponse.error(res, 'Email already exists', 409);
      }
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // Update user
  static async update(req, res) {
    try {
      const userId = parseInt(req.params.id);
      const existing = await UserModel.findById(userId);
      if (!existing || !existing.role_name.startsWith('CLIENT_')) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      // Cannot edit another CLIENT_ADMIN
      if (existing.role_name === 'CLIENT_ADMIN' && existing.id !== req.user.id) {
        return ApiResponse.error(res, 'Cannot edit another admin', 403);
      }

      const { name, email, role_id, is_active } = req.body;
      const updates = { changed_by: req.user.id };
      if (name) updates.name = name.trim();
      if (email) updates.email = email.trim().toLowerCase();
      if (role_id) {
        const [[role]] = await db.query('SELECT name FROM roles WHERE id = ?', [role_id]);
        if (role && ['CLIENT_MANAGER', 'CLIENT_USER'].includes(role.name)) {
          updates.role_id = role_id;
        }
      }
      if (is_active !== undefined) updates.is_active = is_active;

      await UserModel.update(userId, updates);
      const user = await UserModel.findById(userId);
      return ApiResponse.success(res, { user }, 'User updated');
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return ApiResponse.error(res, 'Email already exists', 409);
      }
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // Reset password
  static async resetPassword(req, res) {
    try {
      const userId = parseInt(req.params.id);
      const { password } = req.body;
      if (!password || password.length < 6) {
        return ApiResponse.error(res, 'Password must be at least 6 characters', 400);
      }

      const existing = await UserModel.findById(userId);
      if (!existing || !existing.role_name.startsWith('CLIENT_')) {
        return ApiResponse.error(res, 'User not found', 404);
      }

      await UserModel.update(userId, { password });
      return ApiResponse.success(res, {}, 'Password reset successfully');
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }

  // Toggle active
  static async toggleActive(req, res) {
    try {
      const userId = parseInt(req.params.id);
      const existing = await UserModel.findById(userId);
      if (!existing || !existing.role_name.startsWith('CLIENT_')) {
        return ApiResponse.error(res, 'User not found', 404);
      }
      if (existing.role_name === 'CLIENT_ADMIN') {
        return ApiResponse.error(res, 'Cannot deactivate admin', 403);
      }

      await UserModel.update(userId, { is_active: existing.is_active ? 0 : 1 });
      return ApiResponse.success(res, {}, `User ${existing.is_active ? 'deactivated' : 'activated'}`);
    } catch (err) {
      return ApiResponse.error(res, err.message, 400);
    }
  }
}

module.exports = PortalUserController;
