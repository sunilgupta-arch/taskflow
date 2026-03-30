const GoogleDriveService = require('../services/googleDriveService');
const { ApiResponse } = require('../utils/response');

// Max upload sizes by role
const MAX_SIZE = {
  LOCAL_USER: 10 * 1024 * 1024,         // 10MB
  LOCAL_MANAGER: 100 * 1024 * 1024,      // 100MB
  LOCAL_ADMIN: 100 * 1024 * 1024,        // 100MB
  CLIENT_MANAGER: 100 * 1024 * 1024,     // 100MB
  CLIENT_ADMIN: 100 * 1024 * 1024        // 100MB
};

class DriveController {

  // GET /drive — render drive page
  static async index(req, res) {
    try {
      const folderId = await GoogleDriveService.getUserFolder(req.user);
      const subfolderId = req.query.folder || null;

      // Security: verify subfolder belongs to user's root
      if (subfolderId && subfolderId !== folderId) {
        const allowed = await GoogleDriveService.isInsideFolder(subfolderId, folderId);
        if (!allowed) {
          return res.status(403).render('error', { title: 'Access Denied', message: 'You do not have access to this folder', code: 403, layout: false });
        }
      }

      const currentFolderId = subfolderId || folderId;
      const files = await GoogleDriveService.listFiles(folderId, subfolderId);
      const breadcrumb = subfolderId ? await GoogleDriveService.getBreadcrumb(subfolderId, folderId) : [];
      const maxSize = MAX_SIZE[req.user.role_name] || 10 * 1024 * 1024;

      res.render('drive/index', {
        title: 'My Drive',
        files,
        rootFolderId: folderId,
        currentFolderId,
        breadcrumb,
        maxSizeMB: Math.round(maxSize / (1024 * 1024)),
        isRoot: !subfolderId || subfolderId === folderId
      });
    } catch (err) {
      console.error('Drive index error:', err);
      res.status(500).render('error', { title: 'Error', message: 'Failed to load Drive. Please try again.', code: 500, layout: false });
    }
  }

  // GET /drive/files — API: list files in folder
  static async listFiles(req, res) {
    try {
      const folderId = await GoogleDriveService.getUserFolder(req.user);
      const subfolderId = req.query.folder || null;

      if (subfolderId && subfolderId !== folderId) {
        const allowed = await GoogleDriveService.isInsideFolder(subfolderId, folderId);
        if (!allowed) return ApiResponse.error(res, 'Access denied', 403);
      }

      const files = await GoogleDriveService.listFiles(folderId, subfolderId);
      const breadcrumb = subfolderId ? await GoogleDriveService.getBreadcrumb(subfolderId, folderId) : [];

      return ApiResponse.success(res, { files, breadcrumb, currentFolderId: subfolderId || folderId });
    } catch (err) {
      console.error('Drive list error:', err);
      return ApiResponse.error(res, 'Failed to list files');
    }
  }

  // POST /drive/upload — upload file(s)
  static async upload(req, res) {
    try {
      const folderId = await GoogleDriveService.getUserFolder(req.user);
      const parentId = req.body.folder_id || folderId;
      const maxSize = MAX_SIZE[req.user.role_name] || 10 * 1024 * 1024;

      // Verify parent folder belongs to user
      if (parentId !== folderId) {
        const allowed = await GoogleDriveService.isInsideFolder(parentId, folderId);
        if (!allowed) return ApiResponse.error(res, 'Access denied', 403);
      }

      if (!req.files || req.files.length === 0) {
        return ApiResponse.error(res, 'No files selected', 400);
      }

      // Check sizes
      for (const file of req.files) {
        if (file.size > maxSize) {
          return ApiResponse.error(res, `File "${file.originalname}" exceeds ${Math.round(maxSize / (1024 * 1024))}MB limit`, 400);
        }
      }

      const uploaded = [];
      for (const file of req.files) {
        const result = await GoogleDriveService.uploadFile(parentId, file);
        uploaded.push(result);
      }

      return ApiResponse.success(res, { files: uploaded }, `${uploaded.length} file(s) uploaded`, 201);
    } catch (err) {
      console.error('Drive upload error:', err);
      return ApiResponse.error(res, 'Failed to upload files');
    }
  }

  // POST /drive/folder — create subfolder
  static async createFolder(req, res) {
    try {
      const folderId = await GoogleDriveService.getUserFolder(req.user);
      const parentId = req.body.parent_id || folderId;
      const name = req.body.name;

      if (!name || !name.trim()) {
        return ApiResponse.error(res, 'Folder name is required', 400);
      }

      if (parentId !== folderId) {
        const allowed = await GoogleDriveService.isInsideFolder(parentId, folderId);
        if (!allowed) return ApiResponse.error(res, 'Access denied', 403);
      }

      const folder = await GoogleDriveService.createFolder(parentId, name.trim());
      return ApiResponse.success(res, { folder }, 'Folder created', 201);
    } catch (err) {
      console.error('Drive create folder error:', err);
      return ApiResponse.error(res, 'Failed to create folder');
    }
  }

  // PUT /drive/rename/:fileId — rename file/folder
  static async rename(req, res) {
    try {
      const folderId = await GoogleDriveService.getUserFolder(req.user);
      const { fileId } = req.params;
      const { name } = req.body;

      if (!name || !name.trim()) {
        return ApiResponse.error(res, 'Name is required', 400);
      }

      const allowed = await GoogleDriveService.isInsideFolder(fileId, folderId);
      if (!allowed) return ApiResponse.error(res, 'Access denied', 403);

      const result = await GoogleDriveService.renameFile(fileId, name.trim());
      return ApiResponse.success(res, { file: result }, 'Renamed successfully');
    } catch (err) {
      console.error('Drive rename error:', err);
      return ApiResponse.error(res, 'Failed to rename');
    }
  }

  // DELETE /drive/:fileId — delete file/folder
  static async delete(req, res) {
    try {
      const folderId = await GoogleDriveService.getUserFolder(req.user);
      const { fileId } = req.params;

      const allowed = await GoogleDriveService.isInsideFolder(fileId, folderId);
      if (!allowed) return ApiResponse.error(res, 'Access denied', 403);

      await GoogleDriveService.deleteFile(fileId);
      return ApiResponse.success(res, {}, 'Deleted successfully');
    } catch (err) {
      console.error('Drive delete error:', err);
      return ApiResponse.error(res, 'Failed to delete');
    }
  }

  // GET /drive/download/:fileId — download file
  static async download(req, res) {
    try {
      const folderId = await GoogleDriveService.getUserFolder(req.user);
      const { fileId } = req.params;

      const allowed = await GoogleDriveService.isInsideFolder(fileId, folderId);
      if (!allowed) return ApiResponse.error(res, 'Access denied', 403);

      const { stream, name, mimeType } = await GoogleDriveService.downloadFile(fileId);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`);
      res.setHeader('Content-Type', mimeType);
      stream.pipe(res);
    } catch (err) {
      console.error('Drive download error:', err);
      return ApiResponse.error(res, 'Failed to download');
    }
  }
}

module.exports = DriveController;
