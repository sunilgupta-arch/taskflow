-- Client Requests: templates created by portal (client) users
CREATE TABLE IF NOT EXISTS client_requests (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  org_id INT UNSIGNED NOT NULL,
  created_by INT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  task_type VARCHAR(100) NOT NULL DEFAULT 'General',
  description TEXT,
  priority ENUM('normal', 'high', 'urgent') DEFAULT 'normal',
  recurrence ENUM('none', 'daily', 'weekly', 'monthly') DEFAULT 'none',
  recurrence_days VARCHAR(20) DEFAULT NULL,
  start_date DATE NOT NULL,
  recurrence_end_date DATE DEFAULT NULL,
  due_time TIME DEFAULT NULL,
  assigned_to INT UNSIGNED DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (assigned_to) REFERENCES users(id),
  INDEX idx_cr_org (org_id),
  INDEX idx_cr_start (start_date),
  INDEX idx_cr_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Client Request Instances: one row per day per request
CREATE TABLE IF NOT EXISTS client_request_instances (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id INT UNSIGNED NOT NULL,
  instance_date DATE NOT NULL,
  status ENUM('open', 'picked', 'done', 'missed') DEFAULT 'open',
  picked_by INT UNSIGNED DEFAULT NULL,
  picked_at DATETIME DEFAULT NULL,
  completed_by INT UNSIGNED DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_request_date (request_id, instance_date),
  FOREIGN KEY (request_id) REFERENCES client_requests(id),
  FOREIGN KEY (picked_by) REFERENCES users(id),
  FOREIGN KEY (completed_by) REFERENCES users(id),
  INDEX idx_cri_date (instance_date),
  INDEX idx_cri_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Release history: when local user releases task back to open queue
CREATE TABLE IF NOT EXISTS client_request_releases (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instance_id INT UNSIGNED NOT NULL,
  released_by INT UNSIGNED NOT NULL,
  reason TEXT,
  released_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (instance_id) REFERENCES client_request_instances(id),
  FOREIGN KEY (released_by) REFERENCES users(id),
  INDEX idx_crr_instance (instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comments on an instance (from local users or client portal users)
CREATE TABLE IF NOT EXISTS client_request_comments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  instance_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (instance_id) REFERENCES client_request_instances(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_crc_instance (instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
