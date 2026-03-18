-- Migration 067: Conflict Tracking — categories, trigger, analytics view

BEGIN;

-- ── Add conflict-related ticket categories ──────────────────────────

INSERT INTO ticket_categories (id, name, slug) VALUES
  (gen_random_uuid(), 'Panasz', 'complaint'),
  (gen_random_uuid(), 'Konfliktus', 'conflict'),
  (gen_random_uuid(), 'Eszkaláció', 'escalation'),
  (gen_random_uuid(), 'Zaklatás', 'harassment'),
  (gen_random_uuid(), 'Munkavédelem', 'workplace_safety')
ON CONFLICT DO NOTHING;

-- ── Critical Ticket Alert Trigger ───────────────────────────────────

-- Add ticket_system to referral source_module constraint
ALTER TABLE wellbeing_referrals DROP CONSTRAINT IF EXISTS wellbeing_referrals_source_module_check;
ALTER TABLE wellbeing_referrals ADD CONSTRAINT wellbeing_referrals_source_module_check
  CHECK (source_module IN ('wellmind', 'chatbot', 'manager_alert', 'self_service', 'carepath', 'hr_system', 'ticket_system'));

CREATE OR REPLACE FUNCTION alert_critical_ticket()
RETURNS TRIGGER AS $$
DECLARE
  cat_slug TEXT;
  cat_name TEXT;
  ticket_number TEXT;
  user_contractor_id UUID;
  user_first TEXT;
  user_last TEXT;
BEGIN
  -- Get category slug
  SELECT slug, name INTO cat_slug, cat_name
  FROM ticket_categories WHERE id = NEW.category_id;

  -- Only fire for critical categories
  IF cat_slug NOT IN ('harassment', 'escalation') THEN
    RETURN NEW;
  END IF;

  -- Get user info
  SELECT contractor_id, first_name, last_name
  INTO user_contractor_id, user_first, user_last
  FROM users WHERE id = NEW.created_by;

  ticket_number := COALESCE(NEW.ticket_number, NEW.id::TEXT);

  -- 1. Notify all HR/admin users
  INSERT INTO wellbeing_notifications (
    user_id, contractor_id, notification_type, notification_channel,
    title, message, priority
  )
  SELECT u.id, user_contractor_id, 'critical_ticket', 'in_app',
    format('Kritikus jegy: %s', cat_name),
    format('Kritikus jegy (#%s) érkezett. Kategória: %s. Azonnali intézkedés szükséges.',
           ticket_number, cat_name),
    'urgent'
  FROM users u
  JOIN user_roles ur ON u.id = ur.user_id
  JOIN roles r ON ur.role_id = r.id
  WHERE u.contractor_id = user_contractor_id
    AND r.slug IN ('superadmin', 'admin');

  -- 2. Create CarePath referral for ticket creator
  INSERT INTO wellbeing_referrals (
    user_id, contractor_id, source_module, source_record_id, target_module,
    referral_type, urgency_level, referral_reason, is_auto_generated, status
  ) VALUES (
    NEW.created_by, user_contractor_id, 'ticket_system', NEW.id, 'carepath',
    'critical_incident', 'crisis',
    format('Munkavállaló kritikus incidensben érintett (Kategória: %s, Jegy: #%s). Azonnali támogatás javasolt.',
           cat_name, ticket_number),
    TRUE, 'pending'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alert_critical_ticket ON tickets;
CREATE TRIGGER trg_alert_critical_ticket
  AFTER INSERT ON tickets
  FOR EACH ROW EXECUTE FUNCTION alert_critical_ticket();

-- ── Conflict-Wellbeing Correlation View ─────────────────────────────

CREATE OR REPLACE VIEW v_conflict_wellbeing_correlation AS
SELECT
  t.contractor_id,
  DATE_TRUNC('week', t.created_at)::DATE AS week,
  COUNT(*) FILTER (WHERE tc.slug IN ('complaint', 'conflict', 'escalation', 'harassment', 'workplace_safety'))
    AS conflict_count,
  tm.avg_mood_score AS team_avg_mood,
  tm.avg_stress_level AS team_avg_stress,
  tm.employee_count
FROM tickets t
JOIN ticket_categories tc ON t.category_id = tc.id
LEFT JOIN wellmind_team_metrics tm
  ON t.contractor_id = tm.contractor_id
  AND tm.metric_date BETWEEN DATE_TRUNC('week', t.created_at)::DATE
    AND DATE_TRUNC('week', t.created_at)::DATE + 6
WHERE tc.slug IN ('complaint', 'conflict', 'escalation', 'harassment', 'workplace_safety')
  AND t.created_at >= CURRENT_DATE - 365
GROUP BY t.contractor_id, week, tm.avg_mood_score, tm.avg_stress_level, tm.employee_count
ORDER BY week DESC;

COMMIT;
