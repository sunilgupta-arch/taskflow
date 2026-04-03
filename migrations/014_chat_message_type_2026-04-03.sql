-- Add message_type column to chat_messages for call events
ALTER TABLE chat_messages
  ADD COLUMN message_type ENUM('text', 'call_outgoing', 'call_incoming', 'call_missed') NOT NULL DEFAULT 'text' AFTER content,
  ADD COLUMN call_duration INT UNSIGNED DEFAULT NULL AFTER message_type;
