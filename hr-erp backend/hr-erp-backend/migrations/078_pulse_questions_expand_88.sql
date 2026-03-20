-- Migration 078: Expand Pulse Library to 88 questions (68 new)
-- 12 categories, 5 languages, priority-weighted rotation

BEGIN;

INSERT INTO pulse_question_library (question_code, category, question_hu, question_en, question_tl, question_uk, question_de, scale_type, scale_min, scale_max, priority, frequency, is_core, requires_text) VALUES

-- PHYSICAL WELLBEING (6 new → 10 total)
('PW-004','physical_wellbeing','Volt-e lehetőséged mozogni ma?','Did you have the opportunity to exercise?','Nakapag-ehersisyo ka ba?','Чи мали ви можливість рухатися?','Hatten Sie die Möglichkeit sich zu bewegen?','yes_no',NULL,NULL,25,'2x_week',FALSE,FALSE),
('PW-005','physical_wellbeing','Elégedett vagy az étkezéseiddel?','Are you satisfied with your meals?','Satisfied ka ba sa pagkain?','Чи задоволені ви їжею?','Sind Sie mit Ihren Mahlzeiten zufrieden?','scale_1_5',1,5,30,'2x_week',FALSE,FALSE),
('PW-007','physical_wellbeing','Ittál-e elegendő vizet ma?','Have you drunk enough water today?','Sapat ba ang tubig mo?','Чи випили ви достатньо води?','Haben Sie genug Wasser getrunken?','yes_no',NULL,NULL,35,'1x_week',FALSE,FALSE),
('PW-009','physical_wellbeing','Volt-e fejfájásod ma?','Did you have a headache today?','Sumakit ba ulo mo?','Чи боліла голова?','Hatten Sie Kopfschmerzen?','yes_no',NULL,NULL,32,'2x_week',FALSE,FALSE),
('PW-010','physical_wellbeing','Hogyan érzed magad fizikailag?','How do you feel physically?','Paano ka pisikal?','Як ви почуваєтесь фізично?','Wie fühlen Sie sich körperlich?','scale_1_5',1,5,18,'daily_rotation',FALSE,FALSE),
('PW-011','physical_wellbeing','Kényelmes a munkahelyi környezeted?','Is your work environment comfortable?','Komportable ba ang lugar ng trabaho?','Чи комфортне робоче середовище?','Ist Ihre Arbeitsumgebung angenehm?','scale_1_5',1,5,28,'1x_week',FALSE,FALSE),

-- MENTAL WELLBEING (8 new → 12 total)
('MW-003','mental_wellbeing','Mennyire tudtál koncentrálni?','How well could you concentrate?','Nakapag-focus ka ba?','Наскільки ви змогли зосередитись?','Wie gut konnten Sie sich konzentrieren?','scale_1_5',1,5,17,'2x_week',FALSE,FALSE),
('MW-007','mental_wellbeing','Értékelik-e a munkádat?','Is your work appreciated?','Appreciated ba ang trabaho mo?','Чи цінують вашу роботу?','Wird Ihre Arbeit geschätzt?','scale_1_5',1,5,22,'1x_week',FALSE,FALSE),
('MW-008','mental_wellbeing','Elégedett vagy a mai munkáddal?','Are you satisfied with today''s work?','Satisfied ka ba sa trabaho ngayon?','Чи задоволені ви роботою?','Sind Sie mit Ihrer Arbeit zufrieden?','scale_1_5',1,5,16,'2x_week',FALSE,FALSE),
('MW-009','mental_wellbeing','Mentálisan kimerültnek érzed magad?','Do you feel mentally exhausted?','Mentally exhausted ka ba?','Чи відчуваєте психічне виснаження?','Fühlen Sie sich mental erschöpft?','scale_1_5',1,5,14,'2x_week',FALSE,FALSE),
('MW-010','mental_wellbeing','Aggódsz valami miatt?','Are you worried about something?','May iniisip ka ba?','Чи турбуєтесь ви?','Machen Sie sich Sorgen?','yes_no',NULL,NULL,21,'2x_week',FALSE,FALSE),
('MW-011','mental_wellbeing','Tudtál pihenni ma?','Were you able to relax?','Nakapag-relax ka ba?','Чи змогли ви відпочити?','Konnten Sie sich entspannen?','scale_1_5',1,5,23,'2x_week',FALSE,FALSE),
('MW-012','mental_wellbeing','Optimista vagy a holnappal?','Are you optimistic about tomorrow?','Optimistic ka ba bukas?','Чи оптимістично налаштовані?','Sind Sie optimistisch für morgen?','scale_1_5',1,5,20,'2x_week',FALSE,FALSE),
('MW-013','mental_wellbeing','Tiszta a gondolkodásod ma?','Is your thinking clear today?','Malinaw ba ang isip mo?','Наскільки ясне мислення?','Wie klar ist Ihr Denken?','scale_1_5',1,5,19,'2x_week',FALSE,FALSE),

