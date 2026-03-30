-- Track which chat attachments a user has already saved to their drive
CREATE TABLE IF NOT EXISTS chat_saved_attachments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  message_id INT UNSIGNED NOT NULL,
  drive_file_id VARCHAR(100) NOT NULL,
  saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  UNIQUE KEY uk_user_message (user_id, message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
