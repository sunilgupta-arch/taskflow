-- Migration 072: Weekly roster system
-- Lets managers plan next week's weekoffs per employee, honoring employee requests

CREATE TABLE IF NOT EXISTS weekly_rosters (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL,
  week_start_date DATE NOT NULL,
  weekoff_day     ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
  status          ENUM('draft','published') NOT NULL DEFAULT 'draft',
  created_by      INT UNSIGNED NULL,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_week (user_id, week_start_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_week (week_start_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS roster_requests (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           INT UNSIGNED NOT NULL,
  week_start_date   DATE NOT NULL,
  requested_day     ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday') NOT NULL,
  note              VARCHAR(255) NULL,
  status            ENUM('pending','fulfilled','declined') NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_week (user_id, week_start_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
