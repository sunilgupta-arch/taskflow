-- Migration 018: Create holidays table and add 'holiday' to manual_status ENUM

CREATE TABLE IF NOT EXISTS holidays (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  date DATE NOT NULL,
  name VARCHAR(100) NOT NULL,
  organization_id INT UNSIGNED NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_date_org (date, organization_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Add 'holiday' to manual_status ENUM
ALTER TABLE attendance_logs
  MODIFY COLUMN manual_status ENUM('present', 'leave', 'half_day', 'official_duty', 'work_from_home', 'holiday') NULL DEFAULT NULL;
