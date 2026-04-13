-- Portal Calendar Events table
CREATE TABLE IF NOT EXISTS portal_calendar_events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  event_date DATE NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  color VARCHAR(20) NOT NULL DEFAULT 'blue',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_cal_events_user_date (user_id, event_date),
  INDEX idx_cal_events_date (event_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
