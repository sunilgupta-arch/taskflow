-- Migration 036: Add CLIENT_SALES role
INSERT INTO roles (name, organization_type) VALUES ('CLIENT_SALES', 'CLIENT');