-- SOCIAL WELLBEING (8 new)
('SW-001','social_wellbeing','Kapcsolódol a csapatodhoz?','Do you feel connected to your team?','Konektado ka ba sa team?','Чи відчуваєте зв''язок з командою?','Fühlen Sie sich mit dem Team verbunden?','scale_1_5',1,5,26,'1x_week',FALSE,FALSE),
('SW-002','social_wellbeing','Elégedett vagy a munkahelyi kapcsolataiddal?','Are you satisfied with workplace relationships?','Satisfied ka ba sa relasyon sa trabaho?','Чи задоволені стосунками?','Zufrieden mit Arbeitsbeziehungen?','scale_1_5',1,5,27,'1x_week',FALSE,FALSE),
('SW-003','social_wellbeing','Támogatnak a kollégáid?','Do you feel supported by colleagues?','Suportado ka ba ng mga kasamahan?','Чи підтримують вас колеги?','Fühlen Sie sich von Kollegen unterstützt?','scale_1_5',1,5,24,'1x_week',FALSE,FALSE),
('SW-004','social_wellbeing','Jó a kommunikáció a csapatban?','Is team communication good?','Mabuti ba ang communication sa team?','Чи добра комунікація в команді?','Ist die Teamkommunikation gut?','scale_1_5',1,5,29,'1x_week',FALSE,FALSE),
('SW-005','social_wellbeing','Volt konfliktusod ma?','Did you have any conflict today?','May conflict ka ba?','Чи був конфлікт сьогодні?','Hatten Sie einen Konflikt?','yes_no',NULL,NULL,18,'2x_week',FALSE,FALSE),
('SW-006','social_wellbeing','Érezted magad magányosnak?','Did you feel lonely?','Nalungkot ka ba?','Чи відчували себе самотнім?','Fühlten Sie sich einsam?','scale_1_5',1,5,31,'2x_week',FALSE,FALSE),
('SW-007','social_wellbeing','Kaptál visszajelzést a vezetődtől?','Did you get feedback from your manager?','Nakatanggap ka ba ng feedback?','Чи отримали зворотний зв''язок?','Haben Sie Feedback erhalten?','yes_no',NULL,NULL,33,'1x_week',FALSE,FALSE),
('SW-008','social_wellbeing','Számít a véleményed a csapatban?','Does your opinion matter in the team?','Mahalaga ba ang opinyon mo?','Чи важлива ваша думка?','Zählt Ihre Meinung im Team?','scale_1_5',1,5,28,'1x_week',FALSE,FALSE),

