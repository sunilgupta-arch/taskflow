CREATE TABLE IF NOT EXISTS client_request_comment_files (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  comment_id     INT UNSIGNED NOT NULL,
  uploaded_by    INT UNSIGNED NOT NULL,
  file_name      VARCHAR(255) NOT NULL,
  mime_type      VARCHAR(100),
  drive_file_id  VARCHAR(150) NOT NULL,
  drive_view_link TEXT,
  file_size      INT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (comment_id)  REFERENCES client_request_comments(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id)
);
