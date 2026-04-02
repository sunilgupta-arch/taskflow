-- Migration 010: System chat support
-- Adds 'system' conversation type and creates a system user for automated messages

-- Add 'system' to conversation type enum
ALTER TABLE chat_conversations MODIFY COLUMN type ENUM('direct', 'group', 'system') NOT NULL DEFAULT 'direct';

-- Create system user (if not exists)
-- Uses a dedicated role-less approach: org_id=1, role_id=1 (will be ignored in queries)
INSERT INTO users (name, email, password, organization_id, role_id, is_active)
SELECT 'System', 'system@taskflow.local', 'NOLOGIN',
       (SELECT id FROM organizations LIMIT 1),
       (SELECT id FROM roles LIMIT 1),
       0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'system@taskflow.local');
