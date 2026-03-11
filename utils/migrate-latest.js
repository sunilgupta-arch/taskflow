require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function migrateLatest() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');

  if (!fs.existsSync(migrationsDir)) {
    console.error('❌ No migrations/ folder found');
    process.exit(1);
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found.');
    process.exit(0);
  }

  const latest = files[files.length - 1];
  const filePath = path.join(migrationsDir, latest);
  const sql = fs.readFileSync(filePath, 'utf8');

  console.log(`🔧 Running latest migration: ${latest}`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'taskflow',
    multipleStatements: true
  });

  try {
    await conn.query(sql);
    console.log(`✅ Migration applied successfully: ${latest}`);
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error(`❌ Migration failed: ${err.message}`);
    await conn.end();
    process.exit(1);
  }
}

migrateLatest();
