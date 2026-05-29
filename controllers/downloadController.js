const path = require('path');
const fs   = require('fs');
const multer = require('multer');
const Download = require('../models/Download');
const GoogleDriveService = require('../services/googleDriveService');

const UPLOADS_DIR = path.join(__dirname, '../uploads/downloads');

// ── Multer: disk storage, 500 MB ─────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => {
    const unique = Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    cb(null, `dl_${unique}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

const CAN_UPLOAD = ['LOCAL_ADMIN', 'LOCAL_MANAGER', 'CLIENT_ADMIN'];

// ── Background Drive upload (fire-and-forget after response) ─────────
async function uploadToDriveInBackground(downloadId, filePath, originalName, mimeType) {
  try {
    const driveFile = await GoogleDriveService.uploadDownloadFile(filePath, originalName, mimeType);
    await Download.updateDriveId(downloadId, driveFile.id);
    console.log(`[Downloads] Drive upload complete: ${originalName} (id=${downloadId})`);
  } catch (err) {
    console.error(`[Downloads] Drive upload failed for id=${downloadId}:`, err.message);
    // Local file stays on disk — cron retry will pick it up
  }
}

class DownloadController {

  static get uploadMiddleware() {
    return upload.single('file');
  }

  // ── GET /downloads (public, no auth) ────────────────────────────────
  static async publicIndex(req, res) {
    const files = await Download.getPublicFiles();
    res.render('public/downloads', {
      layout: false,
      title:  'Downloads',
      files,
    });
  }

  // ── GET /downloads/:id/download (public, no auth) ────────────────────
  static async publicServe(req, res) {
    const file = await Download.getPublicById(req.params.id);
    if (!file) return res.status(404).send('File not found or not publicly available.');

    await Download.incrementDownload(file.id);

    if (file.stored_name) {
      const localPath = path.join(UPLOADS_DIR, file.stored_name);
      if (fs.existsSync(localPath)) {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
        return res.sendFile(localPath);
      }
    }

    if (file.drive_file_id) {
      try {
        const { stream, mimeType } = await GoogleDriveService.downloadFile(file.drive_file_id);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
        res.setHeader('Content-Type', mimeType || file.mime_type || 'application/octet-stream');
        return stream.pipe(res);
      } catch (err) {
        console.error('[Downloads] Public Drive serve error:', err.message);
        return res.status(500).send('Could not retrieve file.');
      }
    }

    res.status(404).send('File not available.');
  }

  // ── GET /admin/downloads ─────────────────────────────────────────────
  static async index(req, res) {
    const role  = req.user.role_name;
    const files = await Download.getAll(req.query.search || '');
    res.render('admin/downloads', {
      title:    'Downloads',
      layout:   'admin/layout',
      section:  'downloads',
      files,
      search:   req.query.search || '',
      canUpload:        CAN_UPLOAD.includes(role),
      isAdmin:          role === 'LOCAL_ADMIN',
      canTogglePublic:  ['LOCAL_ADMIN', 'LOCAL_MANAGER'].includes(role),
      userId:   req.user.id,
    });
  }

  // ── GET /admin/downloads/upload ──────────────────────────────────────
  static async uploadPage(req, res) {
    if (!CAN_UPLOAD.includes(req.user.role_name)) {
      return res.status(403).render('error', { message: 'Access denied' });
    }
    res.render('admin/downloads-upload', {
      title:   'Upload File',
      layout:  'admin/layout',
      section: 'downloads',
    });
  }

  // ── POST /admin/downloads/upload ─────────────────────────────────────
  static async handleUpload(req, res) {
    if (!CAN_UPLOAD.includes(req.user.role_name)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file attached' });
    }
    const name = (req.body.name || '').trim();
    if (!name) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const side = req.user.role_name.startsWith('LOCAL') ? 'LOCAL' : 'CLIENT';
    const downloadId = await Download.create({
      name,
      description:   (req.body.description || '').trim() || null,
      version:       (req.body.version || '').trim() || null,
      original_name: req.file.originalname,
      stored_name:   req.file.filename,
      file_size:     req.file.size,
      mime_type:     req.file.mimetype || 'application/octet-stream',
      uploaded_by:   req.user.id,
      uploader_name: req.user.name,
      uploader_side: side,
      is_public:     req.body.is_public === '1',
    });

    // Respond immediately — file is already on disk and downloadable
    res.json({ success: true });

    // Upload to Drive in background (non-blocking)
    setImmediate(() => uploadToDriveInBackground(
      downloadId, req.file.path, req.file.originalname,
      req.file.mimetype || 'application/octet-stream'
    ));
  }

  // ── GET /admin/downloads/:id/download ────────────────────────────────
  static async serveFile(req, res) {
    const file = await Download.getById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'Not found' });
    if (file.is_disabled && req.user.role_name !== 'LOCAL_ADMIN') {
      return res.status(403).json({ success: false, message: 'This file is disabled' });
    }

    await Download.incrementDownload(file.id);

    // Serve from local disk if available (fast path)
    if (file.stored_name) {
      const localPath = path.join(UPLOADS_DIR, file.stored_name);
      if (fs.existsSync(localPath)) {
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
        return res.sendFile(localPath);
      }
    }

    // Fall back to Google Drive
    if (file.drive_file_id) {
      try {
        const { stream, mimeType } = await GoogleDriveService.downloadFile(file.drive_file_id);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`);
        res.setHeader('Content-Type', mimeType || file.mime_type || 'application/octet-stream');
        return stream.pipe(res);
      } catch (err) {
        console.error('[Downloads] Drive serve error:', err.message);
        return res.status(500).json({ success: false, message: 'Could not retrieve file from Drive.' });
      }
    }

    res.status(404).json({ success: false, message: 'File not available.' });
  }

  // ── PUT /admin/downloads/:id ─────────────────────────────────────────
  static async update(req, res) {
    const file = await Download.getById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'Not found' });
    if (req.user.role_name !== 'LOCAL_ADMIN' && file.uploaded_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
    await Download.update(file.id, {
      name,
      description: (req.body.description || '').trim(),
      version:     (req.body.version || '').trim(),
    });
    res.json({ success: true });
  }

  // ── DELETE /admin/downloads/:id ──────────────────────────────────────
  static async remove(req, res) {
    const file = await Download.getById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'Not found' });
    if (req.user.role_name !== 'LOCAL_ADMIN' && file.uploaded_by !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const record = await Download.delete(file.id);
    if (record) {
      if (record.stored_name) {
        fs.unlink(path.join(UPLOADS_DIR, record.stored_name), () => {});
      }
      if (record.drive_file_id) {
        try { await GoogleDriveService.deleteFile(record.drive_file_id); } catch (e) {}
      }
    }
    res.json({ success: true });
  }

  // ── PATCH /admin/downloads/:id/toggle ───────────────────────────────
  static async toggle(req, res) {
    if (req.user.role_name !== 'LOCAL_ADMIN') {
      return res.status(403).json({ success: false, message: 'Admin only' });
    }
    const file = await Download.getById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'Not found' });
    const newState = await Download.toggleDisabled(file.id);
    res.json({ success: true, is_disabled: newState });
  }

  // ── PATCH /admin/downloads/:id/toggle-public ─────────────────────────
  static async togglePublic(req, res) {
    if (!['LOCAL_ADMIN', 'LOCAL_MANAGER'].includes(req.user.role_name)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const file = await Download.getById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'Not found' });
    const newState = await Download.togglePublic(file.id);
    res.json({ success: true, is_public: newState });
  }
}

module.exports = DownloadController;
