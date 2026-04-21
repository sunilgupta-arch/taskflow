ALTER TABLE users
  ADD COLUMN visible_to_client TINYINT(1) NOT NULL DEFAULT 1
  AFTER is_active;
