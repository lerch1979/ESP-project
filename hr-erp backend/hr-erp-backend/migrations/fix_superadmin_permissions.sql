-- Give superadmin ALL permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  (SELECT id FROM roles WHERE slug = 'superadmin'),
  id
FROM permissions
ON CONFLICT DO NOTHING;