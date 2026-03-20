-- Migration 077: Pulse Question Library + Rotation System
-- 88 questions across 12 categories, 5 languages, smart rotation

BEGIN;

CREATE TABLE IF NOT EXISTS pulse_question_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_code VARCHAR(20) UNIQUE NOT NULL,
  category VARCHAR(50) NOT NULL,
  question_hu TEXT NOT NULL,
  question_en TEXT NOT NULL,
  question_tl TEXT NOT NULL DEFAULT '',
  question_uk TEXT NOT NULL DEFAULT '',
  question_de TEXT NOT NULL DEFAULT '',
  scale_type VARCHAR(20) NOT NULL DEFAULT 'scale_1_5',
  scale_min INTEGER DEFAULT 1,
  scale_max INTEGER DEFAULT 5,
  scale_labels_hu JSONB,
  scale_labels_en JSONB,
  priority INTEGER NOT NULL DEFAULT 50,
  frequency VARCHAR(20) NOT NULL DEFAULT 'daily_rotation',
  is_active BOOLEAN DEFAULT TRUE,
  is_core BOOLEAN DEFAULT FALSE,
  requires_text BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pulse_question_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES pulse_question_library(id) ON DELETE CASCADE,
  shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_pqh_user_date ON pulse_question_history(user_id, shown_at DESC);
CREATE INDEX IF NOT EXISTS idx_pql_active ON pulse_question_library(is_active, is_core);
CREATE INDEX IF NOT EXISTS idx_pql_category ON pulse_question_library(category);

-- Seed core + initial questions (20 of 88)
INSERT INTO pulse_question_library (question_code, category, question_hu, question_en, question_tl, question_uk, question_de, scale_type, priority, frequency, is_core) VALUES
-- CORE (always shown)
('MW-006','mental_wellbeing','Milyen a hangulatod ma?','What is your mood today?','Ano ang mood mo ngayon?','Який у вас настрій сьогодні?','Wie ist Ihre Stimmung heute?','scale_1_5',1,'daily_core',TRUE),
('PW-002','physical_wellbeing','Milyen az energiaszinted ma?','What is your energy level today?','Ano ang energy level mo ngayon?','Який ваш рівень енергії сьогодні?','Wie ist Ihr Energieniveau heute?','scale_1_5',1,'daily_core',TRUE),

-- PHYSICAL WELLBEING
('PW-001','physical_wellbeing','Mennyire pihentető volt az alvásod?','How restful was your sleep?','Gaano ka nakapagpahinga?','Наскільки відпочивним був ваш сон?','Wie erholsam war Ihr Schlaf?','scale_1_5',10,'daily_rotation',FALSE),
('PW-003','physical_wellbeing','Van-e fájdalom a testedben ma?','Do you have any body pain today?','May sakit ka ba sa katawan?','Чи є у вас біль у тілі?','Haben Sie Körperschmerzen?','scale_1_5',20,'2x_week',FALSE),
('PW-006','physical_wellbeing','Mennyire érzed magad fáradtnak?','How fatigued do you feel?','Gaano ka pagod?','Наскільки ви втомлені?','Wie müde fühlen Sie sich?','scale_1_5',15,'daily_rotation',FALSE),
('PW-008','physical_wellbeing','Ettél-e rendesen ma?','Did you eat properly today?','Kumain ka ba ng maayos?','Чи добре ви їли сьогодні?','Haben Sie heute richtig gegessen?','scale_1_5',25,'2x_week',FALSE),

-- MENTAL WELLBEING
('MW-001','mental_wellbeing','Mennyire érzed magad stresszesnek?','How stressed do you feel?','Gaano ka stressed?','Наскільки ви відчуваєте стрес?','Wie gestresst fühlen Sie sich?','scale_1_5',5,'3x_week',FALSE),
('MW-002','mental_wellbeing','Éreztél-e szorongást ma?','Did you feel anxious today?','Nakaramdam ka ba ng anxiety?','Чи відчували ви тривогу?','Fühlten Sie sich ängstlich?','scale_1_5',12,'3x_week',FALSE),
('MW-004','mental_wellbeing','Érezted-e hogy túl sok minden van?','Did you feel overwhelmed?','Nakaramdam ka ba na sobra na?','Чи відчували ви перевантаження?','Fühlten Sie sich überfordert?','scale_1_5',15,'2x_week',FALSE),
('MW-005','mental_wellbeing','Tudtál-e koncentrálni a munkádra?','Could you concentrate on work?','Nakapag-focus ka ba sa trabaho?','Чи змогли ви зосередитись?','Konnten Sie sich konzentrieren?','scale_1_5',18,'2x_week',FALSE),

-- WORK-LIFE BALANCE
('WLB-001','work_life_balance','Volt elegendő szüneted ma?','Did you have enough breaks today?','May sapat ka bang break?','Чи було достатньо перерв?','Hatten Sie genug Pausen?','scale_1_5',12,'daily_rotation',FALSE),
('WLB-005','work_life_balance','Túlóráztál-e ma?','Did you work overtime today?','Nag-overtime ka ba?','Чи працювали ви понаднормово?','Haben Sie Überstunden gemacht?','yes_no',8,'daily_rotation',FALSE),

-- HOUSING
('HA-001','housing','Elégedett vagy a szobáddal?','Are you satisfied with your room?','Satisfied ka ba sa kwarto?','Чи задоволені ви кімнатою?','Sind Sie zufrieden mit Ihrem Zimmer?','scale_1_5',25,'1x_week',FALSE),
('HA-003','housing','Mennyire tiszta a szállásod?','How clean is your accommodation?','Gaano kalinis ang tirahan?','Наскільки чисте ваше житло?','Wie sauber ist Ihre Unterkunft?','scale_1_5',20,'2x_week',FALSE),
('HA-004','housing','Van-e megoldatlan probléma a szálláson?','Any unresolved maintenance issues?','May problema ba sa maintenance?','Чи є нерозв''язані проблеми?','Ungelöste Wartungsprobleme?','yes_no',22,'1x_week',FALSE),
('HA-006','housing','Mennyire érzel magánszférát a szállásodon?','How much privacy do you feel?','Gaano ka kumportable sa privacy?','Наскільки ви відчуваєте приватність?','Wie viel Privatsphäre haben Sie?','scale_1_5',28,'1x_2weeks',FALSE),

-- JOB SATISFACTION
('JS-005','job_satisfaction','Sikerült-e valamit elérned ma?','Did you accomplish something today?','Naachieve mo ba ang gusto mo?','Чи досягли ви чогось сьогодні?','Haben Sie etwas erreicht?','scale_1_5',16,'daily_rotation',FALSE),
('JS-003','job_satisfaction','Értékelik-e a munkádat?','Is your work appreciated?','Pinapahalagahan ba ang trabaho mo?','Чи цінують вашу роботу?','Wird Ihre Arbeit geschätzt?','scale_1_5',22,'1x_week',FALSE),

-- SAFETY
('SC-003','safety','Történt-e biztonsági incidens ma?','Was there a safety incident today?','May safety incident ba?','Чи стався інцидент з безпекою?','Gab es einen Sicherheitsvorfall?','yes_no',5,'daily_rotation',FALSE),
('SC-001','safety','Érzed magad biztonságban a munkahelyeden?','Do you feel safe at work?','Ligtas ka ba sa trabaho?','Чи відчуваєте ви себе в безпеці?','Fühlen Sie sich sicher?','scale_1_5',15,'1x_week',FALSE)
ON CONFLICT (question_code) DO NOTHING;

COMMIT;
