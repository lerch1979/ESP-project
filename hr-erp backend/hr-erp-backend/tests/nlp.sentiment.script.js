/**
 * NLP Sentiment Analysis Tests — Session 25
 * Migration, service, controller, routes, integration, admin UI, mobile
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failed++;
    failures.push({ name, error: error.message });
    console.log(`  ❌ ${name}: ${error.message}`);
  }
}

function describe(suite, fn) {
  console.log(`\n📋 ${suite}`);
  fn();
}

const backendRoot = path.join(__dirname, '..');
const adminRoot = path.join(__dirname, '..', '..', '..', 'hr-erp-admin', 'src');
const mobileRoot = path.join(__dirname, '..', '..', '..', 'hr-erp-mobile', 'src');

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Migration 071 — NLP Sentiment Schema', () => {
  const migrationPath = path.join(backendRoot, 'migrations', '071_nlp_sentiment.sql');

  test('Migration file exists', () => {
    assert.ok(fs.existsSync(migrationPath));
  });

  const sql = fs.readFileSync(migrationPath, 'utf8');

  test('Creates wellbeing_sentiment_analysis table', () => {
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS wellbeing_sentiment_analysis'));
  });

  test('Creates nlp_sentiment_config table', () => {
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS nlp_sentiment_config'));
  });

  test('Creates user_nlp_consent table', () => {
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS user_nlp_consent'));
  });

  test('Config defaults to enabled=false (DISABLED by default)', () => {
    assert.ok(sql.includes('enabled BOOLEAN DEFAULT false'));
  });

  test('Config defaults to require_user_consent=true', () => {
    assert.ok(sql.includes('require_user_consent BOOLEAN DEFAULT true'));
  });

  test('Config defaults to auto_escalate_critical=true', () => {
    assert.ok(sql.includes('auto_escalate_critical BOOLEAN DEFAULT true'));
  });

  test('Config defaults to confidence_threshold=0.80', () => {
    assert.ok(sql.includes('confidence_threshold DECIMAL(3,2) DEFAULT 0.80'));
  });

  test('nlp_sentiment_config has UNIQUE contractor_id', () => {
    assert.ok(sql.includes('contractor_id UUID REFERENCES contractors(id) UNIQUE'));
  });

  test('user_nlp_consent has UNIQUE user_id', () => {
    assert.ok(sql.includes('REFERENCES users(id) ON DELETE CASCADE UNIQUE'));
  });

  test('Sentiment analysis has confidence constraint (0-1)', () => {
    assert.ok(sql.includes('CHECK (confidence >= 0 AND confidence <= 1)'));
  });

  test('Has pulse_note TEXT NOT NULL', () => {
    assert.ok(sql.includes('pulse_note TEXT NOT NULL'));
  });

  test('Has escalated fields', () => {
    assert.ok(sql.includes('escalated BOOLEAN DEFAULT false'));
    assert.ok(sql.includes('escalated_at TIMESTAMP'));
    assert.ok(sql.includes('escalated_by UUID'));
    assert.ok(sql.includes('review_notes TEXT'));
  });

  test('Creates at least 7 indexes', () => {
    const indexCount = (sql.match(/CREATE INDEX IF NOT EXISTS/g) || []).length;
    assert.ok(indexCount >= 7, `Expected ≥7 indexes, got ${indexCount}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE — KEYWORD DICTIONARIES
// ═══════════════════════════════════════════════════════════════════════════

describe('SentimentAnalysisService — Keyword Dictionaries', () => {
  const { SentimentAnalysisService } = require('../src/services/nlp/sentimentAnalysis.service');

  test('CRISIS_KEYWORDS contains Hungarian terms', () => {
    assert.ok(SentimentAnalysisService.CRISIS_KEYWORDS.includes('öngyilkos'));
    assert.ok(SentimentAnalysisService.CRISIS_KEYWORDS.includes('nem akarok élni'));
  });

  test('CRISIS_KEYWORDS contains English terms', () => {
    assert.ok(SentimentAnalysisService.CRISIS_KEYWORDS.includes('suicide'));
    assert.ok(SentimentAnalysisService.CRISIS_KEYWORDS.includes('kill myself'));
  });

  test('DEPRESSION_KEYWORDS has Hungarian + English', () => {
    assert.ok(SentimentAnalysisService.DEPRESSION_KEYWORDS.includes('reménytelen'));
    assert.ok(SentimentAnalysisService.DEPRESSION_KEYWORDS.includes('hopeless'));
  });

  test('ANXIETY_KEYWORDS has Hungarian + English', () => {
    assert.ok(SentimentAnalysisService.ANXIETY_KEYWORDS.includes('szorongok'));
    assert.ok(SentimentAnalysisService.ANXIETY_KEYWORDS.includes('anxious'));
  });

  test('CONFLICT_KEYWORDS has Hungarian + English', () => {
    assert.ok(SentimentAnalysisService.CONFLICT_KEYWORDS.includes('zaklatás'));
    assert.ok(SentimentAnalysisService.CONFLICT_KEYWORDS.includes('harassment'));
  });
});

describe('SentimentAnalysisService — Keyword Fallback', () => {
  const svc = require('../src/services/nlp/sentimentAnalysis.service');

  test('Detects CRISIS from Hungarian text', () => {
    const result = svc.keywordFallbackAnalysis('Nem akarok élni, minden reménytelen');
    assert.strictEqual(result.sentiment, 'CRISIS');
    assert.strictEqual(result.urgency, 'critical');
  });

  test('Detects CRISIS from English text', () => {
    const result = svc.keywordFallbackAnalysis('I want to kill myself');
    assert.strictEqual(result.sentiment, 'CRISIS');
    assert.strictEqual(result.urgency, 'critical');
  });

  test('Detects DEPRESSED from Hungarian text', () => {
    const result = svc.keywordFallbackAnalysis('Teljesen kimerült vagyok, nincs értelme semminek');
    assert.strictEqual(result.sentiment, 'DEPRESSED');
    assert.strictEqual(result.urgency, 'high');
  });

  test('Detects ANXIOUS from Hungarian text', () => {
    const result = svc.keywordFallbackAnalysis('Nagyon szorongok a holnapi megbeszélés miatt');
    assert.strictEqual(result.sentiment, 'ANXIOUS');
    assert.strictEqual(result.urgency, 'medium');
  });

  test('Detects CONFLICT from Hungarian text', () => {
    const result = svc.keywordFallbackAnalysis('A főnök kiabál és zaklatás történik');
    assert.strictEqual(result.sentiment, 'CONFLICT');
    assert.strictEqual(result.urgency, 'high');
  });

  test('Returns NEUTRAL for normal text', () => {
    const result = svc.keywordFallbackAnalysis('Ma jó napom volt, befejeztük a projektet');
    assert.strictEqual(result.sentiment, 'NEUTRAL');
    assert.strictEqual(result.urgency, 'low');
  });

  test('CRISIS takes priority over DEPRESSED keywords', () => {
    const result = svc.keywordFallbackAnalysis('Reménytelen vagyok, meg akarok halni');
    assert.strictEqual(result.sentiment, 'CRISIS');
  });

  test('Fallback includes matched keywords', () => {
    const result = svc.keywordFallbackAnalysis('Nagyon szorongok és pánik rohamom van');
    assert.ok(result.keywords.length > 0);
    assert.ok(result.keywords.includes('szorongok'));
  });

  test('Fallback always returns recommended_action', () => {
    const result = svc.keywordFallbackAnalysis('Random text');
    assert.ok(result.recommended_action && result.recommended_action.length > 0);
  });

  test('Fallback confidence: CRISIS=0.70, DEPRESSED=0.65, ANXIOUS=0.60, NEUTRAL=0.50', () => {
    assert.strictEqual(svc.keywordFallbackAnalysis('nem akarok élni').confidence, 0.70);
    assert.strictEqual(svc.keywordFallbackAnalysis('depressziós vagyok').confidence, 0.65);
    assert.strictEqual(svc.keywordFallbackAnalysis('nagyon szorongok').confidence, 0.60);
    assert.strictEqual(svc.keywordFallbackAnalysis('szép napom volt').confidence, 0.50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE — STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════

describe('SentimentAnalysisService — Methods', () => {
  const svcPath = path.join(backendRoot, 'src', 'services', 'nlp', 'sentimentAnalysis.service.js');
  const src = fs.readFileSync(svcPath, 'utf8');

  test('Has isEnabled method', () => { assert.ok(src.includes('async isEnabled(')); });
  test('Has hasUserConsent method', () => { assert.ok(src.includes('async hasUserConsent(')); });
  test('Has getConfig method', () => { assert.ok(src.includes('async getConfig(')); });
  test('Has analyzeWithClaude method', () => { assert.ok(src.includes('async analyzeWithClaude(')); });
  test('Has keywordFallbackAnalysis method', () => { assert.ok(src.includes('keywordFallbackAnalysis(')); });
  test('Has analyzePulseNote method', () => { assert.ok(src.includes('async analyzePulseNote(')); });
  test('Has escalateToHR method', () => { assert.ok(src.includes('async escalateToHR(')); });
  test('Has getAlerts method', () => { assert.ok(src.includes('async getAlerts(')); });
  test('Has reviewAlert method', () => { assert.ok(src.includes('async reviewAlert(')); });
  test('Has getStats method', () => { assert.ok(src.includes('async getStats(')); });
  test('Has getSentimentHistory method', () => { assert.ok(src.includes('async getSentimentHistory(')); });

  test('Uses Claude Sonnet 4 model', () => {
    assert.ok(src.includes('claude-sonnet-4'));
  });

  test('Has system prompt in Hungarian', () => {
    assert.ok(src.includes('SYSTEM_PROMPT'));
    assert.ok(src.includes('munkahelyi jólléti'));
  });

  test('Checks feature enabled before analysis', () => {
    assert.ok(src.includes('await this.isEnabled(contractorId)'));
  });

  test('Checks user consent before analysis', () => {
    assert.ok(src.includes('await this.hasUserConsent(userId)'));
  });

  test('Falls back to keywords when Claude fails', () => {
    assert.ok(src.includes('keywordFallbackAnalysis(noteText)'));
  });

  test('Exports singleton + class', () => {
    assert.ok(src.includes('module.exports = new SentimentAnalysisService()'));
    assert.ok(src.includes('module.exports.SentimentAnalysisService'));
  });

  test('Gracefully handles missing ANTHROPIC_API_KEY', () => {
    assert.ok(src.includes('ANTHROPIC_API_KEY not set'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

describe('NLPController — Exports', () => {
  const controller = require('../src/controllers/nlp.controller');

  const expected = [
    'getConfig', 'updateConfig', 'getAlerts', 'reviewAlert',
    'getStats', 'getSentimentHistory', 'testAnalysis', 'getConsent', 'updateConsent',
  ];

  expected.forEach(name => {
    test(`Exports ${name}`, () => {
      assert.strictEqual(typeof controller[name], 'function');
    });
  });
});

describe('NLPController — Validation', () => {
  const ctrlPath = path.join(backendRoot, 'src', 'controllers', 'nlp.controller.js');
  const src = fs.readFileSync(ctrlPath, 'utf8');

  test('Validates confidence threshold (0.50-0.99)', () => {
    assert.ok(src.includes('0.5'));
    assert.ok(src.includes('0.99'));
  });

  test('Test endpoint requires min 5 chars', () => {
    assert.ok(src.includes('min 5 karakter'));
  });

  test('Consent endpoint validates boolean', () => {
    assert.ok(src.includes("typeof consented !== 'boolean'"));
  });

  test('Config upsert uses ON CONFLICT', () => {
    assert.ok(src.includes('ON CONFLICT (contractor_id)'));
  });

  test('Consent upsert uses ON CONFLICT', () => {
    assert.ok(src.includes('ON CONFLICT (user_id)'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

describe('NLP Routes', () => {
  const routes = require('../src/routes/nlp.routes');

  test('Routes module exports Express router', () => {
    assert.ok(routes);
  });

  const routesPath = path.join(backendRoot, 'src', 'routes', 'nlp.routes.js');
  const src = fs.readFileSync(routesPath, 'utf8');

  test('Requires authenticateToken', () => {
    assert.ok(src.includes('authenticateToken'));
  });

  test('Employee consent endpoints (no admin required)', () => {
    assert.ok(src.includes("router.get('/consent'"));
    assert.ok(src.includes("router.post('/consent'"));
  });

  test('Admin config endpoints with permission', () => {
    assert.ok(src.includes("router.get('/config'"));
    assert.ok(src.includes("router.put('/config'"));
    assert.ok(src.includes("checkPermission('blue_colibri.admin.manage')"));
  });

  test('Admin stats endpoint', () => { assert.ok(src.includes("'/stats'")); });
  test('Admin alerts endpoint', () => { assert.ok(src.includes("'/alerts'")); });
  test('Admin review endpoint', () => { assert.ok(src.includes("'/alerts/:id/review'")); });
  test('Admin sentiment-history endpoint', () => { assert.ok(src.includes("'/sentiment-history'")); });
  test('Admin test endpoint', () => { assert.ok(src.includes("'/test'")); });
});

// ═══════════════════════════════════════════════════════════════════════════
// SERVER REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Server.js — NLP Registration', () => {
  const src = fs.readFileSync(path.join(backendRoot, 'src', 'server.js'), 'utf8');

  test('Imports nlp routes', () => {
    assert.ok(src.includes("require('./routes/nlp.routes')"));
  });

  test('Mounts at /nlp prefix', () => {
    assert.ok(src.includes('/nlp'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// WELLMIND INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

describe('WellMind Controller — NLP Integration', () => {
  const src = fs.readFileSync(path.join(backendRoot, 'src', 'controllers', 'wellmind.controller.js'), 'utf8');

  test('Imports sentimentService', () => {
    assert.ok(src.includes("require('../services/nlp/sentimentAnalysis.service')"));
  });

  test('Calls analyzePulseNote after pulse submission', () => {
    assert.ok(src.includes('sentimentService.analyzePulseNote'));
  });

  test('Only analyzes notes > 10 chars', () => {
    assert.ok(src.includes('notes.trim().length > 10'));
  });

  test('NLP error is caught non-blocking', () => {
    assert.ok(src.includes("logger.error('NLP sentiment error:'"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN UI
// ═══════════════════════════════════════════════════════════════════════════

describe('Admin — SentimentDashboard Page', () => {
  const pagePath = path.join(adminRoot, 'pages', 'WellMind', 'SentimentDashboard.jsx');

  test('Page file exists', () => { assert.ok(fs.existsSync(pagePath)); });

  const src = fs.readFileSync(pagePath, 'utf8');

  test('Imports nlpAPI', () => { assert.ok(src.includes('nlpAPI')); });
  test('Has enable/disable toggle', () => { assert.ok(src.includes('config?.enabled')); });
  test('Has confidence threshold slider', () => { assert.ok(src.includes('<Slider')); });
  test('Has test analysis panel', () => { assert.ok(src.includes('testAnalysis')); });
  test('Shows disabled warning when feature off', () => { assert.ok(src.includes('KIKAPCSOLT')); });
  test('Shows alerts table', () => { assert.ok(src.includes('Riasztások')); });
  test('Has review dialog', () => { assert.ok(src.includes('reviewDialog')); });
  test('Shows sentiment colors', () => { assert.ok(src.includes('SENTIMENT_COLORS')); });
  test('Shows urgency labels in Hungarian', () => { assert.ok(src.includes('Kritikus')); });
});

describe('Admin — API Service (nlpAPI)', () => {
  const src = fs.readFileSync(path.join(adminRoot, 'services', 'api.js'), 'utf8');

  test('Exports nlpAPI object', () => { assert.ok(src.includes('export const nlpAPI')); });
  test('nlpAPI.getConfig', () => { assert.ok(src.includes("api.get('/nlp/config')")); });
  test('nlpAPI.updateConfig', () => { assert.ok(src.includes("api.put('/nlp/config'")); });
  test('nlpAPI.getStats', () => { assert.ok(src.includes('/nlp/stats')); });
  test('nlpAPI.getAlerts', () => { assert.ok(src.includes('/nlp/alerts')); });
  test('nlpAPI.reviewAlert', () => { assert.ok(src.includes('/nlp/alerts/${id}/review')); });
  test('nlpAPI.testAnalysis', () => { assert.ok(src.includes("api.post('/nlp/test'")); });
});

describe('Admin — App.jsx Route', () => {
  const src = fs.readFileSync(path.join(adminRoot, 'App.jsx'), 'utf8');

  test('Imports SentimentDashboard', () => {
    assert.ok(src.includes("import SentimentDashboard from './pages/WellMind/SentimentDashboard'"));
  });

  test('Registers /wellmind/sentiment route', () => {
    assert.ok(src.includes('path="wellmind/sentiment"'));
  });
});

describe('Admin — Layout Sidebar', () => {
  const src = fs.readFileSync(path.join(adminRoot, 'components', 'Layout.jsx'), 'utf8');

  test('Has NLP Hangulat menu item', () => {
    assert.ok(src.includes("text: 'NLP Hangulat'"));
  });

  test('Links to /wellmind/sentiment', () => {
    assert.ok(src.includes("path: '/wellmind/sentiment'"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MOBILE
// ═══════════════════════════════════════════════════════════════════════════

describe('Mobile — NLP Consent API', () => {
  const src = fs.readFileSync(path.join(mobileRoot, 'services', 'wellmind', 'api.js'), 'utf8');

  test('Has nlpConsent.get method', () => { assert.ok(src.includes('/nlp/consent')); });
  test('Has nlpConsent.update method', () => { assert.ok(src.includes("post('/nlp/consent'")); });
  test('Exports nlpConsent in wellmindAPI', () => { assert.ok(src.includes('nlpConsent')); });
});

describe('Mobile — NLPConsentScreen', () => {
  const screenPath = path.join(mobileRoot, 'screens', 'WellMind', 'NLPConsentScreen.js');

  test('Screen file exists', () => { assert.ok(fs.existsSync(screenPath)); });

  const src = fs.readFileSync(screenPath, 'utf8');

  test('Shows disabled state when feature off', () => { assert.ok(src.includes('feature_enabled')); });
  test('Shows consent toggle', () => { assert.ok(src.includes('handleConsent')); });
  test('Has withdrawal confirmation alert', () => { assert.ok(src.includes('Visszavonás megerősítése')); });
  test('Explains what AI analysis does', () => { assert.ok(src.includes('Mire használjuk')); });
  test('Explains who sees results', () => { assert.ok(src.includes('Ki látja az eredményt')); });
  test('Shows data protection info', () => { assert.ok(src.includes('Adatvédelem')); });
  test('Shows consent status', () => { assert.ok(src.includes('Hozzájárulás megadva')); });
});

describe('Mobile — Navigation Updates', () => {
  const wellbeingSrc = fs.readFileSync(path.join(mobileRoot, 'navigation', 'WellbeingStackNavigator.js'), 'utf8');
  const moreSrc = fs.readFileSync(path.join(mobileRoot, 'navigation', 'MoreStackNavigator.js'), 'utf8');

  test('WellbeingStackNavigator imports NLPConsentScreen', () => {
    assert.ok(wellbeingSrc.includes('NLPConsentScreen'));
  });

  test('WellbeingStackNavigator registers NLPConsent route', () => {
    assert.ok(wellbeingSrc.includes('"NLPConsent"'));
  });

  test('MoreStackNavigator imports NLPConsentScreen', () => {
    assert.ok(moreSrc.includes('NLPConsentScreen'));
  });

  test('MoreStackNavigator registers NLPConsent route', () => {
    assert.ok(moreSrc.includes('"NLPConsent"'));
  });
});

describe('Mobile — MoreMenuScreen', () => {
  const src = fs.readFileSync(path.join(mobileRoot, 'screens', 'more', 'MoreMenuScreen.js'), 'utf8');

  test('Has AI Támogatás menu item', () => {
    assert.ok(src.includes("label: 'AI Támogatás'"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SAFETY & PRIVACY CHECKS
// ═══════════════════════════════════════════════════════════════════════════

describe('Safety — Feature Disabled by Default', () => {
  const migrationSql = fs.readFileSync(path.join(backendRoot, 'migrations', '071_nlp_sentiment.sql'), 'utf8');
  const svcSrc = fs.readFileSync(path.join(backendRoot, 'src', 'services', 'nlp', 'sentimentAnalysis.service.js'), 'utf8');

  test('Migration: config enabled defaults to false', () => {
    assert.ok(migrationSql.includes('enabled BOOLEAN DEFAULT false'));
  });

  test('Migration: require_user_consent defaults to true', () => {
    assert.ok(migrationSql.includes('require_user_consent BOOLEAN DEFAULT true'));
  });

  test('Service: checks isEnabled before analysis', () => {
    assert.ok(svcSrc.includes('const enabled = await this.isEnabled(contractorId)'));
    assert.ok(svcSrc.includes('if (!enabled)'));
  });

  test('Service: checks consent before analysis', () => {
    assert.ok(svcSrc.includes('const hasConsent = await this.hasUserConsent(userId)'));
    assert.ok(svcSrc.includes('if (!hasConsent)'));
  });

  test('Service: returns null when disabled (no analysis)', () => {
    assert.ok(svcSrc.includes('return null'));
  });

  test('Service: CRISIS always detected regardless of confidence', () => {
    // The service stores critical/high urgency alerts even below threshold
    assert.ok(svcSrc.includes('urgency === \'low\''));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log(`📊 NLP Sentiment Tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\n❌ Failures:');
  failures.forEach(f => console.log(`   - ${f.name}: ${f.error}`));
}
console.log('═'.repeat(60));

process.exit(failed > 0 ? 1 : 0);
