-- Add instance-level assigned_to to client_request_instances (used for rescheduled instances)
ALTER TABLE client_request_instances
  ADD COLUMN assigned_to INT UNSIGNED NULL DEFAULT NULL AFTER status,
  ADD CONSTRAINT fk_cri_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;
