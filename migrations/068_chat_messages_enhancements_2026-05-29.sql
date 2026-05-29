-- Add edit, soft-delete, reply, and reactions to local chat messages
ALTER TABLE chat_messages
  ADD COLUMN is_deleted  TINYINT(1)   NOT NULL DEFAULT 0   AFTER content,
  ADD COLUMN is_edited   TINYINT(1)   NOT NULL DEFAULT 0   AFTER is_deleted,
  ADD COLUMN edited_at   TIMESTAMP    NULL                  AFTER is_edited,
  ADD COLUMN reply_to_id INT UNSIGNED NULL                  AFTER edited_at,
  ADD INDEX idx_reply_to (reply_to_id);

CREATE TABLE IF NOT EXISTS chat_reactions (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  message_id      INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL,
  emoji           VARCHAR(10)  NOT NULL,
  created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_reaction (message_id, user_id, emoji),
  FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
