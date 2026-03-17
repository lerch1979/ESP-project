# Wellbeing Platform - Extension Features Plan

## KRITIKUS FEATURE-ÖK (PRIORITY 1)

### 1. HOUSING CLEANLINESS TRACKING

**Célja:** Szállás minőség vs wellbeing korreláció mérése (Housing Solutions Kft specifikus)

**Database Schema:**
```sql
CREATE TABLE housing_cleanliness_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  contractor_id UUID REFERENCES contractors(id) ON DELETE CASCADE,
  inspection_date DATE NOT NULL,
  room_cleanliness_score INTEGER CHECK (room_cleanliness_score BETWEEN 1 AND 10),
  common_area_score INTEGER CHECK (common_area_score BETWEEN 1 AND 10),
  bathroom_score INTEGER CHECK (bathroom_score BETWEEN 1 AND 10),
  kitchen_score INTEGER CHECK (kitchen_score BETWEEN 1 AND 10),
  overall_score DECIMAL(3,2) GENERATED ALWAYS AS (
    (room_cleanliness_score + common_area_score + bathroom_score + kitchen_score) / 4.0
  ) STORED,
  inspector_id UUID REFERENCES users(id),
  inspector_notes TEXT,
  corrective_actions_taken TEXT,
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_housing_user_date ON housing_cleanliness_inspections(user_id, inspection_date DESC);
CREATE INDEX idx_housing_contractor ON housing_cleanliness_inspections(contractor_id, inspection_date DESC);
CREATE INDEX idx_housing_followup ON housing_cleanliness_inspections(follow_up_required, follow_up_date)
  WHERE follow_up_required = true;
```

**Analytics Query:**
```sql
-- Cleanliness vs Wellbeing Correlation
SELECT
  CASE
    WHEN h.overall_score >= 8 THEN 'Clean'
    WHEN h.overall_score >= 5 THEN 'Average'
    ELSE 'Poor'
  END AS housing_quality,
  AVG(p.mood_score) AS avg_mood,
  AVG(p.stress_level) AS avg_stress,
  AVG(p.sleep_quality) AS avg_sleep_quality,
  COUNT(DISTINCT p.user_id) AS employee_count
FROM housing_cleanliness_inspections h
JOIN wellmind_pulse_surveys p ON h.user_id = p.user_id
  AND p.survey_date BETWEEN h.inspection_date AND h.inspection_date + 7
GROUP BY housing_quality
HAVING COUNT(DISTINCT p.user_id) >= 5;
```

**Frontend Requirements:**
- Admin UI: Housing Inspection Management page
- Mobile: Housing condition self-report option (employee feedback)
- Dashboard: Cleanliness → Wellbeing correlation chart

---

### 2. OVERTIME TRACKING & ANALYTICS

**Célja:** Túlóra hatása burnout-ra és wellbeing-re

**Existing Data Sources:**
- `tickets` table: `hours_worked` field
- `projects` table: project hours
- `timesheets` table (if exists)

**New View:**
```sql
CREATE VIEW v_employee_overtime AS
SELECT
  u.id AS user_id,
  u.contractor_id,
  DATE_TRUNC('month', t.created_at) AS month,
  SUM(COALESCE(t.hours_worked, 0)) AS total_hours_worked,
  COUNT(DISTINCT DATE(t.created_at)) AS days_worked,
  (SUM(COALESCE(t.hours_worked, 0)) - COUNT(DISTINCT DATE(t.created_at)) * 8) AS overtime_hours,
  CASE
    WHEN (SUM(COALESCE(t.hours_worked, 0)) - COUNT(DISTINCT DATE(t.created_at)) * 8) > 40 THEN 'Heavy Overtime'
    WHEN (SUM(COALESCE(t.hours_worked, 0)) - COUNT(DISTINCT DATE(t.created_at)) * 8) > 20 THEN 'Moderate Overtime'
    ELSE 'Normal Hours'
  END AS overtime_category
FROM users u
LEFT JOIN tickets t ON u.id = t.assigned_to
WHERE t.created_at >= CURRENT_DATE - 365
GROUP BY u.id, u.contractor_id, DATE_TRUNC('month', t.created_at);
```

**Analytics Query:**
```sql
-- Overtime vs Burnout Correlation
SELECT
  ot.overtime_category,
  AVG(a.burnout_score) AS avg_burnout,
  AVG(a.engagement_score) AS avg_engagement,
  AVG(p.stress_level) AS avg_stress,
  COUNT(DISTINCT ot.user_id) AS employee_count
FROM v_employee_overtime ot
LEFT JOIN wellmind_assessments a ON ot.user_id = a.user_id
  AND DATE_TRUNC('quarter', a.assessment_date) = DATE_TRUNC('quarter', ot.month)
LEFT JOIN wellmind_pulse_surveys p ON ot.user_id = p.user_id
  AND DATE_TRUNC('month', p.survey_date) = ot.month
GROUP BY ot.overtime_category
HAVING COUNT(DISTINCT ot.user_id) >= 5;
```

**Frontend Requirements:**
- Admin Dashboard: Overtime → Burnout correlation chart
- Manager View: Team overtime alerts (>40h/month)
- Employee Dashboard: Personal overtime tracker

---

### 3. LEAVE REQUEST INTEGRATION (Szabadság/Betegszabadság)

**Célja:** Sick leave frequency vs burnout korreláció

