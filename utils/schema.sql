-- ============================================================
-- TaskFlow System - Complete MySQL Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS taskflow_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE taskflow_db;

-- ============================================================
-- ORGANIZATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  org_type ENUM('CFC', 'OUR') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- ROLES
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  organization_type ENUM('CFC', 'OUR') NOT NULL,
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
  type ENUM('daily','weekly','adhoc') NOT NULL DEFAULT 'adhoc',
  assigned_to INT UNSIGNED DEFAULT NULL,
  created_by INT UNSIGNED NOT NULL,
  group_id INT UNSIGNED DEFAULT NULL,
  due_date DATE DEFAULT NULL,
  reward_amount DECIMAL(10,2) DEFAULT NULL,
  status ENUM('pending','in_progress','completed','deactivated') DEFAULT 'pending',
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
  INDEX idx_deleted (is_deleted),
  INDEX idx_group (group_id)
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
