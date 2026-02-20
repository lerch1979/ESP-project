-- Add link column to notifications table for navigation URLs
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS link VARCHAR(500);

-- Seed sample notifications for admin user
-- First, get the admin user id
DO $$
DECLARE
  admin_id UUID;
BEGIN
  SELECT u.id INTO admin_id
  FROM users u
  JOIN user_roles ur ON u.id = ur.user_id
  JOIN roles r ON ur.role_id = r.id
  WHERE r.slug IN ('superadmin', 'admin')
  LIMIT 1;

  IF admin_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, message, link, is_read, created_at)
    VALUES
      (admin_id, 'warning', 'Vizum lejarat figyelmezetes', 'Kovacs Janos vizuma 7 napon belul lejar. Kerjuk intezkedjen!', '/employees', false, NOW() - INTERVAL '2 minutes'),
      (admin_id, 'warning', 'Vizum lejarat figyelmezetes', 'Horvath Peter vizuma 14 napon belul lejar.', '/employees', false, NOW() - INTERVAL '1 hour'),
      (admin_id, 'info', 'Uj hibajegy erkezett', 'Csotores a 3. emeleti furdoszobaban (#TKT-0042)', '/tickets', false, NOW() - INTERVAL '3 hours'),
      (admin_id, 'success', 'Hibajegy lezarva', 'A "Futes javitas" hibajegy sikeresen lezarva (#TKT-0038)', '/tickets', true, NOW() - INTERVAL '1 day'),
      (admin_id, 'info', 'Uj munkavallalos regisztralt', 'Nagy Maria sikeresen regisztralt a rendszerbe.', '/employees', false, NOW() - INTERVAL '2 days'),
      (admin_id, 'warning', 'Szerzodes lejarat', 'Szabo Istvan szerzodese 30 napon belul lejar.', '/employees', true, NOW() - INTERVAL '3 days'),
      (admin_id, 'info', 'Szallashely kapacitas', 'A Deak Ferenc utca 12. szallashely 90%%-os kihasznaltsagon van.', '/accommodations', false, NOW() - INTERVAL '4 days'),
      (admin_id, 'success', 'Export kesz', 'A munkavallaloi export sikeresen elkeszult.', NULL, true, NOW() - INTERVAL '5 days');
  END IF;
END $$;