**Auto-Referral Trigger:**
```sql
-- Auto-create WellMind referral after 3+ sick days in 30 days
CREATE OR REPLACE FUNCTION check_frequent_sick_leave()
RETURNS TRIGGER AS $$
DECLARE
  sick_count INTEGER;
BEGIN
  IF NEW.leave_type = 'sick' AND NEW.status = 'approved' THEN
    SELECT COUNT(*) INTO sick_count
    FROM leave_requests
    WHERE user_id = NEW.user_id
      AND leave_type = 'sick'
      AND start_date >= CURRENT_DATE - 30
      AND status = 'approved';

    IF sick_count >= 3 THEN
      INSERT INTO wellbeing_referrals (
        user_id, contractor_id, source_module, target_module,
        referral_type, urgency_level, referral_reason
      ) VALUES (
        NEW.user_id, NEW.contractor_id, 'hr_system', 'wellmind',
        'frequent_sick_leave', 'medium',
        'Employee has taken 3+ sick leaves in the last 30 days. Wellbeing check-in recommended.'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_sick_leave
  AFTER INSERT OR UPDATE ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION check_frequent_sick_leave();
```

---

### 4. COMPLAINT/CONFLICT TRACKING

**Célja:** Munkahelyi konfliktusok hatása team wellbeing-re

**Auto-Alert Trigger:**
```sql
-- Alert HR when harassment/critical conflicts occur
CREATE OR REPLACE FUNCTION alert_critical_ticket()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.category IN ('harassment', 'escalation') THEN
    INSERT INTO wellbeing_notifications (
      user_id, contractor_id, notification_type, notification_channel,
      title, message, priority, scheduled_for
    )
    SELECT
      u.id, NEW.contractor_id,
      'hr_critical_ticket_alert', 'email',
      'Critical Ticket Alert',
      'A critical ticket (Category: ' || NEW.category || ') has been created.',
      'urgent', NOW()
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE r.slug IN ('admin', 'data_controller')
      AND ur.contractor_id = NEW.contractor_id;

    IF NEW.created_by IS NOT NULL THEN
      INSERT INTO wellbeing_referrals (
        user_id, contractor_id, source_module, target_module,
        referral_type, urgency_level, referral_reason
      ) VALUES (
        NEW.created_by, NEW.contractor_id, 'ticket_system', 'carepath',
        'critical_incident', 'crisis',
        'Employee involved in critical incident. Immediate support recommended.'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### 5. RANDOM PULSE QUESTION ROTATION

**Célja:** Változatos adatgyűjtés, survey fatigue elkerülése

**Example Additional Questions:**
```sql
INSERT INTO wellmind_questions (question_type, question_text, question_text_en, response_type, category) VALUES
('pulse', 'Mennyire elégedett a szállásod állapotával?', 'How satisfied are you with your living conditions?', 'scale_1_10', 'housing'),
('pulse', 'Mennyire érzed kezelhetőnek a munkaterhelésedet?', 'Do you feel your workload is manageable?', 'yes_no', 'workload'),
('pulse', 'Mennyire érzed összeköttetésben magad a csapatoddal?', 'How connected do you feel with your team?', 'scale_1_10', 'social'),
('pulse', 'Volt-e konfliktus a munkahelyeden ezen a héten?', 'Have you experienced any conflicts this week?', 'yes_no', 'conflict'),
('pulse', 'Mennyire érzed biztonságban magad a munkahelyeden?', 'Do you feel safe in your workplace?', 'scale_1_10', 'safety'),
('pulse', 'Hogyan értékeled a szállásod tisztaságát?', 'How would you rate the cleanliness of your accommodation?', 'scale_1_10', 'housing'),
('pulse', 'Érzed-e, hogy értékelik a munkádat?', 'Do you feel appreciated for your work?', 'scale_1_10', 'recognition'),
('pulse', 'Tartottál-e szüneteket ezen a héten?', 'Have you taken any breaks this week?', 'yes_no', 'self_care');
```

---

## IMPLEMENTATION PRIORITY

### Session 21 (Bonus - after mobile complete):
1. Housing Cleanliness Tracking (Migration 063)
2. Overtime Analytics View
3. Leave Request Integration + Triggers
4. Conflict/Complaint Analytics

### Session 22 (Bonus):
5. Random Question Rotation
6. Advanced Analytics Dashboard
7. Predictive ML Models (optional)

---

## EXPECTED INSIGHTS

### Housing Quality Impact:
"Employees in 'Clean' housing (score ≥8) show 23% higher mood scores and 31% lower stress levels compared to 'Poor' housing (score <5)."

### Overtime Impact:
"Heavy overtime (>40h/month) correlates with 2.1x higher burnout scores and 47% more sick leave days."

### Conflict Impact:
"Teams with 3+ conflicts per month show 18% lower engagement scores and 2.3x higher turnover risk."

### Sick Leave Predictor:
"Employees with burnout scores >70 take 3.4x more sick leave days within the following 90 days."

---

## SUCCESS METRICS

### Data Collection:
- 80%+ daily pulse participation rate
- 90%+ quarterly assessment completion
- <5% survey fatigue (question rotation effectiveness)

### Impact Measurement:
- Burnout score reduction: Target -15% in 6 months
- Sick leave reduction: Target -20% in 6 months
- Conflict resolution time: Target -30% in 3 months
- Employee satisfaction: Target +25% in 6 months

### ROI:
- Reduced turnover cost: €50k-100k per prevented exit
- Reduced sick leave cost: €30k-60k per year
- Improved productivity: 10-15% estimated gain
- Legal risk mitigation: Priceless (GDPR/AI Act compliance)
