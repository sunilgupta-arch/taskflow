-- Group Channel: reply-to-message support
ALTER TABLE group_channel_messages
  ADD COLUMN reply_to_id INT UNSIGNED NULL AFTER type,
  ADD INDEX idx_gc_reply_to (reply_to_id);
