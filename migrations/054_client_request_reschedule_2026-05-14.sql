-- Add reschedule workflow to client_request_instances
-- Any local user can reschedule an open request to a future date with a reason.
-- The original instance gets status 'rescheduled'; a new instance is created for the new date.

ALTER TABLE client_request_instances
  MODIFY COLUMN status ENUM('open','picked','done','missed','cancelled','approved','rejected','rescheduled')
    NOT NULL DEFAULT 'open';

ALTER TABLE client_request_instances
  ADD COLUMN rescheduled_to          DATE         NULL AFTER rejected_at,
  ADD COLUMN rescheduled_by          INT UNSIGNED NULL AFTER rescheduled_to,
  ADD COLUMN rescheduled_instance_id INT UNSIGNED NULL AFTER rescheduled_by;

ALTER TABLE client_request_instances
  ADD CONSTRAINT fk_cri_rescheduled_by FOREIGN KEY (rescheduled_by) REFERENCES users(id) ON DELETE SET NULL;
