-- Add role_id to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id);

-- Set Kiss János as superadmin
UPDATE users 
SET role_id = (SELECT id FROM roles WHERE slug = 'superadmin')
WHERE email = 'kiss.janos@abc-kft.hu';

-- Set all other users to admin role (default)
UPDATE users 
SET role_id = (SELECT id FROM roles WHERE slug = 'admin')
WHERE role_id IS NULL;