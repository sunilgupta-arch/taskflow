CREATE TABLE IF NOT EXISTS downloads (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(255)  NOT NULL,
  description     TEXT,
  version         VARCHAR(50)   DEFAULT NULL,
  original_name   VARCHAR(255)  NOT NULL,
  stored_name     VARCHAR(255)  NOT NULL,
  file_size       BIGINT        NOT NULL DEFAULT 0,
  mime_type       VARCHAR(120)  NOT NULL DEFAULT '',
  uploaded_by     INT UNSIGNED  NOT NULL,
  uploader_name   VARCHAR(150)  NOT NULL,
  uploader_side   ENUM('LOCAL','CLIENT') NOT NULL DEFAULT 'LOCAL',
  download_count  INT           NOT NULL DEFAULT 0,
  is_disabled     TINYINT(1)    NOT NULL DEFAULT 0,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_downloads_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
