-- Migration 013: Add manual attendance override support
-- Allows admin to override attendance status for any user/date

ALTER TABLE attendance_logs
  ADD COLUMN is_manual TINYINT(1) NOT NULL DEFAULT 0 AFTER late_login_reason,
  ADD COLUMN manual_status ENUM('present', 'leave', 'half_day', 'official_duty', 'work_from_home') NULL DEFAULT NULL AFTER is_manual,
  ADD COLUMN manual_remark VARCHAR(255) NULL DEFAULT NULL AFTER manual_status,
  ADD COLUMN updated_by INT UNSIGNED NULL DEFAULT NULL AFTER manual_remark,
  ADD INDEX idx_is_manual (is_manual),
  ADD CONSTRAINT fk_attendance_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
