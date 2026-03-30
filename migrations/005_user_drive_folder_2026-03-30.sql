-- Add Google Drive folder ID column to users table
ALTER TABLE users ADD COLUMN drive_folder_id VARCHAR(100) DEFAULT NULL AFTER avatar;
