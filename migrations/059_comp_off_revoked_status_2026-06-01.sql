-- Migration 059: Add 'revoked' status to comp_off_credits
-- Allows admins/managers to revoke an incorrectly earned comp-off credit

ALTER TABLE comp_off_credits
  MODIFY COLUMN status ENUM('available', 'used', 'revoked') NOT NULL DEFAULT 'available';
