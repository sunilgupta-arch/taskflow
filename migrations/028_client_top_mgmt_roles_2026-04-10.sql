-- Add two new client roles: CLIENT_TOP_MGMT and CLIENT_MGMT
INSERT INTO roles (name, organization_type) VALUES ('CLIENT_TOP_MGMT', 'CLIENT');
INSERT INTO roles (name, organization_type) VALUES ('CLIENT_MGMT', 'CLIENT');
