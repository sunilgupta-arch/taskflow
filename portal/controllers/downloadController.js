const path = require('path');
const fs   = require('fs');
const multer = require('multer');
const Download = require('../../models/Download');
const GoogleDriveService = require('../../services/googleDriveService');

const UPLOADS_DIR = path.join(__dirname, '../../uploads/downloads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename:    (req, file, cb) => {
    const unique = Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    cb(null, `dl_${unique}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 1024 * 1024 * 1024 } });

const CAN_UPLOAD = ['CLIENT_ADMIN'];

async function uploadToDriveInBackground(downloadId, filePath, originalName, mimeType) {
  try {
    const driveFile = await GoogleDriveService.uploadDownloadFile(filePath, originalName, mimeType);
    await Download.updateDriveId(downloadId, driveFile.id);
    console.log(`[Portal Downloads] Drive upload complete: ${originalName} (id=${downloadId})`);
  } catch (err) {
    console.error(`[Portal Downloads] Drive upload failed for id=${downloadId}:`, err.message);
  }
}

class PortalDownloadController {

  static get uploadMiddleware() {
    return upload.single('file');
  }

  static async index(req, res) {
    const role  = req.user.role_name;
    const files = await Download.getAll(req.query.search || '');
    res.render('portal/downloads', {
      title:    'Downloads',
      layout:   'portal/layout',
      section:  'downloads',
      files,
      search:   req.query.search || '',
      canUpload: CAN_UPLOAD.includes(role),
      isAdmin:  false,
      userId:   req.user.id,
    });
  }

  static async uploadPage(req, res) {
    if (!CAN_UPLOAD.includes(req.user.role_name)) {
      return res.redirect('/portal/downloads');
    }
    res.render('portal/downloads-upload', {
      title:   'Upload File',
      layout:  'portal/layout',
      section: 'downloads',
    });
  }

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
      uploader_side: 'CLIENT',
    });

    res.json({ success: true });

    setImmediate(() => uploadToDriveInBackground(
      downloadId, req.file.path, req.file.originalname,
      req.file.mimetype || 'application/octet-stream'
    ));
  }

  static async serveFile(req, res) {
    const file = await Download.getById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'Not found' });
    if (file.is_disabled) {
      return res.status(403).json({ success: false, message: 'This file is currently disabled' });
    }

    await Download.incrementDownload(file.id);

    // Serve from local disk if available
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
        console.error('[Portal Downloads] Drive serve error:', err.message);
        return res.status(500).json({ success: false, message: 'Could not retrieve file from Drive.' });
      }
    }

    res.status(404).json({ success: false, message: 'File not available.' });
  }

  static async update(req, res) {
    const file = await Download.getById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'Not found' });
    if (file.uploaded_by !== req.user.id) {
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

  static async remove(req, res) {
    const file = await Download.getById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'Not found' });
    if (file.uploaded_by !== req.user.id) {
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
}

module.exports = PortalDownloadController;
