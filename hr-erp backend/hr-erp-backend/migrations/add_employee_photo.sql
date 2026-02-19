-- Add profile photo support to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS profile_photo_url VARCHAR(500) DEFAULT NULL;
