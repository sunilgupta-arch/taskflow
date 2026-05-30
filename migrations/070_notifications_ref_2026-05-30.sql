-- Add ref_type and ref_id to notifications so notifications can be
-- auto-cleared when the referenced item is handled (leave approved,
-- request picked, chat conversation read, etc.)
ALTER TABLE notifications
  ADD COLUMN ref_type VARCHAR(50) DEFAULT NULL AFTER link,
  ADD COLUMN ref_id   INT UNSIGNED DEFAULT NULL AFTER ref_type,
  ADD INDEX idx_notif_ref (ref_type, ref_id);
