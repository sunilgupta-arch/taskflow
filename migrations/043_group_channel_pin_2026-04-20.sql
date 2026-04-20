-- Group Channel: pinned messages (admin-only)
ALTER TABLE group_channel_messages
  ADD COLUMN is_pinned TINYINT(1) DEFAULT 0 AFTER is_deleted,
  ADD COLUMN pinned_at TIMESTAMP NULL AFTER is_pinned,
  ADD COLUMN pinned_by INT UNSIGNED NULL AFTER pinned_at,
  ADD INDEX idx_gc_pinned (is_pinned);
