-- Migration 011: Add logout_reason to attendance_logs
-- Tracks why a user logged out (especially during active shift)

ALTER TABLE attendance_logs
  ADD COLUMN logout_reason VARCHAR(255) NULL DEFAULT NULL AFTER logout_time;
