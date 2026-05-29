-- Add mute toggle to chat participants
ALTER TABLE chat_participants
  ADD COLUMN is_muted TINYINT(1) NOT NULL DEFAULT 0 AFTER cleared_before_id;
