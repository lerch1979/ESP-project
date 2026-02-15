-- Seed notification templates for bulk email system
-- Using WHERE NOT EXISTS for idempotency (contractor_id is NULL so unique constraint won't catch duplicates)

INSERT INTO notification_templates (name, slug, subject, body_html, body_text, event_type, language, is_active)
SELECT 'Szerződés lejárat', 'contract_expiry', 'Szerződés lejárati értesítés',
  '<p>Kedves {{name}},</p><p>Ezúton értesítjük, hogy a(z) <strong>{{workplace}}</strong> munkahelyen fennálló szerződése <strong>{{contract_end}}</strong> napon lejár.</p><p>Kérjük, vegye fel a kapcsolatot a HR osztállyal a szerződés megújítása érdekében.</p><p>Üdvözlettel,<br/>HR-ERP Rendszer</p>',
  'Kedves {{name}}, Ezúton értesítjük, hogy a(z) {{workplace}} munkahelyen fennálló szerződése {{contract_end}} napon lejár. Kérjük, vegye fel a kapcsolatot a HR osztállyal a szerződés megújítása érdekében.',
  'contract_expiry', 'hu', true
WHERE NOT EXISTS (SELECT 1 FROM notification_templates WHERE slug = 'contract_expiry' AND language = 'hu' AND contractor_id IS NULL);

INSERT INTO notification_templates (name, slug, subject, body_html, body_text, event_type, language, is_active)
SELECT 'Vízum lejárat', 'visa_expiry', 'Vízum lejárati értesítés',
  '<p>Kedves {{name}},</p><p>Ezúton értesítjük, hogy a vízuma <strong>{{visa_expiry}}</strong> napon lejár.</p><p>Kérjük, mielőbb intézkedjen a vízum megújításáról, és értesítse a HR osztályt a folyamatról.</p><p>Üdvözlettel,<br/>HR-ERP Rendszer</p>',
  'Kedves {{name}}, Ezúton értesítjük, hogy a vízuma {{visa_expiry}} napon lejár. Kérjük, mielőbb intézkedjen a vízum megújításáról.',
  'visa_expiry', 'hu', true
WHERE NOT EXISTS (SELECT 1 FROM notification_templates WHERE slug = 'visa_expiry' AND language = 'hu' AND contractor_id IS NULL);

INSERT INTO notification_templates (name, slug, subject, body_html, body_text, event_type, language, is_active)
SELECT 'Szálláshely felmérés', 'accommodation_survey', 'Szálláshely értesítés',
  '<p>Kedves {{name}},</p><p>A(z) <strong>{{accommodation}}</strong> szálláshellyel kapcsolatban szeretnénk tájékoztatni.</p><p>Kérjük, olvassa el az alábbi információkat, és szükség esetén vegye fel a kapcsolatot a szálláshely kezelőjével.</p><p>Üdvözlettel,<br/>HR-ERP Rendszer</p>',
  'Kedves {{name}}, A(z) {{accommodation}} szálláshellyel kapcsolatban szeretnénk tájékoztatni.',
  'accommodation_survey', 'hu', true
WHERE NOT EXISTS (SELECT 1 FROM notification_templates WHERE slug = 'accommodation_survey' AND language = 'hu' AND contractor_id IS NULL);

INSERT INTO notification_templates (name, slug, subject, body_html, body_text, event_type, language, is_active)
SELECT 'Általános értesítés', 'general', '{{subject}}',
  '{{body}}',
  '{{body}}',
  'general', 'hu', true
WHERE NOT EXISTS (SELECT 1 FROM notification_templates WHERE slug = 'general' AND language = 'hu' AND contractor_id IS NULL);
