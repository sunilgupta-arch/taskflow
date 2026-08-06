-- Migration 074: Break tracking
-- Lets LOCAL users punch tea/lunch/washroom/meeting/other breaks; admins/managers see live status

CREATE TABLE IF NOT EXISTS user_breaks (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          INT UNSIGNED NOT NULL,
  break_type       ENUM('tea','lunch_dinner','washroom','meeting','other') NOT NULL,
  note             VARCHAR(255) NULL,
  started_at       DATETIME NOT NULL,
  ended_at         DATETIME NULL,
  duration_minutes INT UNSIGNED NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_active (user_id, ended_at),
  INDEX idx_started (started_at)
) ENGINE=InnoDB;
