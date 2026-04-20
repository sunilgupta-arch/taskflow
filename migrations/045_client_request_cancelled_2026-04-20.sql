-- Add 'cancelled' status to client_request_instances
ALTER TABLE client_request_instances
  MODIFY COLUMN status ENUM('open', 'picked', 'done', 'missed', 'cancelled') DEFAULT 'open';
