-- Store Group Channel attachments on Google Drive instead of local disk
ALTER TABLE group_channel_attachments ADD COLUMN drive_file_id VARCHAR(255) DEFAULT NULL AFTER message_id;
ALTER TABLE group_channel_attachments MODIFY COLUMN file_path VARCHAR(500) DEFAULT NULL;
