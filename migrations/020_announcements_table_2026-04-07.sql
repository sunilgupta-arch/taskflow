-- Migration 020: Create announcements table for Info Board
CREATE TABLE IF NOT EXISTS announcements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  body TEXT NULL,
  is_pinned TINYINT(1) NOT NULL DEFAULT 0,
  audience ENUM('local', 'client', 'all') NOT NULL DEFAULT 'local',
  created_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
