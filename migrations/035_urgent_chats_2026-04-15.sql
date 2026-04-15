-- Migration 035: Urgent Chat system (cross-team urgent communication)

CREATE TABLE IF NOT EXISTS portal_urgent_chats (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  created_by INT UNSIGNED NOT NULL,
  message TEXT NOT NULL,
  status ENUM('waiting', 'accepted', 'resolved') NOT NULL DEFAULT 'waiting',
  accepted_by INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP NULL DEFAULT NULL,
  resolved_at TIMESTAMP NULL DEFAULT NULL,
  resolved_by INT UNSIGNED DEFAULT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (accepted_by) REFERENCES users(id),
  FOREIGN KEY (resolved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS portal_urgent_messages (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  urgent_chat_id INT UNSIGNED NOT NULL,
  sender_id INT UNSIGNED NOT NULL,
  content TEXT,
  type ENUM('text', 'file', 'system') NOT NULL DEFAULT 'text',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (urgent_chat_id) REFERENCES portal_urgent_chats(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS portal_urgent_attachments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_id INT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT DEFAULT 0,
  mime_type VARCHAR(100),
  uploaded_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES portal_urgent_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);
