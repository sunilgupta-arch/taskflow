-- Add per-user clear-chat support to chat_participants
ALTER TABLE chat_participants
  ADD COLUMN cleared_before_id INT UNSIGNED NOT NULL DEFAULT 0
    COMMENT 'Messages with id <= this value are hidden for this user (cleared chat)';
