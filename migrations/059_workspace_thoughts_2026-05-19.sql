-- 059: Dev Workspace Thoughts (2026-05-19)
-- Client Admin can post thoughts; Local Admin + is_dev users can comment with attachments

CREATE TABLE IF NOT EXISTS dev_thoughts (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  author_id  INT UNSIGNED NOT NULL,
  title      VARCHAR(255) NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_author (author_id),
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dev_thought_files (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  thought_id  INT UNSIGNED NOT NULL,
  file_name   VARCHAR(255) NOT NULL,
  file_path   VARCHAR(500) NOT NULL,
  file_mime   VARCHAR(100) NOT NULL DEFAULT '',
  file_size   INT UNSIGNED NOT NULL DEFAULT 0,
  uploaded_by INT UNSIGNED NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_thought (thought_id),
  FOREIGN KEY (thought_id) REFERENCES dev_thoughts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dev_thought_comments (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  thought_id INT UNSIGNED NOT NULL,
  author_id  INT UNSIGNED NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_thought (thought_id),
  INDEX idx_author (author_id),
  FOREIGN KEY (thought_id) REFERENCES dev_thoughts(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dev_thought_comment_files (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  comment_id  INT UNSIGNED NOT NULL,
  file_name   VARCHAR(255) NOT NULL,
  file_path   VARCHAR(500) NOT NULL,
  file_mime   VARCHAR(100) NOT NULL DEFAULT '',
  file_size   INT UNSIGNED NOT NULL DEFAULT 0,
  uploaded_by INT UNSIGNED NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_comment (comment_id),
  FOREIGN KEY (comment_id) REFERENCES dev_thought_comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
