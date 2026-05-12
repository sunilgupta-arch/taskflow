-- Track when a task was completed after its scheduled date (late / delayed done)
ALTER TABLE client_request_instances
  ADD COLUMN completed_late TINYINT(1) NOT NULL DEFAULT 0 AFTER completed_at;
