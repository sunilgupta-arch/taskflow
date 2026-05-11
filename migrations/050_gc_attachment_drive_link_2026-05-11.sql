-- Add drive_view_link to group channel attachments for direct Drive browser access
ALTER TABLE group_channel_attachments
  ADD COLUMN drive_view_link VARCHAR(1000) DEFAULT NULL AFTER drive_file_id;
