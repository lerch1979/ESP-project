/**
 * Gamification Engine Tests — Session 23
 * Points, badges, streaks, leaderboard
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

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Migration 069 — Gamification Schema', () => {
  const migrationPath = path.join(__dirname, '..', 'migrations', '069_gamification_engine.sql');

  test('Migration file exists', () => {
    assert.ok(fs.existsSync(migrationPath));
  });

  const sql = fs.readFileSync(migrationPath, 'utf8');

  test('Creates wellbeing_points table', () => {
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS wellbeing_points'));
  });

  test('Creates wellbeing_badges table', () => {
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS wellbeing_badges'));
  });

  test('Creates user_badges table', () => {
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS user_badges'));
  });

  test('Creates wellbeing_streaks table', () => {
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS wellbeing_streaks'));
  });

  test('wellbeing_points has user_id FK with CASCADE', () => {
    assert.ok(sql.includes('user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE'));
  });

  test('wellbeing_points has contractor_id FK', () => {
    assert.ok(sql.includes('contractor_id UUID REFERENCES contractors(id)'));
  });

  test('wellbeing_points has action_type column', () => {
    assert.ok(sql.includes('action_type VARCHAR(50) NOT NULL'));
  });

  test('wellbeing_badges has unique badge_type', () => {
    assert.ok(sql.includes('badge_type VARCHAR(50) UNIQUE NOT NULL'));
  });

  test('user_badges has UNIQUE(user_id, badge_id)', () => {
    assert.ok(sql.includes('UNIQUE(user_id, badge_id)'));
  });

  test('wellbeing_streaks has UNIQUE(user_id, streak_type)', () => {
    assert.ok(sql.includes('UNIQUE(user_id, streak_type)'));
  });

  test('Creates idx_points_user index', () => {
    assert.ok(sql.includes('CREATE INDEX IF NOT EXISTS idx_points_user ON wellbeing_points(user_id)'));
  });

  test('Creates idx_points_contractor index', () => {
    assert.ok(sql.includes('CREATE INDEX IF NOT EXISTS idx_points_contractor ON wellbeing_points(contractor_id)'));
  });

  test('Creates idx_points_earned index', () => {
    assert.ok(sql.includes('CREATE INDEX IF NOT EXISTS idx_points_earned ON wellbeing_points(earned_at)'));
  });

  test('Creates idx_user_badges_user index', () => {
    assert.ok(sql.includes('CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id)'));
  });

  test('Creates idx_streaks_user index', () => {
    assert.ok(sql.includes('CREATE INDEX IF NOT EXISTS idx_streaks_user ON wellbeing_streaks(user_id)'));
  });

  // Badge seeds
  test('Seeds 7_day_streak badge', () => {
    assert.ok(sql.includes("'7_day_streak'"));
  });

  test('Seeds 30_day_streak badge', () => {
    assert.ok(sql.includes("'30_day_streak'"));
  });

  test('Seeds 90_day_streak badge', () => {
    assert.ok(sql.includes("'90_day_streak'"));
  });

  test('Seeds assessment_master badge', () => {
    assert.ok(sql.includes("'assessment_master'"));
  });

  test('Seeds wellness_warrior badge (1000 points)', () => {
    assert.ok(sql.includes("'wellness_warrior'"));
    assert.ok(sql.includes('1000'));
  });

  test('Seeds early_bird badge', () => {
    assert.ok(sql.includes("'early_bird'"));
  });

  test('Seeds consistency_king badge', () => {
    assert.ok(sql.includes("'consistency_king'"));
  });

  test('Seeds exactly 7 badges', () => {
    const badgeMatches = sql.match(/\('[a-z0-9_]+',\s*'/g);
    assert.ok(badgeMatches);
    assert.strictEqual(badgeMatches.length, 7, `Expected 7 badges, got ${badgeMatches.length}`);
  });

  test('Uses ON CONFLICT for badge upsert safety', () => {
    assert.ok(sql.includes('ON CONFLICT (badge_type) DO NOTHING'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('GamificationService — POINTS_CONFIG', () => {
  // Service is a singleton instance, import to test config
  const svcPath = path.join(__dirname, '..', 'src', 'services', 'gamification.service.js');
  const src = fs.readFileSync(svcPath, 'utf8');

  test('pulse_survey = 10 points', () => {
    assert.ok(src.includes('pulse_survey: 10'));
  });

  test('assessment_complete = 50 points', () => {
    assert.ok(src.includes('assessment_complete: 50'));
  });

  test('coaching_session = 100 points', () => {
    assert.ok(src.includes('coaching_session: 100'));
  });

  test('intervention_complete = 75 points', () => {
    assert.ok(src.includes('intervention_complete: 75'));
  });

  test('carepath_case_resolved = 50 points', () => {
    assert.ok(src.includes('carepath_case_resolved: 50'));
  });
});

describe('GamificationService — Class Methods', () => {
  const svcPath = path.join(__dirname, '..', 'src', 'services', 'gamification.service.js');
  const src = fs.readFileSync(svcPath, 'utf8');

  test('Has awardPoints method', () => {
    assert.ok(src.includes('async awardPoints('));
  });

  test('Has getUserPoints method', () => {
    assert.ok(src.includes('async getUserPoints('));
  });

  test('Has updateStreak method', () => {
    assert.ok(src.includes('async updateStreak('));
  });

  test('Has checkBadgeUnlocks method', () => {
    assert.ok(src.includes('async checkBadgeUnlocks('));
  });

  test('Has checkStreakBadges method', () => {
    assert.ok(src.includes('async checkStreakBadges('));
  });

  test('Has awardBadge method (idempotent)', () => {
    assert.ok(src.includes('async awardBadge('));
    assert.ok(src.includes('ON CONFLICT (user_id, badge_id) DO NOTHING'));
  });

  test('Has getUserStats method', () => {
    assert.ok(src.includes('async getUserStats('));
  });

  test('Has getLeaderboard method', () => {
    assert.ok(src.includes('async getLeaderboard('));
  });

  test('Has getPointsHistory method', () => {
    assert.ok(src.includes('async getPointsHistory('));
  });

  test('Leaderboard requires min 5 actions (privacy)', () => {
    assert.ok(src.includes('HAVING COUNT(*) >= 5'));
  });

  test('Leaderboard limits to top 10', () => {
    assert.ok(src.includes('LIMIT 10'));
  });

  test('Service is exported as singleton instance', () => {
    assert.ok(src.includes('module.exports = new GamificationService()'));
  });

  test('Streak milestone checks 7/30/90 days', () => {
    assert.ok(src.includes("days: 7,  badgeType: '7_day_streak'"));
    assert.ok(src.includes("days: 30, badgeType: '30_day_streak'"));
    assert.ok(src.includes("days: 90, badgeType: '90_day_streak'"));
  });

  test('Checks early_bird (50 pulses before 9am)', () => {
    assert.ok(src.includes('EXTRACT(HOUR FROM earned_at) < 9'));
    assert.ok(src.includes('>= 50'));
  });

  test('Checks consistency_king (100 total pulses)', () => {
    assert.ok(src.includes('count >= 100'));
  });

  test('Checks assessment_master (10 assessments)', () => {
    assert.ok(src.includes('>= 10'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CONTROLLER TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('GamificationController — Exports', () => {
  const controller = require('../src/controllers/gamification.controller');

  test('Exports getMyStats', () => {
    assert.strictEqual(typeof controller.getMyStats, 'function');
  });

  test('Exports getLeaderboard', () => {
    assert.strictEqual(typeof controller.getLeaderboard, 'function');
  });

  test('Exports getAvailableBadges', () => {
    assert.strictEqual(typeof controller.getAvailableBadges, 'function');
  });

  test('Exports getPointsHistory', () => {
    assert.strictEqual(typeof controller.getPointsHistory, 'function');
  });
});

describe('GamificationController — Leaderboard Validation', () => {
  const ctrlPath = path.join(__dirname, '..', 'src', 'controllers', 'gamification.controller.js');
  const src = fs.readFileSync(ctrlPath, 'utf8');

  test('Validates period parameter (7days, 30days, 90days)', () => {
    assert.ok(src.includes("['7days', '30days', '90days']"));
  });

  test('Returns 400 on invalid period', () => {
    assert.ok(src.includes('res.status(400)'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Gamification Routes', () => {
  const routes = require('../src/routes/gamification.routes');

  test('Routes module exports an Express router', () => {
    assert.ok(routes);
    assert.ok(routes.stack || typeof routes === 'function');
  });

  const routesPath = path.join(__dirname, '..', 'src', 'routes', 'gamification.routes.js');
  const src = fs.readFileSync(routesPath, 'utf8');

  test('Requires authenticateToken middleware', () => {
    assert.ok(src.includes("authenticateToken"));
  });

  test('Defines GET /my-stats', () => {
    assert.ok(src.includes("'/my-stats'"));
  });

  test('Defines GET /leaderboard', () => {
    assert.ok(src.includes("'/leaderboard'"));
  });

  test('Defines GET /badges/available', () => {
    assert.ok(src.includes("'/badges/available'"));
  });

  test('Defines GET /points-history', () => {
    assert.ok(src.includes("'/points-history'"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS — wellmind controller hooks
// ═══════════════════════════════════════════════════════════════════════════

describe('WellMind Controller — Gamification Integration', () => {
  const ctrlPath = path.join(__dirname, '..', 'src', 'controllers', 'wellmind.controller.js');
  const src = fs.readFileSync(ctrlPath, 'utf8');

  test('Imports gamification service', () => {
    assert.ok(src.includes("require('../services/gamification.service')"));
  });

  test('Awards pulse_survey points on pulse submit', () => {
    assert.ok(src.includes("'pulse_survey'"));
  });

  test('Updates streak on pulse submit', () => {
    assert.ok(src.includes('updateStreak'));
  });

  test('Awards assessment_complete points on assessment', () => {
    assert.ok(src.includes("'assessment_complete'"));
  });

  test('Awards intervention_complete points on intervention completion', () => {
    assert.ok(src.includes("'intervention_complete'"));
  });

  test('Awards coaching_session points on coaching feedback', () => {
    assert.ok(src.includes("'coaching_session'"));
  });

  test('Gamification errors caught (non-blocking)', () => {
    const catchCount = (src.match(/\.catch\(err/g) || []).length;
    assert.ok(catchCount >= 3, `Expected ≥ 3 .catch(err) calls, got ${catchCount}`);
  });
});

describe('CarePath Controller — Gamification Integration', () => {
  const ctrlPath = path.join(__dirname, '..', 'src', 'controllers', 'carepath.controller.js');
  const src = fs.readFileSync(ctrlPath, 'utf8');

  test('Imports gamification service', () => {
    assert.ok(src.includes("require('../services/gamification.service')"));
  });

  test('Awards carepath_case_resolved points on case close', () => {
    assert.ok(src.includes("'carepath_case_resolved'"));
  });

  test('Gamification error caught (non-blocking)', () => {
    assert.ok(src.includes(".catch(err => logger.error('Gamification error (carepath):'"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SERVER REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════

describe('Server.js — Gamification Route Registration', () => {
  const serverPath = path.join(__dirname, '..', 'src', 'server.js');
  const src = fs.readFileSync(serverPath, 'utf8');

  test('Imports gamification routes', () => {
    assert.ok(src.includes("require('./routes/gamification.routes')"));
  });

  test('Mounts at /gamification prefix', () => {
    assert.ok(src.includes('/gamification'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MOBILE APP TESTS
// ═══════════════════════════════════════════════════════════════════════════

const mobileRoot = path.join(__dirname, '..', '..', '..', 'hr-erp-mobile', 'src');

describe('Mobile — Gamification API Service', () => {
  const apiPath = path.join(mobileRoot, 'services', 'gamification', 'api.js');

  test('API service file exists', () => {
    assert.ok(fs.existsSync(apiPath));
  });

  const src = fs.readFileSync(apiPath, 'utf8');

  test('Has getMyStats method', () => {
    assert.ok(src.includes('getMyStats'));
  });

  test('Has getLeaderboard method', () => {
    assert.ok(src.includes('getLeaderboard'));
  });

  test('Has getAvailableBadges method', () => {
    assert.ok(src.includes('getAvailableBadges'));
  });

  test('Has getPointsHistory method', () => {
    assert.ok(src.includes('getPointsHistory'));
  });

  test('Calls correct API endpoints', () => {
    assert.ok(src.includes('/gamification/my-stats'));
    assert.ok(src.includes('/gamification/leaderboard'));
    assert.ok(src.includes('/gamification/badges/available'));
    assert.ok(src.includes('/gamification/points-history'));
  });
});

describe('Mobile — Gamification Components', () => {
  const componentsDir = path.join(mobileRoot, 'components', 'Gamification');

  test('StreakDisplay component exists', () => {
    assert.ok(fs.existsSync(path.join(componentsDir, 'StreakDisplay.js')));
  });

  test('PointsCard component exists', () => {
    assert.ok(fs.existsSync(path.join(componentsDir, 'PointsCard.js')));
  });

  test('BadgeCarousel component exists', () => {
    assert.ok(fs.existsSync(path.join(componentsDir, 'BadgeCarousel.js')));
  });
});

describe('Mobile — Gamification Screens', () => {
  const screensDir = path.join(mobileRoot, 'screens', 'Gamification');

  test('BadgeCollectionScreen exists', () => {
    assert.ok(fs.existsSync(path.join(screensDir, 'BadgeCollectionScreen.js')));
  });

  test('LeaderboardScreen exists', () => {
    assert.ok(fs.existsSync(path.join(screensDir, 'LeaderboardScreen.js')));
  });

  const leaderboardSrc = fs.readFileSync(path.join(screensDir, 'LeaderboardScreen.js'), 'utf8');

  test('LeaderboardScreen has period filter (7/30/90 days)', () => {
    assert.ok(leaderboardSrc.includes("'7days'"));
    assert.ok(leaderboardSrc.includes("'30days'"));
    assert.ok(leaderboardSrc.includes("'90days'"));
  });

  test('LeaderboardScreen shows minimum activity notice', () => {
    assert.ok(leaderboardSrc.includes('Minimum 5 aktivitás'));
  });
});

describe('Mobile — Navigation Updates', () => {
  const wellbeingNavPath = path.join(mobileRoot, 'navigation', 'WellbeingStackNavigator.js');
  const moreNavPath = path.join(mobileRoot, 'navigation', 'MoreStackNavigator.js');

  const wellbeingSrc = fs.readFileSync(wellbeingNavPath, 'utf8');
  const moreSrc = fs.readFileSync(moreNavPath, 'utf8');

  test('WellbeingStackNavigator imports BadgeCollectionScreen', () => {
    assert.ok(wellbeingSrc.includes('BadgeCollectionScreen'));
  });

  test('WellbeingStackNavigator imports LeaderboardScreen', () => {
    assert.ok(wellbeingSrc.includes('LeaderboardScreen'));
  });

  test('WellbeingStackNavigator registers BadgeCollection route', () => {
    assert.ok(wellbeingSrc.includes('"BadgeCollection"'));
  });

  test('WellbeingStackNavigator registers Leaderboard route', () => {
    assert.ok(wellbeingSrc.includes('"Leaderboard"'));
  });

  test('MoreStackNavigator imports BadgeCollectionScreen', () => {
    assert.ok(moreSrc.includes('BadgeCollectionScreen'));
  });

  test('MoreStackNavigator imports LeaderboardScreen', () => {
    assert.ok(moreSrc.includes('LeaderboardScreen'));
  });

  test('MoreStackNavigator registers BadgeCollection route', () => {
    assert.ok(moreSrc.includes('"BadgeCollection"'));
  });

  test('MoreStackNavigator registers Leaderboard route', () => {
    assert.ok(moreSrc.includes('"Leaderboard"'));
  });
});

describe('Mobile — WellMindDashboard Gamification Section', () => {
  const dashPath = path.join(mobileRoot, 'screens', 'WellMind', 'WellMindDashboard.js');
  const src = fs.readFileSync(dashPath, 'utf8');

  test('Imports gamification API', () => {
    assert.ok(src.includes('gamificationAPI'));
  });

  test('Imports StreakDisplay component', () => {
    assert.ok(src.includes('StreakDisplay'));
  });

  test('Imports BadgeCarousel component', () => {
    assert.ok(src.includes('BadgeCarousel'));
  });

  test('Fetches gamification stats in parallel with dashboard', () => {
    assert.ok(src.includes('Promise.all'));
    assert.ok(src.includes('gamificationAPI.getMyStats()'));
  });

  test('Displays gamification section', () => {
    assert.ok(src.includes('Gamification'));
  });

  test('Shows points, streak, and badge count', () => {
    assert.ok(src.includes('gamification.points'));
    assert.ok(src.includes('gamification.currentStreak'));
    assert.ok(src.includes('gamification.badgesEarned'));
  });

  test('Links to BadgeCollection screen', () => {
    assert.ok(src.includes("navigate('BadgeCollection')"));
  });

  test('Links to Leaderboard screen', () => {
    assert.ok(src.includes("'Leaderboard'"));
  });
});

describe('Mobile — MoreMenuScreen Menu Items', () => {
  const menuPath = path.join(mobileRoot, 'screens', 'more', 'MoreMenuScreen.js');
  const src = fs.readFileSync(menuPath, 'utf8');

  test('Has Jelvények menu item', () => {
    assert.ok(src.includes("label: 'Jelvények'"));
  });

  test('Has Ranglista menu item', () => {
    assert.ok(src.includes("label: 'Ranglista'"));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log(`📊 Gamification Tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\n❌ Failures:');
  failures.forEach(f => console.log(`   - ${f.name}: ${f.error}`));
}
console.log('═'.repeat(60));

process.exit(failed > 0 ? 1 : 0);
