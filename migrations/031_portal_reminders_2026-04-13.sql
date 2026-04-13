-- Portal Reminders table
CREATE TABLE IF NOT EXISTS portal_reminders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  note TEXT DEFAULT NULL,
  remind_at DATETIME NOT NULL,
  is_done TINYINT(1) NOT NULL DEFAULT 0,
  notified TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_portal_reminders_user (user_id),
  INDEX idx_portal_reminders_due (remind_at, is_done, notified)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
