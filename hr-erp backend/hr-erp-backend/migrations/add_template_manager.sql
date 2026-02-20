-- Add available_variables column to existing notification_templates table
ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS available_variables JSONB DEFAULT '[]';

-- Backfill existing templates with their known variables
UPDATE notification_templates SET available_variables = '["name", "workplace", "contract_end"]' WHERE slug = 'contract_expiry';
UPDATE notification_templates SET available_variables = '["name", "visa_expiry"]' WHERE slug = 'visa_expiry';
UPDATE notification_templates SET available_variables = '["name", "accommodation"]' WHERE slug = 'accommodation_survey';
UPDATE notification_templates SET available_variables = '["subject", "body"]' WHERE slug = 'general';
