-- Migration 029: Add delegated support user for client portal
-- LOCAL_ADMIN can delegate a secondary support person for client communication

ALTER TABLE organizations ADD COLUMN delegated_support_id INT UNSIGNED NULL DEFAULT NULL AFTER timezone;
ALTER TABLE organizations ADD CONSTRAINT fk_org_delegated_support FOREIGN KEY (delegated_support_id) REFERENCES users(id) ON DELETE SET NULL;