-- WORK-LIFE BALANCE (6 new → 8 total)
('WLB-002','work_life_balance','Volt időd a családodra?','Did you have time for family?','May oras ka ba para sa pamilya?','Чи був час для сім''ї?','Hatten Sie Zeit für Familie?','scale_1_5',1,5,18,'2x_week',FALSE,FALSE),
('WLB-003','work_life_balance','Szántál időt magadra?','Did you have time for yourself?','May oras ka ba para sa sarili?','Чи був час для себе?','Hatten Sie Zeit für sich?','yes_no',NULL,NULL,21,'2x_week',FALSE,FALSE),
('WLB-004','work_life_balance','Elválasztottad a munkát a magánéletedtől?','Could you separate work and personal life?','Nahiwalay mo ba ang trabaho?','Чи відокремили роботу?','Konnten Sie Arbeit und Privatleben trennen?','scale_1_5',1,5,22,'2x_week',FALSE,FALSE),
('WLB-006','work_life_balance','Szükséged van pihenőre?','Do you need time off?','Kailangan mo ba ng pahinga?','Чи потрібна відпустка?','Brauchen Sie Urlaub?','scale_1_5',1,5,24,'1x_week',FALSE,FALSE),
('WLB-007','work_life_balance','Zavarta a munka a személyes idődet?','Did work intrude on personal time?','Nakagambala ba ang trabaho?','Чи втручалася робота?','Hat Arbeit Ihre Freizeit gestört?','yes_no',NULL,NULL,20,'2x_week',FALSE,FALSE),
('WLB-008','work_life_balance','Rugalmas volt a mai munkanapod?','How flexible was your work day?','Flexible ba ang work day mo?','Наскільки гнучким був день?','Wie flexibel war Ihr Arbeitstag?','scale_1_5',1,5,26,'1x_week',FALSE,FALSE),

-- JOB SATISFACTION (6 new → 8 total)
('JS-001','job_satisfaction','Motivált voltál ma?','Were you motivated today?','Motivated ka ba ngayon?','Чи були ви мотивовані?','Waren Sie heute motiviert?','scale_1_5',1,5,17,'2x_week',FALSE,FALSE),
('JS-002','job_satisfaction','Használod a képességeidet?','Are you using your skills?','Ginagamit mo ba ang skills?','Чи використовуєте навички?','Nutzen Sie Ihre Fähigkeiten?','scale_1_5',1,5,29,'1x_week',FALSE,FALSE),
('JS-004','job_satisfaction','Tisztában voltál a feladataiddal?','Were your tasks clear?','Malinaw ba ang tasks mo?','Чи були завдання зрозумілі?','Waren Aufgaben klar?','scale_1_5',1,5,18,'2x_week',FALSE,FALSE),
('JS-006','job_satisfaction','Látsz lehetőséget a fejlődésre?','Do you see growth opportunities?','May opportunity ba para umunlad?','Чи бачите можливості?','Sehen Sie Wachstumsmöglichkeiten?','scale_1_5',1,5,35,'1x_2weeks',FALSE,FALSE),
('JS-007','job_satisfaction','Büszke vagy a munkádra?','Are you proud of your work?','Proud ka ba sa trabaho?','Чи пишаєтесь роботою?','Sind Sie stolz auf Ihre Arbeit?','scale_1_5',1,5,23,'2x_week',FALSE,FALSE),
('JS-008','job_satisfaction','Biztonságos a munkahelyed?','How secure is your job?','Gaano ka secure sa trabaho?','Наскільки стабільна робота?','Wie sicher ist Ihr Job?','scale_1_5',1,5,45,'1x_month',FALSE,FALSE),

-- WORKPLACE ENVIRONMENT (6 new)
('WE-001','workplace_environment','Biztonságban érzed magad a munkahelyen?','Do you feel safe at work?','Ligtas ka ba sa trabaho?','Чи безпечно на роботі?','Fühlen Sie sich sicher?','scale_1_5',1,5,12,'1x_week',FALSE,FALSE),
('WE-002','workplace_environment','Tiszta a munkakörnyezeted?','Is your work environment clean?','Malinis ba ang work environment?','Чи чисте робоче середовище?','Ist Ihre Arbeitsumgebung sauber?','scale_1_5',1,5,24,'2x_week',FALSE,FALSE),
('WE-003','workplace_environment','Megfelelő volt a hőmérséklet?','Was the temperature comfortable?','Komportable ba ang temperatura?','Чи була температура комфортною?','War die Temperatur angenehm?','scale_1_5',1,5,27,'2x_week',FALSE,FALSE),
('WE-004','workplace_environment','Zavart a zajszint?','Did noise levels bother you?','Nakakagambala ba ang ingay?','Чи заважав шум?','Hat Lärm Sie gestört?','yes_no',NULL,NULL,30,'1x_week',FALSE,FALSE),
('WE-005','workplace_environment','Megvannak az eszközeid a munkához?','Do you have needed tools?','May tools ka ba para sa trabaho?','Чи є необхідні інструменти?','Haben Sie nötige Werkzeuge?','scale_1_5',1,5,16,'1x_week',FALSE,FALSE),
('WE-006','workplace_environment','Rendezett a munkaterületed?','Is your workspace organized?','Organize ba ang workspace mo?','Чи організоване робоче місце?','Ist Ihr Arbeitsplatz organisiert?','scale_1_5',1,5,32,'1x_week',FALSE,FALSE),

