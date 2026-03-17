/**
 * Notification templates for the wellbeing system.
 * Each template defines title, message (with {variable} placeholders),
 * default channels, and priority.
 */

const TEMPLATES = {
  // ── WellMind ─────────────────────────────────────────────────────
  daily_pulse_reminder: {
    title: 'Hogy vagy ma?',
    title_en: 'How are you today?',
    message: 'Szánj 30 másodpercet a napi közérzeti felmérésre!',
    message_en: 'Take 30 seconds to log your daily pulse.',
    action_url: '/wellmind/pulse',
    channels: ['push', 'in_app'],
    priority: 'normal',
  },

  assessment_reminder_7d: {
    title: 'Negyedéves értékelés 7 nap múlva',
    title_en: 'Quarterly assessment in 7 days',
    message: 'A {quarter} negyedéves wellbeing értékelés 7 nap múlva esedékes. Mindössze 5 percet vesz igénybe.',
    action_url: '/wellmind/assessment',
    channels: ['email', 'in_app'],
    priority: 'normal',
  },

  assessment_reminder_3d: {
    title: 'Értékelés 3 nap múlva esedékes',
    title_en: 'Assessment due in 3 days',
    message: 'Ne felejtsd el — a negyedéves közérzeti felmérés 3 nap múlva lejár!',
    action_url: '/wellmind/assessment',
    channels: ['push', 'email', 'in_app'],
    priority: 'normal',
  },

  assessment_reminder_today: {
    title: 'Ma lejár az értékelés!',
    title_en: 'Assessment due today!',
    message: 'Kérjük, töltsd ki a negyedéves wellbeing értékelést ma! A válaszaid bizalmasak.',
    action_url: '/wellmind/assessment',
    channels: ['push', 'email', 'in_app'],
    priority: 'high',
  },

  intervention_recommended: {
    title: 'Új wellbeing javaslat',
    title_en: 'New wellbeing recommendation',
    message: 'A felmérésed alapján javaslatot kaptál: {intervention_title}.',
    action_url: '/wellmind/interventions/{intervention_id}',
    channels: ['push', 'in_app'],
    priority: 'normal',
  },

  // ── CarePath ─────────────────────────────────────────────────────
  carepath_appointment_reminder: {
    title: 'Időpont emlékeztető',
    title_en: 'Appointment reminder',
    message: 'Holnap {time}-kor időpontod van: {provider_name}. {location_info}',
    action_url: '/carepath/bookings/{booking_id}',
    channels: ['push', 'email'],
    priority: 'high',
  },

  carepath_referral_urgent: {
    title: 'Azonnali támogatás elérhető',
    title_en: 'Immediate support available',
    message: 'A wellbeing felméréséd magas stresszt mutat. A CarePath 24/7 elérhető számodra.',
    action_url: '/carepath/referrals/{referral_id}',
    channels: ['push', 'email'],
    priority: 'urgent',
  },

  carepath_referral_recommended: {
    title: 'Támogatás ajánlott',
    title_en: 'Support recommended',
    message: 'A jóléted fontos számunkra. A CarePath tanácsadás elérhető számodra.',
    action_url: '/carepath/referrals/{referral_id}',
    channels: ['push', 'in_app'],
    priority: 'high',
  },

  carepath_support_available: {
    title: 'Velünk vagy',
    title_en: 'We are here for you',
    message: 'Úgy tűnik, nehéz napjaid vannak. A CarePath támogatás 24/7 elérhető.',
    action_url: '/carepath/home',
    channels: ['push'],
    priority: 'high',
  },

  crisis_hotline: {
    title: 'Krízis támogatás MOST elérhető',
    title_en: 'Crisis support available NOW',
    message: 'CarePath Krízis Vonal: +36-1-116-123 (24/7). Nem vagy egyedül.',
    action_url: '/carepath/crisis',
    channels: ['push', 'sms'],
    priority: 'urgent',
  },

  // ── HR/Manager ───────────────────────────────────────────────────
  hr_high_risk_alert: {
    title: 'Wellbeing riasztás: Megnövekedett kockázat',
    title_en: 'Wellbeing alert: Increased risk',
    message: '{count} munkavállaló került magas kockázati kategóriába ezen a héten.',
    action_url: '/admin/wellbeing/risk-dashboard',
    channels: ['email'],
    priority: 'high',
  },

  manager_weekly_summary: {
    title: 'Heti csapat wellbeing összefoglaló',
    title_en: 'Weekly team wellbeing summary',
    message: 'A csapatod wellbeing indexe ezen a héten: {wellbeing_index}/100. {trend} az előző héthez képest.',
    action_url: '/manager/team-metrics',
    channels: ['email'],
    priority: 'normal',
  },

  crisis_alert: {
    title: 'SÜRGŐS: Krízishelyzet jelezve',
    title_en: 'URGENT: Crisis situation reported',
    message: 'Egy munkavállaló krízishelyzetet jelzett. Azonnali figyelmet igényel.',
    action_url: '/admin/wellbeing/crisis',
    channels: ['push', 'email'],
    priority: 'urgent',
  },
};

/**
 * Render template with variables.
 * Replaces {variable} placeholders with values from the data object.
 */
function renderTemplate(templateName, data = {}) {
  const template = TEMPLATES[templateName];
  if (!template) throw new Error(`Template not found: ${templateName}`);

  const render = (str) => {
    if (!str) return str;
    return str.replace(/\{(\w+)\}/g, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match;
    });
  };

  return {
    title: render(template.title),
    message: render(template.message),
    action_url: render(template.action_url),
    channels: template.channels,
    priority: template.priority,
  };
}

function getTemplate(templateName) {
  const template = TEMPLATES[templateName];
  if (!template) throw new Error(`Template not found: ${templateName}`);
  return { ...template };
}

function listTemplates() {
  return Object.keys(TEMPLATES);
}

module.exports = { TEMPLATES, renderTemplate, getTemplate, listTemplates };
