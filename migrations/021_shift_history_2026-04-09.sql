-- Shift history table: tracks every shift change per user
CREATE TABLE IF NOT EXISTS shift_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  shift_start TIME NOT NULL,
  shift_hours DECIMAL(3,1) NOT NULL,
  effective_date DATE NOT NULL,
  changed_by INT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_effective (user_id, effective_date)
) ENGINE=InnoDB;

-- Seed existing users' current shifts into shift_history
INSERT INTO shift_history (user_id, shift_start, shift_hours, effective_date)
SELECT id, shift_start, shift_hours, DATE(created_at)
FROM users
WHERE shift_start IS NOT NULL AND shift_hours IS NOT NULL;
