-- Migration 066: Frequent Sick Leave Auto-Detection Trigger
-- When an employee has 3+ approved sick leaves in 30 days:
--   1. Create wellbeing_referral (source=hr_system, target=wellmind)
--   2. Notify the employee (encourage wellbeing assessment)
--   3. Notify HR admin (review recommended)

BEGIN;

-- Add hr_system to allowed source_module values
ALTER TABLE wellbeing_referrals DROP CONSTRAINT IF EXISTS wellbeing_referrals_source_module_check;
ALTER TABLE wellbeing_referrals ADD CONSTRAINT wellbeing_referrals_source_module_check
  CHECK (source_module IN ('wellmind', 'chatbot', 'manager_alert', 'self_service', 'carepath', 'hr_system'));

CREATE OR REPLACE FUNCTION check_frequent_sick_leave()
RETURNS TRIGGER AS $$
DECLARE
  sick_count INTEGER;
  user_contractor_id UUID;
  user_first_name TEXT;
  user_last_name TEXT;
  existing_referral_id UUID;
BEGIN
  -- Only trigger on approved sick leaves
  IF NEW.leave_type != 'sick' OR NEW.status != 'approved' THEN
    RETURN NEW;
  END IF;

  -- Count approved sick leaves in last 30 days for this user
  SELECT COUNT(*) INTO sick_count
  FROM leave_requests
  WHERE user_id = NEW.user_id
    AND leave_type = 'sick'
    AND status = 'approved'
    AND start_date >= CURRENT_DATE - 30;

  -- Only trigger if 3 or more
  IF sick_count < 3 THEN
    RETURN NEW;
  END IF;

  -- Get user details
  SELECT contractor_id, first_name, last_name
  INTO user_contractor_id, user_first_name, user_last_name
  FROM users
  WHERE id = NEW.user_id;

  -- Check if a referral already exists for this user in the last 30 days
  -- (avoid duplicate referrals)
  SELECT id INTO existing_referral_id
  FROM wellbeing_referrals
  WHERE user_id = NEW.user_id
    AND referral_type = 'frequent_sick_leave'
    AND status IN ('pending', 'accepted')
    AND created_at >= NOW() - INTERVAL '30 days'
  LIMIT 1;

  IF existing_referral_id IS NOT NULL THEN
    -- Already has a recent referral, skip
    RETURN NEW;
  END IF;

  -- 1. Create wellbeing referral
  INSERT INTO wellbeing_referrals (
    user_id, contractor_id, source_module, target_module,
    referral_type, urgency_level, referral_reason,
    is_auto_generated, status
  ) VALUES (
    NEW.user_id,
    user_contractor_id,
    'hr_system',
    'wellmind',
    'frequent_sick_leave',
    'medium',
    format('A munkavállaló (%s %s) %s alkalommal volt betegszabadságon az elmúlt 30 napban. Jólléti felmérés javasolt.',
           user_first_name, user_last_name, sick_count),
    TRUE,
    'pending'
  );

  -- 2. Create notification for the employee
  INSERT INTO wellbeing_notifications (
    user_id, contractor_id, notification_type, notification_channel,
    title, message, action_url, priority
  ) VALUES (
    NEW.user_id,
    user_contractor_id,
    'wellbeing_check',
    'in_app',
    'Törődünk a jólléted!',
    'Észrevettük, hogy az utóbbi időben többször voltál betegszabadságon. Kérjük, fontold meg a jólléti felmérés kitöltését, hogy segíthessünk.',
    '/wellmind/assessment',
    'normal'
  );

  -- 3. Create notification for HR admins (all superadmins of this contractor)
  INSERT INTO wellbeing_notifications (
    user_id, contractor_id, notification_type, notification_channel,
    title, message, priority
  )
  SELECT
    u.id,
    user_contractor_id,
    'hr_alert',
    'in_app',
    format('Gyakori betegszabadság: %s %s', user_first_name, user_last_name),
    format('%s %s %s alkalommal volt betegszabadságon az elmúlt 30 napban. Felülvizsgálat javasolt.',
           user_first_name, user_last_name, sick_count),
    'high'
  FROM users u
  JOIN user_roles ur ON u.id = ur.user_id
  JOIN roles r ON ur.role_id = r.id
  WHERE u.contractor_id = user_contractor_id
    AND r.slug IN ('superadmin', 'admin')
    AND u.id != NEW.user_id;

  RAISE NOTICE 'Frequent sick leave trigger fired for user % (% sick leaves in 30 days)',
    NEW.user_id, sick_count;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to leave_requests table
DROP TRIGGER IF EXISTS trg_check_frequent_sick_leave ON leave_requests;
CREATE TRIGGER trg_check_frequent_sick_leave
  AFTER INSERT OR UPDATE ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION check_frequent_sick_leave();

COMMIT;
