-- ============================================================
-- Migration: 2026-03-10
-- Run this ONCE on the VM after pulling the latest code
-- Covers ALL changes since the 4th commit
-- ============================================================

USE taskflow_db;

-- ============================================================
-- 1. Add 'active' and 'deactivated' to tasks status ENUM
-- ============================================================
ALTER TABLE tasks MODIFY COLUMN status ENUM('pending','in_progress','completed','deactivated','active') DEFAULT 'pending';

-- ============================================================
-- 2. Create task_completions table (for recurring task tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_completions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  completion_date DATE NOT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE KEY uk_task_user_date (task_id, user_id, completion_date),
  INDEX idx_user_date (user_id, completion_date),
  INDEX idx_task (task_id),
  INDEX idx_date (completion_date)
) ENGINE=InnoDB;

-- ============================================================
-- 3. CLEANUP: Deduplicate recurring tasks
--    Keep only the first (MIN id) per title+type+assigned_to
--    Soft-delete the rest, then set remaining to 'active'
-- ============================================================

-- Soft-delete duplicate recurring tasks (keep smallest id per group)
UPDATE tasks SET is_deleted = 1
WHERE type IN ('daily', 'weekly')
  AND id NOT IN (
    SELECT keep_id FROM (
      SELECT MIN(id) as keep_id
      FROM tasks
      WHERE type IN ('daily', 'weekly')
      GROUP BY title, type, assigned_to
    ) as keepers
  );

-- Set remaining recurring tasks to 'active' status
UPDATE tasks SET status = 'active'
WHERE type IN ('daily', 'weekly') AND is_deleted = 0;

-- ============================================================
-- 4. Add priority column to tasks
-- ============================================================
ALTER TABLE tasks ADD COLUMN priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium' AFTER status;
CREATE INDEX idx_priority ON tasks (priority);

-- ============================================================
-- 5. Add timezone column to organizations
-- ============================================================
ALTER TABLE organizations ADD COLUMN timezone VARCHAR(50) NOT NULL DEFAULT 'UTC' AFTER org_type;
UPDATE organizations SET timezone = 'Asia/Kolkata' WHERE org_type = 'LOCAL';
UPDATE organizations SET timezone = 'America/New_York' WHERE org_type = 'CLIENT';
