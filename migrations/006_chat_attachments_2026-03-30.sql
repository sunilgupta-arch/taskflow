-- Add attachment fields to chat_messages
ALTER TABLE chat_messages
  ADD COLUMN attachment_drive_id VARCHAR(100) DEFAULT NULL AFTER content,
  ADD COLUMN attachment_name VARCHAR(255) DEFAULT NULL AFTER attachment_drive_id,
  ADD COLUMN attachment_mime VARCHAR(100) DEFAULT NULL AFTER attachment_name,
  ADD COLUMN attachment_size INT UNSIGNED DEFAULT NULL AFTER attachment_mime,
  ADD COLUMN attachment_link VARCHAR(500) DEFAULT NULL AFTER attachment_size;

-- Allow messages with only attachment (no text content required)
ALTER TABLE chat_messages MODIFY COLUMN content TEXT DEFAULT NULL;
