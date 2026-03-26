require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function seed() {
  console.log('Starting database seed...');

  try {
    // Organizations
    await db.query(`INSERT IGNORE INTO organizations (id, name, org_type, timezone) VALUES
      (1, 'Client Organization', 'CLIENT', 'America/New_York'),
      (2, 'Local Organization', 'LOCAL', 'Asia/Kolkata')`);
    console.log('Organizations seeded');

    // Roles
    await db.query(`INSERT IGNORE INTO roles (id, name, organization_type) VALUES
      (1, 'CLIENT_ADMIN', 'CLIENT'),
      (2, 'CLIENT_MANAGER', 'CLIENT'),
      (3, 'LOCAL_ADMIN', 'LOCAL'),
      (4, 'LOCAL_MANAGER', 'LOCAL'),
      (5, 'LOCAL_USER', 'LOCAL')`);
    console.log('Roles seeded');

    // Default admin users (one per org type)
    const password = await bcrypt.hash('Admin@123', 12);
    await db.query(`INSERT IGNORE INTO users (id, organization_id, role_id, name, email, password, weekly_off_day) VALUES
      (1, 1, 1, 'Client Admin', 'client.admin@taskflow.com', ?, 'Sunday'),
      (2, 2, 3, 'Local Admin', 'local.admin@taskflow.com', ?, 'Sunday')`,
      [password, password]);
    console.log('Admin users seeded');

    console.log('\nSeed complete! Login credentials:');
    console.log('----------------------------------------');
    console.log('Client Admin : client.admin@taskflow.com / Admin@123');
    console.log('Local Admin  : local.admin@taskflow.com / Admin@123');
    console.log('----------------------------------------');

    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  }
}

seed();
