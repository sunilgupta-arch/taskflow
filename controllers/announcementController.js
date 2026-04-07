const db = require('../config/db');
const { ApiResponse } = require('../utils/response');

class AnnouncementController {
  // GET /announcements — full page
  static async index(req, res) {
    try {
      const orgType = req.user.organization_type;
      const role = req.user.role_name;

      // LOCAL team sees: audience='local' OR audience='all'
      // CLIENT team sees: audience='client' OR audience='all'
      const audienceFilter = orgType === 'LOCAL'
        ? "a.audience IN ('local', 'all')"
        : "a.audience IN ('client', 'all')";

      const [posts] = await db.query(
        `SELECT a.*, u.name as author_name, r.name as author_role, u.organization_id as author_org_id
         FROM announcements a
         JOIN users u ON a.created_by = u.id
         JOIN roles r ON u.role_id = r.id
         WHERE ${audienceFilter}
         ORDER BY a.is_pinned DESC, a.created_at DESC`
      );

      const canPost = ['LOCAL_ADMIN', 'CLIENT_ADMIN', 'CLIENT_MANAGER'].includes(role);
      const canManage = ['LOCAL_ADMIN', 'CLIENT_ADMIN'].includes(role);

      res.render('announcements/index', {
        title: 'Info Board',
        posts,
        canPost,
        canManage,
        orgType,
        role,
        userOrgId: req.user.organization_id
      });
    } catch (err) {
      res.status(500).render('error', { title: 'Error', message: err.message, code: 500, layout: false });
    }
  }

  // POST /announcements — create new post
  static async create(req, res) {
    try {
      const { title, body, is_pinned, audience } = req.body;
      if (!title || !title.trim()) {
        return ApiResponse.error(res, 'Title is required', 400);
      }

      const orgType = req.user.organization_type;
      // Determine valid audience: LOCAL_ADMIN can post to 'local', CLIENT can post to 'client' or 'all'
      let effectiveAudience;
      if (orgType === 'CLIENT') {
        effectiveAudience = audience === 'all' ? 'all' : 'client';
      } else {
        effectiveAudience = 'local';
      }

      await db.query(
        'INSERT INTO announcements (title, body, is_pinned, audience, created_by) VALUES (?, ?, ?, ?, ?)',
        [title.trim(), body?.trim() || null, is_pinned ? 1 : 0, effectiveAudience, req.user.id]
      );

      return ApiResponse.success(res, {}, 'Post published');
    } catch (err) {
      return ApiResponse.error(res, 'Failed to create post');
    }
  }

  // PUT /announcements/:id/pin — toggle pin (own org posts only)
  static async togglePin(req, res) {
    try {
      const [[post]] = await db.query(
        'SELECT a.id, u.organization_id FROM announcements a JOIN users u ON a.created_by = u.id WHERE a.id = ?',
        [req.params.id]
      );
      if (!post) return ApiResponse.error(res, 'Post not found', 404);
      if (post.organization_id !== req.user.organization_id) {
        return ApiResponse.error(res, 'Cannot modify another organization\'s post', 403);
      }
      await db.query('UPDATE announcements SET is_pinned = NOT is_pinned WHERE id = ?', [req.params.id]);
      return ApiResponse.success(res, {}, 'Pin toggled');
    } catch (err) {
      return ApiResponse.error(res, 'Failed to toggle pin');
    }
  }

  // DELETE /announcements/:id — delete post (own org posts only)
  static async destroy(req, res) {
    try {
      const [[post]] = await db.query(
        'SELECT a.id, u.organization_id FROM announcements a JOIN users u ON a.created_by = u.id WHERE a.id = ?',
        [req.params.id]
      );
      if (!post) return ApiResponse.error(res, 'Post not found', 404);
      if (post.organization_id !== req.user.organization_id) {
        return ApiResponse.error(res, 'Cannot delete another organization\'s post', 403);
      }
      await db.query('DELETE FROM announcements WHERE id = ?', [req.params.id]);
      return ApiResponse.success(res, {}, 'Post deleted');
    } catch (err) {
      return ApiResponse.error(res, 'Failed to delete post');
    }
  }
}

module.exports = AnnouncementController;
