-- Migration 052: Comp-off credit system
-- Adds comp_off_credits table and extends attendance_logs.manual_status

ALTER TABLE attendance_logs
  MODIFY COLUMN manual_status ENUM(
    'present','leave','half_day','official_duty','work_from_home','holiday',
    'check_in','comp_off'
  ) NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS comp_off_credits (
  id           INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED    NOT NULL,
  earned_date  DATE            NOT NULL,
  applied_to_date DATE         NULL DEFAULT NULL,
  status       ENUM('available','used') NOT NULL DEFAULT 'available',
  created_at   TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_status (user_id, status),
  INDEX idx_earned_date (earned_date)
) ENGINE=InnoDB;
