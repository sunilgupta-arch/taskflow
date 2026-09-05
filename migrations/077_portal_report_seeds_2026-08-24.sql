-- Tracks which developer-managed default links (config/portalDefaultLinks.json)
-- have already been handed to a user.
--
-- A row here is permanent: it records that the user has *seen* the link, not
-- that they still have it. That is what makes a user's delete stick — the link
-- is not re-seeded on their next visit.
CREATE TABLE IF NOT EXISTS portal_report_seeds (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  source_key VARCHAR(191) NOT NULL,
  seeded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_portal_report_seed (user_id, source_key),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
