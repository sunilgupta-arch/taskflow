-- Migration 075: Store Duties
-- Client-side (portal) feature: a catalogue of store duties, rules for how each
-- duty is managed, and per-day work rows with start/finish time tracking.
--
-- Three tables, deliberately separated:
--   store_duties     WHAT the duty is. Raw text only -- no scheduling, no assignee.
--                    A duty can sit here indefinitely with nobody assigned.
--   duty_schedules   HOW a duty is managed: who does it, on which days, over what
--                    window. A duty may have zero rules (never scheduled) or many
--                    (different people on different days).
--   duty_assignments The actual work: one row per (duty, employee, date), carrying
--                    status and the start/finish timestamps.
--
-- Assignment rows are materialized lazily when a date is read, never by cron.

-- ── WHAT: the raw duty catalogue ──────────────────────────────────
CREATE TABLE IF NOT EXISTS store_duties (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id            INT UNSIGNED NOT NULL,
  title             VARCHAR(255) NOT NULL,
  description       TEXT DEFAULT NULL,
  category          VARCHAR(100) DEFAULT NULL COMMENT 'Grouping label only, e.g. Daily Duties, Evening Closing',
  estimated_minutes INT UNSIGNED DEFAULT NULL COMMENT 'Target time; flags overruns in reports',
  sort_order        INT NOT NULL DEFAULT 0,
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_by        INT UNSIGNED DEFAULT NULL COMMENT 'NULL for seeded rows',
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id)     REFERENCES organizations(id),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sd_org  (org_id, is_active),
  INDEX idx_sd_sort (category, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── HOW: management rules for a duty ──────────────────────────────
CREATE TABLE IF NOT EXISTS duty_schedules (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  duty_id         INT UNSIGNED NOT NULL,
  user_id         INT UNSIGNED NOT NULL COMMENT 'Who performs the duty under this rule',
  recurrence      ENUM('once','daily','weekly') NOT NULL DEFAULT 'weekly',
  recurrence_days VARCHAR(20) DEFAULT NULL COMMENT 'CSV weekday numbers, 0=Sun..6=Sat (weekly only)',
  start_date      DATE NOT NULL,
  end_date        DATE DEFAULT NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_by      INT UNSIGNED DEFAULT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (duty_id)    REFERENCES store_duties(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_ds_duty   (duty_id, is_active),
  INDEX idx_ds_user   (user_id, is_active),
  INDEX idx_ds_window (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── THE WORK: one row per duty per employee per day ───────────────
CREATE TABLE IF NOT EXISTS duty_assignments (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  duty_id          INT UNSIGNED NOT NULL,
  user_id          INT UNSIGNED NOT NULL,
  duty_date        DATE NOT NULL,
  schedule_id      INT UNSIGNED DEFAULT NULL COMMENT 'Rule that generated this row; NULL when assigned by hand',
  status           ENUM('pending','in_progress','completed','skipped') NOT NULL DEFAULT 'pending',
  started_at       DATETIME DEFAULT NULL COMMENT 'UTC',
  completed_at     DATETIME DEFAULT NULL COMMENT 'UTC',
  duration_seconds INT UNSIGNED DEFAULT NULL COMMENT 'Seconds, not minutes -- many duties run under a minute and the point is comparing employees',
  source           ENUM('auto','manual') NOT NULL DEFAULT 'manual',
  assigned_by      INT UNSIGNED DEFAULT NULL,
  note             VARCHAR(500) DEFAULT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_duty_user_date (duty_id, user_id, duty_date),
  FOREIGN KEY (duty_id)     REFERENCES store_duties(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)     REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_id) REFERENCES duty_schedules(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_da_date        (duty_date),
  INDEX idx_da_user_date   (user_id, duty_date),
  INDEX idx_da_status      (status),
  INDEX idx_da_duty_status (duty_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
