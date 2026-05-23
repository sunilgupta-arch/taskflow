-- Restore stored_name for local disk path, make drive_file_id a separate nullable column
ALTER TABLE downloads
  CHANGE COLUMN drive_file_id stored_name VARCHAR(255) NULL DEFAULT NULL,
  ADD COLUMN drive_file_id VARCHAR(255) NULL DEFAULT NULL AFTER stored_name;
