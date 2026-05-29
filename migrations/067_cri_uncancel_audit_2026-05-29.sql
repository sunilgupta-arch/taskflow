-- Track who restored a cancelled client request instance and when
ALTER TABLE client_request_instances
  ADD COLUMN uncancelled_by INT UNSIGNED NULL AFTER cancelled_at,
  ADD COLUMN uncancelled_at DATETIME NULL AFTER uncancelled_by,
  ADD CONSTRAINT fk_cri_uncancelled_by FOREIGN KEY (uncancelled_by) REFERENCES users(id) ON DELETE SET NULL;
