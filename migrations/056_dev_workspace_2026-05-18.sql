-- 056: Dev Workspace — developer flag, projects, tasks (2026-05-18)

ALTER TABLE users
  ADD COLUMN is_developer TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS dev_projects (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title          VARCHAR(200) NOT NULL,
  description    TEXT,
  tech_stack     VARCHAR(500),
  status         ENUM('planning','active','on_hold','completed') NOT NULL DEFAULT 'planning',
  client_visible TINYINT(1) NOT NULL DEFAULT 0,
  developer_id   INT UNSIGNED NOT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (developer_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_dev  (developer_id),
  INDEX idx_vis  (client_visible),
  INDEX idx_stat (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dev_tasks (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  title      VARCHAR(300) NOT NULL,
  status     ENUM('todo','in_progress','done') NOT NULL DEFAULT 'todo',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES dev_projects(id) ON DELETE CASCADE,
  INDEX idx_proj (project_id)
) ENGINE=InnoDB;
