-- Migration 030: Add archive flag to portal tasks
ALTER TABLE portal_tasks ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0 AFTER status;
