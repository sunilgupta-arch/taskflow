-- Migration 073: Add archive flag to users
ALTER TABLE users
  ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0
  AFTER visible_to_client;
