ALTER TABLE downloads
  ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0 AFTER is_disabled;
