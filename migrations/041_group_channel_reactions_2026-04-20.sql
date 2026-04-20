-- Group Channel: emoji reactions on messages
CREATE TABLE IF NOT EXISTS group_channel_reactions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_gc_reaction (message_id, user_id, emoji),
  FOREIGN KEY (message_id) REFERENCES group_channel_messages(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_gcr_msg (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
