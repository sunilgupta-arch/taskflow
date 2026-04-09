-- Add edit/delete support to portal messages
ALTER TABLE portal_messages
  ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0 AFTER type,
  ADD COLUMN is_edited TINYINT(1) NOT NULL DEFAULT 0 AFTER is_deleted,
  ADD COLUMN edited_at TIMESTAMP NULL AFTER is_edited;
