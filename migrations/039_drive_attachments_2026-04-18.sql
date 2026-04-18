-- Move all attachment storage to Google Drive — add drive_file_id column and make file_path nullable

-- Portal Chat
ALTER TABLE portal_attachments ADD COLUMN drive_file_id VARCHAR(255) DEFAULT NULL AFTER message_id;
ALTER TABLE portal_attachments MODIFY COLUMN file_path VARCHAR(500) DEFAULT NULL;

-- Bridge Chat
ALTER TABLE bridge_attachments ADD COLUMN drive_file_id VARCHAR(255) DEFAULT NULL AFTER message_id;
ALTER TABLE bridge_attachments MODIFY COLUMN file_path VARCHAR(500) DEFAULT NULL;

-- Urgent Line
ALTER TABLE portal_urgent_attachments ADD COLUMN drive_file_id VARCHAR(255) DEFAULT NULL AFTER message_id;
ALTER TABLE portal_urgent_attachments MODIFY COLUMN file_path VARCHAR(500) DEFAULT NULL;

-- Main Task Attachments
ALTER TABLE task_attachments ADD COLUMN drive_file_id VARCHAR(255) DEFAULT NULL AFTER task_id;
ALTER TABLE task_attachments MODIFY COLUMN file_path VARCHAR(500) DEFAULT NULL;

-- Portal Task Comment Attachments
ALTER TABLE portal_task_attachments ADD COLUMN drive_file_id VARCHAR(255) DEFAULT NULL AFTER comment_id;
ALTER TABLE portal_task_attachments MODIFY COLUMN file_path VARCHAR(500) DEFAULT NULL;
