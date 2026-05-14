-- Add approve/reject workflow to client_request_instances
-- Clients can approve or reject a 'done' instance.
-- Rejected → resets to 'open' so local staff can redo it.
-- Approved → final closed state.

ALTER TABLE client_request_instances
  MODIFY COLUMN status ENUM('open','picked','done','missed','cancelled','approved','rejected')
    NOT NULL DEFAULT 'open';

ALTER TABLE client_request_instances
  ADD COLUMN approved_by  INT UNSIGNED NULL AFTER completed_late,
  ADD COLUMN approved_at  DATETIME     NULL AFTER approved_by,
  ADD COLUMN rejected_by  INT UNSIGNED NULL AFTER approved_at,
  ADD COLUMN rejected_at  DATETIME     NULL AFTER rejected_by;

ALTER TABLE client_request_instances
  ADD CONSTRAINT fk_cri_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_cri_rejected_by FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL;
