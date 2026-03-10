
-- Run against your database:
ALTER TABLE tasks ADD COLUMN created_by_org ENUM('CLIENT', 'LOCAL') NOT NULL DEFAULT 'CLIENT' AFTER created_by;
UPDATE tasks SET created_by_org = 'CLIENT';
CREATE INDEX idx_created_by_org ON tasks (created_by_org);


-- 1. Add 'active' to tasks status ENUM
ALTER TABLE tasks MODIFY COLUMN status ENUM('pending','in_progress','completed','deactivated','active') DEFAULT 'pending';

-- 2. Create task_completions table
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
-- 3. CLEANUP: Remove redundant recurring tasks (keep first entry only)
-- ============================================================

-- First, preview what will be kept vs removed (RUN THIS FIRST to verify):
SELECT
  t.id, t.title, t.type, t.assigned_to, u.name as assigned_to_name, t.status, t.created_at,
  CASE WHEN t.id = keeper.keep_id THEN 'KEEP' ELSE 'REMOVE' END as action
FROM tasks t
JOIN users u ON t.assigned_to = u.id
JOIN (
  SELECT MIN(id) as keep_id, title, type, assigned_to
  FROM tasks
  WHERE type IN ('daily', 'weekly') AND is_deleted = 0
  GROUP BY title, type, assigned_to
) keeper ON t.title = keeper.title AND t.type = keeper.type AND t.assigned_to = keeper.assigned_to
WHERE t.type IN ('daily', 'weekly') AND t.is_deleted = 0
ORDER BY t.title, t.assigned_to, t.id;

-- Soft-delete all duplicate recurring tasks (keep the one with smallest id per title+type+assigned_to)
UPDATE tasks SET is_deleted = 1
WHERE type IN ('daily', 'weekly')
  AND is_deleted = 0
  AND id NOT IN (
    SELECT keep_id FROM (
      SELECT MIN(id) as keep_id
      FROM tasks
      WHERE type IN ('daily', 'weekly') AND is_deleted = 0
      GROUP BY title, type, assigned_to
    ) as keepers
  );

-- Set the remaining recurring tasks to 'active' status
UPDATE tasks SET status = 'active'
WHERE type IN ('daily', 'weekly') AND is_deleted = 0;

-- ============================================================
-- 4. CLEANUP: Soft-delete old completed daily/weekly duplicate rows
-- These are leftover rows from the old cron system that were already
-- marked completed before the cleanup above ran.
-- Keep only the first (MIN id) per title+type+assigned_to, remove the rest.
-- ============================================================

-- Preview first:
SELECT t.id, t.title, t.type, t.assigned_to, t.status, t.is_deleted,
  CASE WHEN t.id = keeper.keep_id THEN 'KEEP' ELSE 'REMOVE' END as action
FROM tasks t
JOIN (
  SELECT MIN(id) as keep_id, title, type, assigned_to
  FROM tasks
  WHERE type IN ('daily', 'weekly')
  GROUP BY title, type, assigned_to
) keeper ON t.title = keeper.title AND t.type = keeper.type AND t.assigned_to = keeper.assigned_to
WHERE t.type IN ('daily', 'weekly')
ORDER BY t.title, t.assigned_to, t.id;

-- Soft-delete ALL old duplicate daily/weekly rows (including already-completed ones)
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

-- ============================================================
-- 5. Add priority column to tasks
-- ============================================================
ALTER TABLE tasks ADD COLUMN priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium' AFTER status;
CREATE INDEX idx_priority ON tasks (priority);

ALTER TABLE tasks ADD COLUMN priority ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium' AFTER status;
CREATE INDEX idx_priority ON tasks (priority);


delete FROM tasks where id = 8;

-- ============================================================
-- 6. Add timezone to organizations
-- ============================================================
ALTER TABLE organizations ADD COLUMN timezone VARCHAR(50) NOT NULL DEFAULT 'UTC' AFTER org_type;
UPDATE organizations SET timezone = 'Asia/Kolkata' WHERE org_type = 'LOCAL';
UPDATE organizations SET timezone = 'America/New_York' WHERE org_type = 'CLIENT';