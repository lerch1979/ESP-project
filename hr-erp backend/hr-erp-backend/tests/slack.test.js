/**
 * Slack Integration Tests — Session 24
 * Migration, service, controller, routes, cron, admin UI
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

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Migration 070 — Slack Integration Schema', () => {
  const migrationPath = path.join(backendRoot, 'migrations', '070_slack_integration.sql');

  test('Migration file exists', () => {
    assert.ok(fs.existsSync(migrationPath));
  });

  const sql = fs.readFileSync(migrationPath, 'utf8');

  test('Creates slack_users table', () => {
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS slack_users'));
  });

  test('Creates slack_checkin_config table', () => {
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS slack_checkin_config'));
  });

  test('Creates slack_checkin_messages table', () => {
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS slack_checkin_messages'));
  });

  test('slack_users has user_id FK with CASCADE', () => {
    assert.ok(sql.includes('user_id UUID REFERENCES users(id) ON DELETE CASCADE'));
  });

  test('slack_users has UNIQUE slack_user_id', () => {
    assert.ok(sql.includes('slack_user_id VARCHAR(50) UNIQUE NOT NULL'));
  });

  test('slack_checkin_config has UNIQUE contractor_id', () => {
    assert.ok(sql.includes('contractor_id UUID REFERENCES contractors(id) UNIQUE'));
  });

  test('Default check_in_time is 09:00', () => {
    assert.ok(sql.includes("DEFAULT '09:00:00'"));
  });

  test('Default timezone is Europe/Budapest', () => {
    assert.ok(sql.includes("DEFAULT 'Europe/Budapest'"));
  });

  test('Default message template is Hungarian', () => {
    assert.ok(sql.includes('Hogy érzed magad ma'));
  });

  test('Has message_ts column for Slack correlation', () => {
    assert.ok(sql.includes('message_ts VARCHAR(50) NOT NULL'));
  });

  test('Has channel_id column', () => {
    assert.ok(sql.includes('channel_id VARCHAR(50) NOT NULL'));
  });

  test('Has response_emoji column', () => {
    assert.ok(sql.includes('response_emoji VARCHAR(50)'));
  });

  test('Creates at least 7 indexes', () => {
    const indexCount = (sql.match(/CREATE INDEX IF NOT EXISTS/g) || []).length;
    assert.ok(indexCount >= 7, `Expected ≥7 indexes, got ${indexCount}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE
// ═══════════════════════════════════════════════════════════════════════════

describe('SlackBotService — Structure', () => {
  const svcPath = path.join(backendRoot, 'src', 'services', 'slack', 'slackBot.service.js');

  test('Service file exists', () => {
    assert.ok(fs.existsSync(svcPath));
  });

  const src = fs.readFileSync(svcPath, 'utf8');

  test('Defines EMOJI_MOOD_MAP', () => {
    assert.ok(src.includes('EMOJI_MOOD_MAP'));
  });

  test('Maps :sob: to mood 1', () => {
    assert.ok(src.includes("':sob:': 1"));
  });

  test('Maps :grinning: to mood 5', () => {
    assert.ok(src.includes("':grinning:': 5"));
  });

  test('Maps :neutral_face: to mood 3', () => {
    assert.ok(src.includes("':neutral_face:': 3"));
  });

  test('Maps :slightly_smiling_face: to mood 4', () => {
    assert.ok(src.includes("':slightly_smiling_face:': 4"));
  });

  test('Defines REACTION_EMOJIS array', () => {
    assert.ok(src.includes('REACTION_EMOJIS'));
    assert.ok(src.includes("'sob'"));
    assert.ok(src.includes("'grinning'"));
  });

  test('Has initialize method', () => {
    assert.ok(src.includes('async initialize()'));
  });

  test('Has setupEventHandlers method', () => {
    assert.ok(src.includes('setupEventHandlers()'));
  });

  test('Handles reaction_added event', () => {
    assert.ok(src.includes("'reaction_added'"));
  });

  test('Handles app_mention event', () => {
    assert.ok(src.includes("'app_mention'"));
  });

  test('Has handleReaction method', () => {
    assert.ok(src.includes('async handleReaction('));
  });

  test('Has sendDailyCheckIn method', () => {
    assert.ok(src.includes('async sendDailyCheckIn('));
  });

  test('Has syncUsers method', () => {
    assert.ok(src.includes('async syncUsers('));
  });

  test('Has sendTestMessage method', () => {
    assert.ok(src.includes('async sendTestMessage('));
  });

  test('Has start method', () => {
    assert.ok(src.includes('async start('));
  });

  test('Submits pulse via wellmindService', () => {
    assert.ok(src.includes('wellmindService.submitPulse'));
  });

  test('Awards gamification points on Slack pulse', () => {
    assert.ok(src.includes("gamificationService.awardPoints"));
  });

  test('Updates streak on Slack pulse', () => {
    assert.ok(src.includes('gamificationService.updateStreak'));
  });

  test('Sends emoji hint context block', () => {
    assert.ok(src.includes('Reagálj emoji-val'));
  });

  test('Users sync matches by email', () => {
    assert.ok(src.includes('WHERE email = $1 AND contractor_id = $2'));
  });

  test('User sync upserts with ON CONFLICT', () => {
    assert.ok(src.includes('ON CONFLICT (slack_user_id)'));
  });

  test('Gracefully handles missing SLACK_BOT_TOKEN', () => {
    assert.ok(src.includes('SLACK_BOT_TOKEN not set'));
  });

  test('Exports singleton + class', () => {
    assert.ok(src.includes('module.exports = new SlackBotService()'));
    assert.ok(src.includes('module.exports.SlackBotService = SlackBotService'));
  });
});

describe('SlackBotService — Emoji Mood Coverage', () => {
  const svcPath = path.join(backendRoot, 'src', 'services', 'slack', 'slackBot.service.js');
  const src = fs.readFileSync(svcPath, 'utf8');

  // Extract all emoji mappings
  const emojiLines = src.match(/':[\w-]+:':\s*\d/g) || [];

  test('Has at least 12 emoji mappings', () => {
    assert.ok(emojiLines.length >= 12, `Expected ≥12 emoji mappings, got ${emojiLines.length}`);
  });

  test('All 5 mood levels (1-5) are covered', () => {
    for (let mood = 1; mood <= 5; mood++) {
      const found = emojiLines.some(l => l.endsWith(String(mood)));
      assert.ok(found, `Mood level ${mood} not covered`);
    }
  });

  test('Default mood for unknown emoji is 3 (neutral)', () => {
    assert.ok(src.includes('|| 3'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

describe('SlackController — Exports', () => {
  const controller = require('../src/controllers/slack.controller');

  test('Exports getConfig', () => {
    assert.strictEqual(typeof controller.getConfig, 'function');
  });

  test('Exports updateConfig', () => {
    assert.strictEqual(typeof controller.updateConfig, 'function');
  });

  test('Exports syncUsers', () => {
    assert.strictEqual(typeof controller.syncUsers, 'function');
  });

  test('Exports sendTestMessage', () => {
    assert.strictEqual(typeof controller.sendTestMessage, 'function');
  });

  test('Exports getStats', () => {
    assert.strictEqual(typeof controller.getStats, 'function');
  });

  test('Exports getSlackUsers', () => {
    assert.strictEqual(typeof controller.getSlackUsers, 'function');
  });

  test('Exports toggleSlackUser', () => {
    assert.strictEqual(typeof controller.toggleSlackUser, 'function');
  });
});

describe('SlackController — Validation', () => {
  const ctrlPath = path.join(backendRoot, 'src', 'controllers', 'slack.controller.js');
  const src = fs.readFileSync(ctrlPath, 'utf8');

  test('Validates time format (HH:MM)', () => {
    assert.ok(src.includes('\\d{2}:\\d{2}'));
  });

  test('Config upsert uses ON CONFLICT', () => {
    assert.ok(src.includes('ON CONFLICT (contractor_id)'));
  });

  test('Stats calculates response rate', () => {
    assert.ok(src.includes('responseRateToday'));
    assert.ok(src.includes('responseRateWeek'));
  });

  test('Stats query covers today + weekly periods', () => {
    assert.ok(src.includes('CURRENT_DATE'));
    assert.ok(src.includes("INTERVAL '7 days'"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

describe('Slack Routes', () => {
  const routes = require('../src/routes/slack.routes');

  test('Routes module exports an Express router', () => {
    assert.ok(routes);
    assert.ok(routes.stack || typeof routes === 'function');
  });

  const routesPath = path.join(backendRoot, 'src', 'routes', 'slack.routes.js');
  const src = fs.readFileSync(routesPath, 'utf8');

  test('Requires authenticateToken', () => {
    assert.ok(src.includes('authenticateToken'));
  });

  test('Requires admin permission', () => {
    assert.ok(src.includes("checkPermission('blue_colibri.admin.manage')"));
  });

  test('Defines GET /config', () => {
    assert.ok(src.includes("'/config'"));
  });

  test('Defines PUT /config', () => {
    assert.ok(src.includes("router.put('/config'"));
  });

  test('Defines POST /sync-users', () => {
    assert.ok(src.includes("'/sync-users'"));
  });

  test('Defines POST /test-message', () => {
    assert.ok(src.includes("'/test-message'"));
  });

  test('Defines GET /stats', () => {
    assert.ok(src.includes("'/stats'"));
  });

  test('Defines GET /users', () => {
    assert.ok(src.includes("'/users'"));
  });

  test('Defines PUT /users/:id/toggle', () => {
    assert.ok(src.includes("'/users/:id/toggle'"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SERVER.JS REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Server.js — Slack Registration', () => {
  const serverPath = path.join(backendRoot, 'src', 'server.js');
  const src = fs.readFileSync(serverPath, 'utf8');

  test('Imports slack routes', () => {
    assert.ok(src.includes("require('./routes/slack.routes')"));
  });

  test('Mounts at /slack prefix', () => {
    assert.ok(src.includes('/slack'));
  });

  test('Imports slackBotService', () => {
    assert.ok(src.includes("require('./services/slack/slackBot.service')"));
  });

  test('Initializes Slack bot on startup', () => {
    assert.ok(src.includes('slackBotService.initialize()'));
  });

  test('Gracefully skips if SLACK_BOT_TOKEN not set', () => {
    assert.ok(src.includes('SLACK_BOT_TOKEN'));
    assert.ok(src.includes('Slack integration disabled'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CRON JOB
// ═══════════════════════════════════════════════════════════════════════════

describe('Cron Schedule — Slack Daily Check-in', () => {
  const cronPath = path.join(backendRoot, 'src', 'config', 'cronSchedule.js');
  const src = fs.readFileSync(cronPath, 'utf8');

  test('Imports slackBotService', () => {
    assert.ok(src.includes("require('../services/slack/slackBot.service')"));
  });

  test('Schedules Slack check-in cron job', () => {
    assert.ok(src.includes('slackDailyCheckIn'));
  });

  test('Runs Mon-Fri at 9 AM', () => {
    // Find the line with slackDailyCheckIn
    assert.ok(src.includes("'0 9 * * 1-5'"));
  });

  test('Queries enabled contractors', () => {
    assert.ok(src.includes('slack_checkin_config WHERE enabled = true'));
  });

  test('Calls sendDailyCheckIn for each contractor', () => {
    assert.ok(src.includes('slackBotService.sendDailyCheckIn'));
  });

  test('Total jobs count updated to 9', () => {
    assert.ok(src.includes('9 jobs'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN UI
// ═══════════════════════════════════════════════════════════════════════════

describe('Admin — SlackIntegration Page', () => {
  const pagePath = path.join(adminRoot, 'pages', 'SlackIntegration.jsx');

  test('Page file exists', () => {
    assert.ok(fs.existsSync(pagePath));
  });

  const src = fs.readFileSync(pagePath, 'utf8');

  test('Imports slackAPI', () => {
    assert.ok(src.includes('slackAPI'));
  });

  test('Has enable/disable toggle', () => {
    assert.ok(src.includes('config.enabled'));
    assert.ok(src.includes('<Switch'));
  });

  test('Has check-in time picker', () => {
    assert.ok(src.includes('check_in_time'));
    assert.ok(src.includes('type="time"'));
  });

  test('Has message template editor', () => {
    assert.ok(src.includes('message_template'));
    assert.ok(src.includes('multiline'));
  });

  test('Has user sync button', () => {
    assert.ok(src.includes('handleSync'));
    assert.ok(src.includes('syncUsers'));
  });

  test('Has test message button', () => {
    assert.ok(src.includes('handleTest'));
    assert.ok(src.includes('sendTestMessage'));
  });

  test('Shows stats (users synced, sent, responses, rate)', () => {
    assert.ok(src.includes('usersSynced'));
    assert.ok(src.includes('sentToday'));
    assert.ok(src.includes('responsesToday'));
    assert.ok(src.includes('responseRateWeek'));
  });

  test('Shows users table with toggle', () => {
    assert.ok(src.includes('handleToggleUser'));
    assert.ok(src.includes('<Table'));
  });

  test('Shows emoji mood map reference', () => {
    assert.ok(src.includes('Nagyon rossz'));
    assert.ok(src.includes('Nagyon jó'));
  });

  test('Has setup guide alert', () => {
    assert.ok(src.includes('api.slack.com/apps'));
    assert.ok(src.includes('SLACK_BOT_TOKEN'));
  });
});

describe('Admin — API Service (slackAPI)', () => {
  const apiPath = path.join(adminRoot, 'services', 'api.js');
  const src = fs.readFileSync(apiPath, 'utf8');

  test('Exports slackAPI object', () => {
    assert.ok(src.includes('export const slackAPI'));
  });

  test('slackAPI.getConfig calls GET /slack/config', () => {
    assert.ok(src.includes("api.get('/slack/config')"));
  });

  test('slackAPI.updateConfig calls PUT /slack/config', () => {
    assert.ok(src.includes("api.put('/slack/config'"));
  });

  test('slackAPI.syncUsers calls POST /slack/sync-users', () => {
    assert.ok(src.includes("api.post('/slack/sync-users')"));
  });

  test('slackAPI.sendTestMessage calls POST /slack/test-message', () => {
    assert.ok(src.includes("api.post('/slack/test-message')"));
  });

  test('slackAPI.getStats calls GET /slack/stats', () => {
    assert.ok(src.includes("api.get('/slack/stats')"));
  });

  test('slackAPI.getUsers calls GET /slack/users', () => {
    assert.ok(src.includes("api.get('/slack/users')"));
  });

  test('slackAPI.toggleUser calls PUT /slack/users/:id/toggle', () => {
    assert.ok(src.includes('/slack/users/${id}/toggle'));
  });
});

describe('Admin — App.jsx Route', () => {
  const appPath = path.join(adminRoot, 'App.jsx');
  const src = fs.readFileSync(appPath, 'utf8');

  test('Imports SlackIntegration page', () => {
    assert.ok(src.includes("import SlackIntegration from './pages/SlackIntegration'"));
  });

  test('Registers /slack route', () => {
    assert.ok(src.includes('path="slack"'));
  });

  test('Route requires settings.edit permission', () => {
    // Find the slack route line
    const slackLine = src.split('\n').find(l => l.includes('path="slack"'));
    assert.ok(slackLine && slackLine.includes('settings.edit'));
  });
});

describe('Admin — Layout Sidebar', () => {
  const layoutPath = path.join(adminRoot, 'components', 'Layout.jsx');
  const src = fs.readFileSync(layoutPath, 'utf8');

  test('Imports SlackIcon', () => {
    assert.ok(src.includes('SlackIcon'));
  });

  test('Has Slack menu item', () => {
    assert.ok(src.includes("text: 'Slack'"));
  });

  test('Slack menu links to /slack', () => {
    assert.ok(src.includes("path: '/slack'"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DEPENDENCY
// ═══════════════════════════════════════════════════════════════════════════

describe('Dependencies — @slack/bolt', () => {
  const pkgPath = path.join(backendRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  test('@slack/bolt is in dependencies', () => {
    assert.ok(
      pkg.dependencies['@slack/bolt'] || pkg.devDependencies?.['@slack/bolt'],
      '@slack/bolt not found in package.json'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log(`📊 Slack Integration Tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\n❌ Failures:');
  failures.forEach(f => console.log(`   - ${f.name}: ${f.error}`));
}
console.log('═'.repeat(60));

process.exit(failed > 0 ? 1 : 0);