-- HOUSING (4 new → 8 total)
('HA-002','housing','Milyen a kapcsolatod a szobatársaiddal?','How is your roommate relationship?','Kumusta ang relasyon sa mga kasama?','Як стосунки зі співмешканцями?','Wie ist das Verhältnis zu Mitbewohnern?','scale_1_5',1,5,27,'1x_week',FALSE,FALSE),
('HA-005','housing','Jól tudsz aludni a szobádban?','Can you sleep well in your room?','Nakakatulog ka ba ng mabuti?','Чи добре ви спите?','Können Sie gut schlafen?','scale_1_5',1,5,19,'2x_week',FALSE,FALSE),
('HA-007','housing','Biztonságban érzed magad a szálláson?','Do you feel safe in accommodation?','Ligtas ka ba sa tirahan?','Чи безпечно у житлі?','Fühlen Sie sich sicher?','scale_1_5',1,5,14,'1x_week',FALSE,FALSE),
('HA-008','housing','Zavart az éjszakai zaj?','Did nighttime noise bother you?','Nakakagambala ba ang ingay sa gabi?','Чи заважав нічний шум?','Hat nächtlicher Lärm gestört?','yes_no',NULL,NULL,23,'2x_week',FALSE,FALSE),

-- FINANCIAL WELLBEING (6 new)
('FW-001','financial_wellbeing','Okoz stresszt a pénzügyi helyzeted?','Does your financial situation cause stress?','Nag-stress ka ba dahil sa pera?','Чи стресує фінансове становище?','Verursacht Ihre Finanzsituation Stress?','scale_1_5',1,5,25,'1x_week',FALSE,FALSE),
('FW-002','financial_wellbeing','Elégedett vagy a fizetéseddel?','Are you satisfied with your salary?','Satisfied ka ba sa sahod?','Чи задоволені зарплатою?','Zufrieden mit Ihrem Gehalt?','scale_1_5',1,5,40,'1x_month',FALSE,FALSE),
('FW-003','financial_wellbeing','Tudsz félretenni?','Can you save from your salary?','Nakakapag-ipon ka ba?','Чи можете відкладати?','Können Sie sparen?','yes_no',NULL,NULL,34,'1x_2weeks',FALSE,FALSE),
('FW-004','financial_wellbeing','Időben kaptad a fizetésedet?','Did you receive salary on time?','Natanggap mo ba ang sahod on time?','Чи отримали зарплату вчасно?','Gehalt pünktlich erhalten?','yes_no',NULL,NULL,10,'1x_month',FALSE,FALSE),
('FW-005','financial_wellbeing','Van pénzügyi aggodalmad?','Do you have financial concerns?','May financial concerns ka ba?','Чи є фінансові проблеми?','Haben Sie finanzielle Sorgen?','yes_no',NULL,NULL,28,'1x_week',FALSE,FALSE),
('FW-006','financial_wellbeing','Ismered az elérhető juttatásokat?','Are you aware of available benefits?','Alam mo ba ang benefits?','Чи знаєте про пільги?','Kennen Sie verfügbare Leistungen?','yes_no',NULL,NULL,38,'1x_month',FALSE,FALSE),

