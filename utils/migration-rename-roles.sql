-- Active: 1772442997740@@26.14.50.15@3306@taskflow_db
-- ============================================================
-- Migration: Rename CFC→CLIENT, OUR→LOCAL
-- Run this against your existing database BEFORE deploying code
-- ============================================================

-- Step 1: Expand ENUMs to include both old and new values
ALTER TABLE organizations MODIFY COLUMN org_type ENUM('CFC', 'OUR', 'CLIENT', 'LOCAL') NOT NULL;
ALTER TABLE roles MODIFY COLUMN organization_type ENUM('CFC', 'OUR', 'CLIENT', 'LOCAL') NOT NULL;

-- Step 2: Update data from old values to new values
UPDATE organizations SET org_type = 'CLIENT' WHERE org_type = 'CFC';
UPDATE organizations SET org_type = 'LOCAL' WHERE org_type = 'OUR';
UPDATE roles SET organization_type = 'CLIENT' WHERE organization_type = 'CFC';
UPDATE roles SET organization_type = 'LOCAL' WHERE organization_type = 'OUR';

-- Step 3: Update role names
UPDATE roles SET name = 'CLIENT_ADMIN' WHERE name = 'CFC_ADMIN';
UPDATE roles SET name = 'CLIENT_MANAGER' WHERE name = 'CFC_MANAGER';
UPDATE roles SET name = 'LOCAL_ADMIN' WHERE name = 'OUR_ADMIN';
UPDATE roles SET name = 'LOCAL_MANAGER' WHERE name = 'OUR_MANAGER';
UPDATE roles SET name = 'LOCAL_USER' WHERE name = 'OUR_USER';

-- Step 4: Update organization names
UPDATE organizations SET name = 'Client Corporation' WHERE name = 'CFC Corporation';
UPDATE organizations SET name = 'Local Execution Team' WHERE name = 'Our Execution Team';

-- Step 5: Shrink ENUMs to only new values
ALTER TABLE organizations MODIFY COLUMN org_type ENUM('CLIENT', 'LOCAL') NOT NULL;
ALTER TABLE roles MODIFY COLUMN organization_type ENUM('CLIENT', 'LOCAL') NOT NULL;
