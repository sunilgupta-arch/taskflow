-- Add cancelled_by and cancelled_at audit columns to client_request_instances
ALTER TABLE client_request_instances
  ADD COLUMN cancelled_by INT UNSIGNED NULL AFTER status,
  ADD COLUMN cancelled_at DATETIME NULL AFTER cancelled_by,
  ADD CONSTRAINT fk_cri_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON DELETE SET NULL;