-- MANAGER RELATIONSHIP (6 new)
('MR-001','manager_relationship','Támogat a vezetőd?','Does your manager support you?','Suportado ka ba ng manager?','Чи підтримує керівник?','Unterstützt Ihr Vorgesetzter Sie?','scale_1_5',1,5,24,'1x_week',FALSE,FALSE),
('MR-002','manager_relationship','Világos utasításokat kapsz?','Do you get clear instructions?','Malinaw ba ang instructions?','Чи зрозумілі інструкції?','Erhalten Sie klare Anweisungen?','scale_1_5',1,5,22,'1x_week',FALSE,FALSE),
('MR-003','manager_relationship','Elérhető a vezetőd?','Is your manager accessible?','Madaling makausap ang manager?','Чи доступний керівник?','Ist Ihr Vorgesetzter erreichbar?','scale_1_5',1,5,31,'1x_2weeks',FALSE,FALSE),
('MR-004','manager_relationship','Igazságosan kezel a vezetőd?','Does your manager treat you fairly?','Fair ba ang manager?','Чи справедливий керівник?','Werden Sie fair behandelt?','scale_1_5',1,5,20,'1x_2weeks',FALSE,FALSE),
('MR-005','manager_relationship','Hasznos visszajelzést kapsz?','Do you get useful feedback?','Helpful ba ang feedback?','Чи корисний зворотний зв''язок?','Erhalten Sie nützliches Feedback?','scale_1_5',1,5,29,'1x_2weeks',FALSE,FALSE),
('MR-006','manager_relationship','Tisztel a vezetőd?','Does your manager respect you?','Nirerespeto ka ba ng manager?','Чи поважає вас керівник?','Respektiert Ihr Vorgesetzter Sie?','scale_1_5',1,5,18,'1x_2weeks',FALSE,FALSE),

-- LEARNING & DEVELOPMENT (4 new)
('LD-001','learning_development','Van lehetőséged tanulni?','Do you have learning opportunities?','May opportunity ba matuto?','Чи є можливості навчатися?','Haben Sie Lernmöglichkeiten?','scale_1_5',1,5,33,'1x_2weeks',FALSE,FALSE),
('LD-002','learning_development','Hasznos volt a képzés?','Was training useful?','Helpful ba ang training?','Чи корисне навчання?','War die Schulung nützlich?','scale_1_5',1,5,42,'1x_month',FALSE,FALSE),
('LD-003','learning_development','Világos a karrierutad?','Is your career path clear?','Malinaw ba ang career path?','Чи зрозумілий кар''єрний шлях?','Ist Ihr Karrierepfad klar?','scale_1_5',1,5,44,'1x_month',FALSE,FALSE),
('LD-004','learning_development','Tanultál valami újat?','Did you learn something new?','Natutunan mo ba ang bago?','Чи навчилися нового?','Haben Sie etwas Neues gelernt?','yes_no',NULL,NULL,30,'1x_week',FALSE,FALSE),

-- SAFETY (2 new → 4 total)
('SC-002','safety','Van védőfelszerelésed?','Do you have safety equipment?','May safety equipment ka ba?','Чи є захисне обладнання?','Haben Sie Schutzausrüstung?','yes_no',NULL,NULL,11,'1x_week',FALSE,FALSE),
('SC-004','safety','Tudod hogyan kell jelenteni?','Do you know how to report issues?','Alam mo ba kung paano mag-report?','Чи знаєте як повідомити?','Wissen Sie wie man meldet?','yes_no',NULL,NULL,39,'1x_month',FALSE,FALSE),

-- CULTURAL INTEGRATION (4 new)
('CI-001','cultural_integration','Okoz problémát a nyelvi különbség?','Do language differences cause problems?','May problema ba sa language?','Чи створюють мовні проблеми?','Verursachen Sprachunterschiede Probleme?','scale_1_5',1,5,26,'1x_week',FALSE,FALSE),
('CI-002','cultural_integration','Tiszteletben tartják a kultúrádat?','Is your culture respected?','Nirerespeto ba ang kultura mo?','Чи поважають вашу культуру?','Wird Ihre Kultur respektiert?','scale_1_5',1,5,32,'1x_2weeks',FALSE,FALSE),
('CI-003','cultural_integration','Tapasztaltál megkülönböztetést?','Have you experienced discrimination?','Nakaranas ka ba ng discrimination?','Чи зазнавали дискримінації?','Haben Sie Diskriminierung erlebt?','yes_no',NULL,NULL,15,'1x_month',FALSE,TRUE),
('CI-004','cultural_integration','Kapsz támogatást a beilleszkedéshez?','Do you receive integration support?','May suporta ba para sa integration?','Чи отримуєте підтримку?','Erhalten Sie Integrationsunterstützung?','scale_1_5',1,5,37,'1x_month',FALSE,FALSE)

ON CONFLICT (question_code) DO NOTHING;

COMMIT;
