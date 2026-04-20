-- Group Channel: track edited messages
ALTER TABLE group_channel_messages
  ADD COLUMN edited_at TIMESTAMP NULL AFTER created_at;
