-- Persist @mention records so users can see who mentioned them and when,
-- even if they were offline at the time.
CREATE TABLE IF NOT EXISTS group_channel_mentions (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_id        INT UNSIGNED NOT NULL,
  mentioned_user_id INT UNSIGNED NOT NULL,
  seen_at           DATETIME     NULL DEFAULT NULL,
  created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_gcm (message_id, mentioned_user_id),
  FOREIGN KEY (message_id)        REFERENCES group_channel_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (mentioned_user_id) REFERENCES users(id)                  ON DELETE CASCADE,
  INDEX idx_gcm_user (mentioned_user_id),
  INDEX idx_gcm_unseen (mentioned_user_id, seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
