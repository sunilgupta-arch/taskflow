const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// Ensure backups directory exists
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

/**
 * Create a standalone connection with multipleStatements enabled (for restore).
 */
function createConnection(opts = {}) {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'taskflow_db',
    timezone: '+00:00',
    multipleStatements: true,
    ...opts
  });
}

/**
 * Generate a full SQL dump of the database (schema + data).
 */
async function createDump() {
  const conn = await createConnection();
  const dbName = process.env.DB_NAME || 'taskflow_db';
  const lines = [];

  lines.push(`-- TaskFlow Database Backup`);
  lines.push(`-- Generated: ${new Date().toISOString()}`);
  lines.push(`-- Database: ${dbName}`);
  lines.push('');
  lines.push('SET FOREIGN_KEY_CHECKS = 0;');
  lines.push('SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";');
  lines.push("SET time_zone = '+00:00';");
  lines.push('SET AUTOCOMMIT = 0;');
  lines.push('START TRANSACTION;');
  lines.push('');

  try {
    // Force UTC so TIMESTAMP columns are read/written as UTC (not server-local TZ)
    await conn.query("SET time_zone = '+00:00'");

    // Get all tables
    const [tables] = await conn.query('SHOW TABLES');
    const tableKey = `Tables_in_${dbName}`;
    const tableNames = tables.map(row => row[tableKey]);

    // Phase 1: Drop ALL tables first (avoids FK ordering issues)
    lines.push('-- --------------------------------------------------------');
    lines.push('-- Drop all tables');
    lines.push('-- --------------------------------------------------------');
    for (const tableName of tableNames) {
      lines.push(`DROP TABLE IF EXISTS \`${tableName}\`;`);
    }
    lines.push('');

    // Phase 2: Create tables + insert data
    for (const tableName of tableNames) {
      const [createResult] = await conn.query(`SHOW CREATE TABLE \`${tableName}\``);
      const createSQL = createResult[0]['Create Table'];

      lines.push(`-- --------------------------------------------------------`);
      lines.push(`-- Table: ${tableName}`);
      lines.push(`-- --------------------------------------------------------`);
      lines.push(createSQL + ';');
      lines.push('');

      // Data
      const [rows] = await conn.query(`SELECT * FROM \`${tableName}\``);
      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const colList = columns.map(c => `\`${c}\``).join(', ');

        // Batch inserts (500 rows per statement)
        for (let i = 0; i < rows.length; i += 500) {
          const batch = rows.slice(i, i + 500);
          const values = batch.map(r => {
            const vals = columns.map(c => {
              const v = r[c];
              if (v === null) return 'NULL';
              if (v instanceof Date) return `'${v.toISOString().slice(0, 19).replace('T', ' ')}'`;
              if (typeof v === 'number') return v;
              if (Buffer.isBuffer(v)) return `X'${v.toString('hex')}'`;
              if (typeof v === 'object') return `'${JSON.stringify(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
              return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
            });
            return `(${vals.join(', ')})`;
          });
          lines.push(`INSERT INTO \`${tableName}\` (${colList}) VALUES`);
          lines.push(values.join(',\n') + ';');
          lines.push('');
        }
      }
    }

    lines.push('SET FOREIGN_KEY_CHECKS = 1;');
    lines.push('COMMIT;');

    await conn.end();
    return lines.join('\n');
  } catch (err) {
    await conn.end();
    throw err;
  }
}

/**
 * Create a backup file and log it.
 */
async function createBackup(userId = null, type = 'manual') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `taskflow_backup_${timestamp}.sql`;
  const filePath = path.join(BACKUP_DIR, filename);

  try {
    const sql = await createDump();
    fs.writeFileSync(filePath, sql, 'utf8');
    const stats = fs.statSync(filePath);

    // Log to database
    await db.query(
      'INSERT INTO backup_logs (filename, file_size, type, status, created_by) VALUES (?, ?, ?, ?, ?)',
      [filename, stats.size, type, 'success', userId]
    );

    // Cleanup old backups
    await cleanupOldBackups();

    return { success: true, filename, size: stats.size };
  } catch (err) {
    // Log failure
    await db.query(
      'INSERT INTO backup_logs (filename, file_size, type, status, created_by, notes) VALUES (?, 0, ?, ?, ?, ?)',
      [filename, type, 'failed', userId, err.message]
    ).catch(() => {});

    throw err;
  }
}

/**
 * Restore from a backup file.
 */
async function restoreBackup(backupId, userId) {
  // Get backup record
  const [[backup]] = await db.query('SELECT * FROM backup_logs WHERE id = ?', [backupId]);
  if (!backup) throw new Error('Backup not found');

  const filePath = path.join(BACKUP_DIR, backup.filename);
  if (!fs.existsSync(filePath)) throw new Error('Backup file not found on disk');

  // Mark as restoring
  await db.query('UPDATE backup_logs SET status = ? WHERE id = ?', ['restoring', backupId]);

  const conn = await createConnection();

  try {
    let sql = fs.readFileSync(filePath, 'utf8');
    // Fix corrupted JSON columns from old backups
    sql = sql.replace(/'?\[object Object\]'?/g, "'{}'");
    await conn.query(sql);
    await conn.end();

    // Re-connect to pool (tables were recreated) and update status
    // We need a fresh connection since tables were dropped/recreated
    const freshConn = await createConnection();
    await freshConn.query("SET time_zone = '+00:00'");
    await freshConn.query('UPDATE backup_logs SET status = ? WHERE id = ?', ['restored', backupId]);
    await freshConn.end();

    return { success: true, filename: backup.filename };
  } catch (err) {
    try {
      await conn.end();
      const freshConn = await createConnection();
      await freshConn.query("SET time_zone = '+00:00'");
      await freshConn.query('UPDATE backup_logs SET status = ?, notes = ? WHERE id = ?', ['failed', `Restore failed: ${err.message}`, backupId]);
      await freshConn.end();
    } catch (_) {}
    throw err;
  }
}

/**
 * Get backup settings.
 */
async function getSettings() {
  const [[settings]] = await db.query('SELECT * FROM backup_settings WHERE id = 1');
  return settings || { scheduled_time: null, max_backups: 30 };
}

/**
 * Update scheduled backup time.
 */
async function updateSettings(scheduledTime, maxBackups, userId) {
  await db.query(
    'UPDATE backup_settings SET scheduled_time = ?, max_backups = ?, updated_by = ? WHERE id = 1',
    [scheduledTime || null, maxBackups || 30, userId]
  );
}

/**
 * Get all backup logs.
 */
async function getBackupLogs(page = 1, limit = 20) {
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const [rows] = await db.query(
    `SELECT bl.*, u.name as created_by_name
     FROM backup_logs bl
     LEFT JOIN users u ON bl.created_by = u.id
     ORDER BY bl.created_at DESC
     LIMIT ? OFFSET ?`,
    [parseInt(limit), parseInt(offset)]
  );
  const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM backup_logs');
  return { rows, total };
}

/**
 * Delete a backup file and its log entry.
 */
async function deleteBackup(backupId) {
  const [[backup]] = await db.query('SELECT * FROM backup_logs WHERE id = ?', [backupId]);
  if (!backup) throw new Error('Backup not found');

  const filePath = path.join(BACKUP_DIR, backup.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  await db.query('DELETE FROM backup_logs WHERE id = ?', [backupId]);
  return { success: true };
}

/**
 * Remove old backups beyond max_backups limit.
 */
async function cleanupOldBackups() {
  const settings = await getSettings();
  const max = settings.max_backups || 30;

  const [rows] = await db.query(
    'SELECT id, filename FROM backup_logs WHERE status = ? ORDER BY created_at DESC',
    ['success']
  );

  if (rows.length > max) {
    const toDelete = rows.slice(max);
    for (const row of toDelete) {
      const filePath = path.join(BACKUP_DIR, row.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await db.query('DELETE FROM backup_logs WHERE id = ?', [row.id]);
    }
  }
}

/**
 * Restore from an uploaded .sql file.
 * Validates it's a TaskFlow backup, then executes it.
 */
async function restoreFromFile(uploadedPath, originalName, userId) {
  let sql = fs.readFileSync(uploadedPath, 'utf8');

  // Validate: must contain TaskFlow backup header or DROP TABLE/INSERT statements
  if (!sql.includes('TaskFlow Database Backup') && !sql.includes('DROP TABLE') && !sql.includes('INSERT INTO')) {
    fs.unlinkSync(uploadedPath);
    throw new Error('Invalid backup file — does not appear to be a valid TaskFlow database backup');
  }

  // Fix corrupted JSON columns: replace '[object Object]' with valid empty JSON
  sql = sql.replace(/'?\[object Object\]'?/g, "'{}'");

  // Copy to backups dir for record keeping
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `taskflow_uploaded_${timestamp}.sql`;
  const destPath = path.join(BACKUP_DIR, filename);
  fs.copyFileSync(uploadedPath, destPath);
  fs.unlinkSync(uploadedPath);
  const stats = fs.statSync(destPath);

  // Log the upload
  const [logResult] = await db.query(
    'INSERT INTO backup_logs (filename, file_size, type, status, created_by, notes) VALUES (?, ?, ?, ?, ?, ?)',
    [filename, stats.size, 'manual', 'restoring', userId, `Uploaded restore from: ${originalName}`]
  );
  const logId = logResult.insertId;

  const conn = await createConnection();

  try {
    await conn.query(sql);
    await conn.end();

    const freshConn = await createConnection();
    await freshConn.query("SET time_zone = '+00:00'");
    await freshConn.query('UPDATE backup_logs SET status = ? WHERE id = ?', ['restored', logId]);
    await freshConn.end();

    return { success: true, filename };
  } catch (err) {
    try {
      await conn.end();
      const freshConn = await createConnection();
      await freshConn.query("SET time_zone = '+00:00'");
      await freshConn.query('UPDATE backup_logs SET status = ?, notes = ? WHERE id = ?',
        ['failed', `Restore failed: ${err.message}`, logId]);
      await freshConn.end();
    } catch (_) {}
    throw err;
  }
}

module.exports = {
  createBackup,
  restoreBackup,
  restoreFromFile,
  getSettings,
  updateSettings,
  getBackupLogs,
  deleteBackup,
  BACKUP_DIR
};
