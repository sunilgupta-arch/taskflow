const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

/**
 * Auto-migration system.
 * - Tracks applied migrations in a `_migrations` table
 * - On startup, runs any .sql files in migrations/ that haven't been applied yet
 * - Files must be named: 001_description_YYYY-MM-DD.sql (sorted alphabetically)
 */
async function autoMigrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'taskflow_db',
    multipleStatements: true
  });

  try {
    // Ensure _migrations tracking table exists
    await conn.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get already-applied migrations
    const [applied] = await conn.query('SELECT filename FROM _migrations');
    const appliedSet = new Set(applied.map(r => r.filename));

    // Get all migration files, sorted
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      await conn.end();
      return;
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    // Run pending migrations
    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`[MIGRATE] Running: ${file}`);
      try {
        await conn.query(sql);
        await conn.query('INSERT INTO _migrations (filename) VALUES (?)', [file]);
        console.log(`[MIGRATE] Applied: ${file}`);
        count++;
      } catch (err) {
        console.error(`[MIGRATE] FAILED: ${file} — ${err.message}`);
        // Stop on first failure to prevent running dependent migrations
        break;
      }
    }

    if (count > 0) {
      console.log(`[MIGRATE] ${count} migration(s) applied`);
    } else {
      console.log('[MIGRATE] Database is up to date');
    }

    await conn.end();
  } catch (err) {
    console.error('[MIGRATE] Error:', err.message);
    try { await conn.end(); } catch (_) {}
  }
}

module.exports = autoMigrate;
