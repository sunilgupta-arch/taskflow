require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

async function seed() {
  console.log('🌱 Starting database seed...');
  
  try {
    // Organizations
    await db.query(`INSERT IGNORE INTO organizations (id, name, org_type) VALUES
      (1, 'Client Corporation', 'CLIENT'),
      (2, 'Local Execution Team', 'LOCAL')`);
    console.log('✅ Organizations seeded');

    // Roles
    await db.query(`INSERT IGNORE INTO roles (id, name, organization_type) VALUES
      (1, 'CLIENT_ADMIN', 'CLIENT'),
      (2, 'CLIENT_MANAGER', 'CLIENT'),
      (3, 'LOCAL_ADMIN', 'LOCAL'),
      (4, 'LOCAL_MANAGER', 'LOCAL'),
      (5, 'LOCAL_USER', 'LOCAL')`);
    console.log('✅ Roles seeded');

    // Users
    const password = await bcrypt.hash('Password@123', 12);
    await db.query(`INSERT IGNORE INTO users (id, organization_id, role_id, name, email, password, weekly_off_day) VALUES
      (1, 1, 1, 'Alice Johnson', 'cfc.admin@taskflow.com', ?, 'Saturday'),
      (2, 1, 2, 'Bob Williams', 'cfc.manager@taskflow.com', ?, 'Saturday'),
      (3, 2, 3, 'Charlie Brown', 'our.admin@taskflow.com', ?, 'Sunday'),
      (4, 2, 4, 'Diana Prince', 'our.manager@taskflow.com', ?, 'Sunday'),
      (5, 2, 5, 'Eve Davis', 'our.user1@taskflow.com', ?, 'Sunday'),
      (6, 2, 5, 'Frank Miller', 'our.user2@taskflow.com', ?, 'Sunday'),
      (7, 2, 5, 'Grace Lee', 'our.user3@taskflow.com', ?, 'Sunday')`,
      [password, password, password, password, password, password, password]);
    console.log('✅ Users seeded');

    // Tasks
    const today = new Date().toISOString().split('T')[0];
    await db.query(`INSERT IGNORE INTO tasks (id, title, description, type, assigned_to, created_by, due_date, reward_amount, status) VALUES
      (1, 'Setup Client Portal', 'Configure the new client portal with SSO integration', 'adhoc', 5, 1, ?, 250.00, 'pending'),
      (2, 'Daily Report Generation', 'Generate and send daily metrics report', 'daily', 5, 1, ?, 50.00, 'in_progress'),
      (3, 'Weekly Security Audit', 'Run complete security audit on all systems', 'weekly', 6, 2, ?, 150.00, 'pending'),
      (4, 'Database Optimization', 'Optimize slow queries and add missing indexes', 'adhoc', NULL, 1, ?, 200.00, 'pending'),
      (5, 'UI Bug Fixes', 'Fix reported UI issues in the main dashboard', 'adhoc', 7, 2, ?, 100.00, 'completed')`,
      [today, today, today, today, today]);

    // Mark task 5 as completed
    await db.query(`UPDATE tasks SET completed_at = NOW(), status = 'completed' WHERE id = 5`);
    
    // Rewards for completed task
    await db.query(`INSERT IGNORE INTO rewards_ledger (user_id, task_id, reward_amount, status) VALUES
      (7, 5, 100.00, 'pending')`);
    
    console.log('✅ Tasks & rewards seeded');
    console.log('\n🎉 Seed complete! Login credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Client Admin   : cfc.admin@taskflow.com / Password@123');
    console.log('Client Manager : cfc.manager@taskflow.com / Password@123');
    console.log('Local Admin    : our.admin@taskflow.com / Password@123');
    console.log('Local Manager  : our.manager@taskflow.com / Password@123');
    console.log('Local User 1   : our.user1@taskflow.com / Password@123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
}

seed();
