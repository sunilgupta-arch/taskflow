-- 058: Dev Workspace enhancements (2026-05-18)
-- Due dates + priority on tasks, milestones, links, updates, comments, releases

ALTER TABLE dev_projects ADD COLUMN due_date DATE DEFAULT NULL;

ALTER TABLE dev_tasks ADD COLUMN due_date  DATE DEFAULT NULL;
ALTER TABLE dev_tasks ADD COLUMN priority  ENUM('high','medium','low') NOT NULL DEFAULT 'medium';
ALTER TABLE dev_tasks ADD COLUMN milestone_id INT UNSIGNED DEFAULT NULL;

CREATE TABLE IF NOT EXISTS dev_milestones (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  title      VARCHAR(200) NOT NULL,
  due_date   DATE DEFAULT NULL,
  status     ENUM('open','completed') NOT NULL DEFAULT 'open',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES dev_projects(id) ON DELETE CASCADE,
  INDEX idx_proj (project_id)
) ENGINE=InnoDB;

ALTER TABLE dev_tasks ADD FOREIGN KEY fk_task_milestone (milestone_id) REFERENCES dev_milestones(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS dev_project_links (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  label      VARCHAR(100) NOT NULL,
  url        VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES dev_projects(id) ON DELETE CASCADE,
  INDEX idx_proj (project_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dev_project_updates (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES dev_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)         ON DELETE CASCADE,
  INDEX idx_proj (project_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dev_project_comments (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  body       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES dev_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)         ON DELETE CASCADE,
  INDEX idx_proj (project_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dev_releases (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id  INT UNSIGNED NOT NULL,
  version     VARCHAR(50)  NOT NULL,
  environment ENUM('development','staging','production') NOT NULL DEFAULT 'staging',
  notes       TEXT,
  released_by INT UNSIGNED NOT NULL,
  released_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id)  REFERENCES dev_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (released_by) REFERENCES users(id)         ON DELETE CASCADE,
  INDEX idx_proj (project_id)
) ENGINE=InnoDB;
