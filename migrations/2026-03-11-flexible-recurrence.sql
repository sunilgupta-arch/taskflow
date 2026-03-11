-- ============================================================
-- Migration: Flexible Recurrence System
-- Date: 2026-03-11
-- Description: Replace rigid daily/weekly types with flexible
--   recurrence patterns (specific weekdays, monthly dates)
-- ============================================================

-- Step 1: Add new recurrence columns
ALTER TABLE tasks
  ADD COLUMN recurrence_pattern ENUM('daily','weekly','monthly') DEFAULT NULL AFTER type,
  ADD COLUMN recurrence_days VARCHAR(50) DEFAULT NULL AFTER recurrence_pattern,
  ADD COLUMN deadline_time TIME DEFAULT NULL AFTER recurrence_days,
  ADD COLUMN recurrence_end_date DATE DEFAULT NULL AFTER deadline_time;

-- Step 2: Migrate existing data
-- daily tasks → type='recurring', recurrence_pattern='daily'
UPDATE tasks SET recurrence_pattern = 'daily' WHERE type = 'daily';

-- weekly tasks → type='recurring', recurrence_pattern='weekly', recurrence_days='0,1,2,3,4,5,6' (all days)
UPDATE tasks SET recurrence_pattern = 'weekly', recurrence_days = '0,1,2,3,4,5,6' WHERE type = 'weekly';

-- Step 3: Change type ENUM from ('daily','weekly','adhoc') to ('once','recurring')
-- MySQL requires recreating the column for ENUM changes
ALTER TABLE tasks MODIFY COLUMN type ENUM('daily','weekly','adhoc','once','recurring') NOT NULL DEFAULT 'once';

-- Convert existing values
UPDATE tasks SET type = 'recurring' WHERE type IN ('daily', 'weekly');
UPDATE tasks SET type = 'once' WHERE type = 'adhoc';

-- Step 4: Drop old enum values (final schema)
ALTER TABLE tasks MODIFY COLUMN type ENUM('once','recurring') NOT NULL DEFAULT 'once';

-- Step 5: Add index for recurrence pattern lookups
ALTER TABLE tasks ADD INDEX idx_recurrence (recurrence_pattern);
