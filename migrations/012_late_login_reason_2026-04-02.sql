-- Migration 012: Add late_login_reason to attendance_logs
-- Tracks why a user logged in late (after shift start time)

ALTER TABLE attendance_logs
  ADD COLUMN late_login_reason VARCHAR(255) NULL DEFAULT NULL AFTER logout_reason;
