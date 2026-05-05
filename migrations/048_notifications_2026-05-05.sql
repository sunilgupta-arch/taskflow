CREATE TABLE IF NOT EXISTS notifications (
  id         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED    NOT NULL,
  type       VARCHAR(50)     NOT NULL,
  title      VARCHAR(255)    NOT NULL,
  body       VARCHAR(500)    DEFAULT NULL,
  link       VARCHAR(255)    DEFAULT NULL,
  is_read    TINYINT(1)      NOT NULL DEFAULT 0,
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_user_unread (user_id, is_read, created_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
