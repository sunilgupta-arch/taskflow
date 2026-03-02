-- Migration: Allow LOCAL org users to create tasks
-- Adds created_by_org column for visibility filtering

-- Add column
ALTER TABLE tasks ADD COLUMN created_by_org ENUM('CLIENT', 'LOCAL') NOT NULL DEFAULT 'CLIENT' AFTER created_by;

-- Backfill existing tasks (all were created by CLIENT org)
UPDATE tasks SET created_by_org = 'CLIENT';

-- Add index for efficient filtering
CREATE INDEX idx_created_by_org ON tasks (created_by_org);
