-- Migration 019: Add CLIENT_USER role
INSERT IGNORE INTO roles (name, organization_type) VALUES ('CLIENT_USER', 'CLIENT');
