-- ============================================================
-- TaskFlow System - Complete MySQL Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS taskflow_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================
-- DATABASE USER
-- ============================================================
CREATE USER IF NOT EXISTS 'user_taskflow'@'%' IDENTIFIED BY '269608Raj$';
GRANT ALL PRIVILEGES ON taskflow_db.* TO 'user_taskflow'@'%';
FLUSH PRIVILEGES;

USE taskflow_db;

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  org_type ENUM('CLIENT', 'LOCAL') NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- ROLES
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  organization_type ENUM('CLIENT', 'LOCAL') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organization_id INT UNSIGNED NOT NULL,
  role_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  weekly_off_day ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') DEFAULT 'Sunday',
  shift_start TIME DEFAULT '10:00:00',
  shift_hours DECIMAL(3,1) DEFAULT 8.5,
  leave_status TINYINT(1) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  avatar VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
  INDEX idx_email (email),
  INDEX idx_org (organization_id),
  INDEX idx_role (role_id)
) ENGINE=InnoDB;

-- ============================================================
-- TASKS
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type ENUM('once','recurring') NOT NULL DEFAULT 'once',
  recurrence_pattern ENUM('daily','weekly','monthly') DEFAULT NULL,
  recurrence_days VARCHAR(50) DEFAULT NULL,
  deadline_time TIME DEFAULT NULL,
  recurrence_end_date DATE DEFAULT NULL,
  assigned_to INT UNSIGNED DEFAULT NULL,
  created_by INT UNSIGNED NOT NULL,
  created_by_org ENUM('CLIENT', 'LOCAL') NOT NULL DEFAULT 'CLIENT',
  group_id INT UNSIGNED DEFAULT NULL,
  due_date DATE DEFAULT NULL,
  reward_amount DECIMAL(10,2) DEFAULT NULL,
  status ENUM('pending','in_progress','completed','deactivated','active') DEFAULT 'pending',
  priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  is_deleted TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_status (status),
  INDEX idx_assigned (assigned_to),
  INDEX idx_created_by (created_by),
  INDEX idx_type (type),
  INDEX idx_recurrence (recurrence_pattern),
  INDEX idx_deleted (is_deleted),
  INDEX idx_group (group_id),
  INDEX idx_created_by_org (created_by_org),
  INDEX idx_priority (priority)
) ENGINE=InnoDB;

-- ============================================================
-- TASK ATTACHMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS task_attachments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id INT UNSIGNED NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_size INT UNSIGNED DEFAULT 0,
  uploaded_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX idx_task (task_id)
) ENGINE=InnoDB;

-- ============================================================
-- REWARDS LEDGER
-- ============================================================
CREATE TABLE IF NOT EXISTS rewards_ledger (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  task_id INT UNSIGNED NOT NULL,
  reward_amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending','paid') DEFAULT 'pending',
  paid_at TIMESTAMP DEFAULT NULL,
  paid_by INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE RESTRICT,
  INDEX idx_user (user_id),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- ============================================================
-- ATTENDANCE LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  login_time TIMESTAMP DEFAULT NULL,
  logout_time TIMESTAMP DEFAULT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_date (user_id, date),
  INDEX idx_date (date)
) ENGINE=InnoDB;

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id INT UNSIGNED DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- ============================================================
-- TASK COMMENTS
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
-- LEAVE REQUESTS
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
-- NOTES (Personal user notes / diary)
-- ============================================================
-- ============================================================
-- TASK COMPLETIONS (for recurring daily/weekly tasks)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_completions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  completion_date DATE NOT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE KEY uk_task_user_date (task_id, user_id, completion_date),
  INDEX idx_user_date (user_id, completion_date),
  INDEX idx_task (task_id),
  INDEX idx_date (completion_date)
) ENGINE=InnoDB;

-- ============================================================
-- NOTES (Personal user notes / diary)
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
