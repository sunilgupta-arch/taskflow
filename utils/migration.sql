-- ============================================================
-- TaskFlow Migration Script
-- Run this on an existing database to add all new tables/columns
-- Safe to run multiple times (uses IF NOT EXISTS / conditional checks)
-- ============================================================

USE taskflow_db;

-- ============================================================
-- 1. ADD shift_start, shift_hours TO users (if not present)
-- ============================================================
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'taskflow_db' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'shift_start');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN shift_start TIME DEFAULT ''10:00:00'' AFTER weekly_off_day',
  'SELECT ''shift_start already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'taskflow_db' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'shift_hours');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN shift_hours DECIMAL(3,1) DEFAULT 8.5 AFTER shift_start',
  'SELECT ''shift_hours already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 2. ADD weekly_off_day TO users (if not present)
-- ============================================================
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'taskflow_db' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'weekly_off_day');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN weekly_off_day ENUM(''Monday'',''Tuesday'',''Wednesday'',''Thursday'',''Friday'',''Saturday'',''Sunday'') DEFAULT ''Sunday'' AFTER password',
  'SELECT ''weekly_off_day already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 3. ADD leave_status TO users (if not present)
-- ============================================================
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'taskflow_db' AND TABLE_NAME = 'users' AND COLUMN_NAME = 'leave_status');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN leave_status TINYINT(1) DEFAULT 0 AFTER shift_hours',
  'SELECT ''leave_status already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 4. ADD group_id TO tasks (if not present)
-- ============================================================
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'taskflow_db' AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'group_id');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE tasks ADD COLUMN group_id INT UNSIGNED DEFAULT NULL AFTER created_by_org',
  'SELECT ''group_id already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = 'taskflow_db' AND TABLE_NAME = 'tasks' AND INDEX_NAME = 'idx_group');
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE tasks ADD INDEX idx_group (group_id)',
  'SELECT ''idx_group already exists''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 5. TASK COMMENTS table
-- ============================================================
CREATE TABLE IF NOT EXISTS task_comments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  comment TEXT NOT NULL,
  parent_id INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES task_comments(id) ON DELETE CASCADE,
  INDEX idx_task (task_id),
  INDEX idx_user (user_id),
  INDEX idx_parent (parent_id)
) ENGINE=InnoDB;

-- ============================================================
-- 6. LEAVE REQUESTS table
-- ============================================================
CREATE TABLE IF NOT EXISTS leave_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  reason VARCHAR(500) NOT NULL,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  reviewed_by INT UNSIGNED DEFAULT NULL,
  review_remark VARCHAR(500) DEFAULT NULL,
  reviewed_at TIMESTAMP DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user (user_id),
  INDEX idx_status (status),
  INDEX idx_dates (from_date, to_date)
) ENGINE=InnoDB;

-- ============================================================
-- 7. NOTES table
-- ============================================================
CREATE TABLE IF NOT EXISTS notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Migration completed successfully!' AS result;
