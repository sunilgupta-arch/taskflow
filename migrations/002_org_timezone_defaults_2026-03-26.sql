-- Set correct timezone defaults for organizations
UPDATE organizations SET timezone = 'Asia/Kolkata' WHERE org_type = 'LOCAL' AND timezone = 'UTC';
UPDATE organizations SET timezone = 'America/New_York' WHERE org_type = 'CLIENT' AND timezone = 'UTC';
