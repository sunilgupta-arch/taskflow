-- Backup settings and logs
CREATE TABLE IF NOT EXISTS backup_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scheduled_time TIME DEFAULT NULL COMMENT 'Daily backup time (HH:MM:SS), NULL = disabled',
  max_backups INT DEFAULT 30 COMMENT 'Max backups to retain',
  updated_by INT UNSIGNED DEFAULT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS backup_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  file_size BIGINT DEFAULT 0,
  type ENUM('manual', 'scheduled') DEFAULT 'manual',
  status ENUM('success', 'failed', 'restoring', 'restored') DEFAULT 'success',
  created_by INT UNSIGNED DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Insert default settings row
INSERT IGNORE INTO backup_settings (id, scheduled_time, max_backups) VALUES (1, NULL, 30);
