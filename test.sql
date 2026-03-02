
-- Run against your database:
ALTER TABLE tasks ADD COLUMN created_by_org ENUM('CLIENT', 'LOCAL') NOT NULL DEFAULT 'CLIENT' AFTER created_by;
UPDATE tasks SET created_by_org = 'CLIENT';
CREATE INDEX idx_created_by_org ON tasks (created_by_org);
