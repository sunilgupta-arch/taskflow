-- Migration 009: Add secondary and tertiary fallback assignees to tasks
-- When primary assignee is on leave/weekly-off, task falls to secondary, then tertiary
-- Idempotent: checks if columns exist before adding

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'secondary_assignee');
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE tasks ADD COLUMN secondary_assignee INT UNSIGNED NULL DEFAULT NULL AFTER assigned_to, ADD COLUMN tertiary_assignee INT UNSIGNED NULL DEFAULT NULL AFTER secondary_assignee, ADD INDEX idx_secondary_assignee (secondary_assignee), ADD INDEX idx_tertiary_assignee (tertiary_assignee), ADD CONSTRAINT fk_tasks_secondary_assignee FOREIGN KEY (secondary_assignee) REFERENCES users(id) ON DELETE SET NULL, ADD CONSTRAINT fk_tasks_tertiary_assignee FOREIGN KEY (tertiary_assignee) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
