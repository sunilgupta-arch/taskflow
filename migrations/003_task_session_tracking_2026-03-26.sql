-- Add session tracking columns to task_completions
ALTER TABLE task_completions
  ADD COLUMN started_at TIMESTAMP NULL DEFAULT NULL AFTER notes,
  ADD COLUMN completed_at TIMESTAMP NULL DEFAULT NULL AFTER started_at,
  ADD COLUMN duration_minutes INT NULL DEFAULT NULL AFTER completed_at;

-- Mark all existing records as completed (backward compatibility)
UPDATE task_completions SET completed_at = created_at WHERE completed_at IS NULL;
