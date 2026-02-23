-- Migration: Email Templates (Email sablonok kezelése)
-- Dátum: 2026-02-23

-- 1. email_templates tábla létrehozása
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body TEXT NOT NULL,
    template_type VARCHAR(50) DEFAULT 'custom',
    variables JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    contractor_id UUID REFERENCES contractors(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Indexek
CREATE INDEX IF NOT EXISTS idx_email_templates_slug ON email_templates(slug);
CREATE INDEX IF NOT EXISTS idx_email_templates_type ON email_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_email_templates_contractor ON email_templates(contractor_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active);

-- 3. updated_at trigger
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'update_email_templates_updated_at'
    ) THEN
        CREATE TRIGGER update_email_templates_updated_at
            BEFORE UPDATE ON email_templates
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END
$$;

-- 4. Alapértelmezett email sablonok (rendszer szintű, contractor_id = NULL)
INSERT INTO email_templates (name, slug, subject, body, template_type, variables, is_active)
VALUES
(
    'Új munkavállaló üdvözlő',
    'welcome_employee',
    'Üdvözöljük a {{company_name}} csapatában!',
    'Kedves {{employee_name}}!

Örömmel értesítünk, hogy felvételt nyertél a {{company_name}} csapatába.

Munkavállalói adataid:
- Munkavállalói szám: {{employee_number}}
- Email: {{employee_email}}
- Belépés dátuma: {{start_date}}
- Pozíció: {{position}}
- Munkahely: {{workplace}}

További információkért látogasd meg a portálunkat.

Üdvözlettel,
{{company_name}} HR csapat',
    'welcome',
    '["employee_name", "employee_email", "employee_number", "company_name", "start_date", "position", "workplace"]'::jsonb,
    true
),
(
    'Hibajegy létrehozva',
    'ticket_created',
    'Hibajegy létrehozva: {{ticket_number}} - {{ticket_title}}',
    'Kedves {{employee_name}}!

A hibajegyed sikeresen létrejött.

Jegy adatok:
- Szám: {{ticket_number}}
- Tárgy: {{ticket_title}}
- Kategória: {{category}}
- Prioritás: {{priority}}
- Leírás: {{description}}

Hamarosan foglalkozunk a problémával. A jegy állapotáról értesítést fogsz kapni.

Üdvözlettel,
Ügyfélszolgálat',
    'ticket_created',
    '["employee_name", "ticket_number", "ticket_title", "category", "priority", "description"]'::jsonb,
    true
),
(
    'Hibajegy státusz változás',
    'ticket_status_changed',
    'Hibajegy frissítve: {{ticket_number}} - {{new_status}}',
    'Kedves {{employee_name}}!

A(z) {{ticket_number}} számú hibajegyed státusza megváltozott.

- Jegy száma: {{ticket_number}}
- Tárgy: {{ticket_title}}
- Előző státusz: {{old_status}}
- Új státusz: {{new_status}}
- Megjegyzés: {{comment}}

Üdvözlettel,
Ügyfélszolgálat',
    'ticket_status_changed',
    '["employee_name", "ticket_number", "ticket_title", "old_status", "new_status", "comment"]'::jsonb,
    true
),
(
    'Jelszó visszaállítás',
    'password_reset',
    'Jelszó visszaállítási kérelem',
    'Kedves {{employee_name}}!

Jelszó visszaállítási kérelmet kaptunk a fiókodhoz.

Kattints az alábbi linkre a jelszavad megváltoztatásához:
{{reset_link}}

A link {{expiry_hours}} órán belül lejár.

Ha nem te kérted a jelszó visszaállítást, kérjük figyelmen kívül hagyni ezt az emailt.

Üdvözlettel,
{{company_name}}',
    'password_reset',
    '["employee_name", "reset_link", "expiry_hours", "company_name"]'::jsonb,
    true
),
(
    'Szállás hozzárendelés',
    'accommodation_assigned',
    'Szállás hozzárendelve: {{accommodation_name}}',
    'Kedves {{employee_name}}!

Szállás lett hozzárendelve a profilodhoz.

Szállás adatok:
- Szálláshely: {{accommodation_name}}
- Cím: {{accommodation_address}}
- Szoba: {{room_number}}
- Beköltözés dátuma: {{check_in_date}}

Kérjük, ismerkedj meg a házirenddel a beköltözés előtt.

Üdvözlettel,
{{company_name}} HR csapat',
    'accommodation_assigned',
    '["employee_name", "accommodation_name", "accommodation_address", "room_number", "check_in_date", "company_name"]'::jsonb,
    true
),
(
    'Dokumentum feltöltés értesítés',
    'document_uploaded',
    'Új dokumentum feltöltve: {{document_type}}',
    'Kedves {{employee_name}}!

Új dokumentum lett feltöltve a profilodhoz.

Dokumentum adatok:
- Típus: {{document_type}}
- Fájlnév: {{file_name}}
- Feltöltő: {{uploaded_by}}
- Dátum: {{upload_date}}

A dokumentumot a profilod Dokumentumok fülén tekintheted meg.

Üdvözlettel,
{{company_name}} HR csapat',
    'document_uploaded',
    '["employee_name", "document_type", "file_name", "uploaded_by", "upload_date", "company_name"]'::jsonb,
    true
),
(
    'Munkaviszony megszűnés',
    'employment_terminated',
    'Munkaviszony megszűnés - {{employee_name}}',
    'Kedves {{employee_name}}!

Ezúton értesítünk, hogy a munkaviszonyd a(z) {{company_name}} cégnél {{end_date}} nappal megszűnik.

Kilépési teendők:
- Kulcsok, kártyák leadása
- Szálláshely elhagyása (ha releváns)
- Utolsó elszámolás: {{settlement_date}}

Kérdés esetén keresd a HR osztályt.

Üdvözlettel,
{{company_name}} HR csapat',
    'employment_terminated',
    '["employee_name", "company_name", "end_date", "settlement_date"]'::jsonb,
    true
),
(
    'Szabadság jóváhagyás',
    'leave_approved',
    'Szabadság jóváhagyva: {{leave_start}} - {{leave_end}}',
    'Kedves {{employee_name}}!

A szabadság kérelmed jóváhagyásra került.

Szabadság adatok:
- Kezdés: {{leave_start}}
- Befejezés: {{leave_end}}
- Típus: {{leave_type}}
- Jóváhagyta: {{approved_by}}

Jó pihenést kívánunk!

Üdvözlettel,
{{company_name}} HR csapat',
    'leave_approved',
    '["employee_name", "leave_start", "leave_end", "leave_type", "approved_by", "company_name"]'::jsonb,
    true
)
ON CONFLICT (slug) DO NOTHING;
