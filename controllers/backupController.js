const backupService = require('../services/backupService');

class BackupController {
  /**
   * GET /backups — Show backup management page.
   */
  static async index(req, res) {
    try {
      const page = parseInt(req.query.page) || 1;
      const { rows: backups, total } = await backupService.getBackupLogs(page, 20);
      const settings = await backupService.getSettings();

      res.render('backup/index', {
        title: 'Database Backups',
        backups,
        settings,
        pagination: {
          page,
          total,
          totalPages: Math.ceil(total / 20),
          limit: 20
        }
      });
    } catch (err) {
      console.error('Backup index error:', err);
      res.status(500).render('error', { title: 'Error', message: 'Failed to load backups', code: 500, layout: false });
    }
  }

  /**
   * POST /backups/create — Create a manual backup.
   */
  static async create(req, res) {
    try {
      const result = await backupService.createBackup(req.user.id, 'manual');
      res.json({ success: true, message: 'Backup created successfully', data: result });
    } catch (err) {
      console.error('Backup create error:', err);
      res.status(500).json({ success: false, message: `Backup failed: ${err.message}` });
    }
  }

  /**
   * POST /backups/restore/:id — Restore from a backup.
   */
  static async restore(req, res) {
    try {
      const result = await backupService.restoreBackup(req.params.id, req.user.id);
      res.json({ success: true, message: `Database restored from ${result.filename}` });
    } catch (err) {
      console.error('Backup restore error:', err);
      res.status(500).json({ success: false, message: `Restore failed: ${err.message}` });
    }
  }

  /**
   * POST /backups/settings — Update backup schedule.
   */
  static async updateSettings(req, res) {
    try {
      const { scheduled_time, max_backups } = req.body;
      await backupService.updateSettings(scheduled_time, max_backups, req.user.id);
      res.json({ success: true, message: scheduled_time ? `Daily backup scheduled at ${scheduled_time}` : 'Scheduled backup disabled' });
    } catch (err) {
      console.error('Backup settings error:', err);
      res.status(500).json({ success: false, message: `Failed to update settings: ${err.message}` });
    }
  }

  /**
   * DELETE /backups/:id — Delete a backup.
   */
  static async destroy(req, res) {
    try {
      await backupService.deleteBackup(req.params.id);
      res.json({ success: true, message: 'Backup deleted' });
    } catch (err) {
      console.error('Backup delete error:', err);
      res.status(500).json({ success: false, message: `Delete failed: ${err.message}` });
    }
  }

  /**
   * POST /backups/upload-restore — Upload a .sql file and restore from it.
   */
  static async uploadRestore(req, res) {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
      if (!req.file.originalname.endsWith('.sql')) {
        return res.status(400).json({ success: false, message: 'Only .sql files are allowed' });
      }

      const result = await backupService.restoreFromFile(req.file.path, req.file.originalname, req.user.id);
      res.json({ success: true, message: `Database restored from uploaded file: ${req.file.originalname}` });
    } catch (err) {
      console.error('Upload restore error:', err);
      res.status(500).json({ success: false, message: `Restore failed: ${err.message}` });
    }
  }

  /**
   * GET /backups/download/:id — Download a backup file.
   */
  static async download(req, res) {
    try {
      const db = require('../config/db');
      const [[backup]] = await db.query('SELECT * FROM backup_logs WHERE id = ?', [req.params.id]);
      if (!backup) return res.status(404).json({ success: false, message: 'Backup not found' });

      const path = require('path');
      const filePath = path.join(backupService.BACKUP_DIR, backup.filename);
      const fs = require('fs');
      if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Backup file not found on disk' });

      res.download(filePath, backup.filename);
    } catch (err) {
      console.error('Backup download error:', err);
      res.status(500).json({ success: false, message: 'Download failed' });
    }
  }
}

module.exports = BackupController;
