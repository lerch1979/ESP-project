#!/usr/bin/env node

/**
 * HR-ERP Automatikus Backup Rendszer
 *
 * - Git commit + push
 * - Backup jelentes generalas (magyar)
 * - Teszt eredmenyek
 * - Opcionalis Google Drive masolat
 *
 * Futtatas:
 *   node scripts/auto_backup.js              # Teljes backup
 *   node scripts/auto_backup.js --dry-run    # Csak jelentes, nincs commit/push
 *   node scripts/auto_backup.js --no-push    # Commit, de nincs push
 *   node scripts/auto_backup.js --no-test    # Tesztek kihagyasa
 */

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Load .env for PROJECT_ROOT etc
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

// ============================================
// CONFIG
// ============================================

const CONFIG_PATH = path.resolve(__dirname, 'backup_config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '..', '..', '..');
const BACKUP_DIR = path.resolve(__dirname, '..', config.backup_path);
const BACKEND_DIR = path.resolve(__dirname, '..');

// CLI flags
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NO_PUSH = args.includes('--no-push');
const NO_TEST = args.includes('--no-test');

// ============================================
// HELPERS
// ============================================

function timestamp() {
  const now = new Date();
  return now.toISOString().replace(/[T:]/g, '-').substring(0, 16);
}

function dateHu() {
  return new Date().toLocaleString('hu-HU', {
    year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'long', hour: '2-digit', minute: '2-digit',
  });
}

function exec(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      timeout: 30000,
      cwd: PROJECT_ROOT,
      ...opts,
    }).trim();
  } catch (error) {
    return error.stdout ? error.stdout.trim() : `HIBA: ${error.message}`;
  }
}

function log(msg) {
  console.log(`[backup] ${msg}`);
}

// ============================================
// GIT OPERATIONS
// ============================================

function getGitStatus() {
  const status = exec('git status --porcelain');
  if (!status) return { clean: true, files: [], summary: 'Nincs valtozas' };

  const files = status.split('\n').filter(Boolean).map((line) => {
    const flag = line.substring(0, 2).trim();
    const file = line.substring(3);
    const type = { M: 'modositva', A: 'uj', D: 'torolve', '??': 'nem kovetett', R: 'atnevezve' }[flag] || flag;
    return { flag, file, type };
  });

  const modified = files.filter((f) => f.flag === 'M').length;
  const added = files.filter((f) => f.flag === '??' || f.flag === 'A').length;
  const deleted = files.filter((f) => f.flag === 'D').length;

  const parts = [];
  if (modified) parts.push(`${modified} modositott`);
  if (added) parts.push(`${added} uj`);
  if (deleted) parts.push(`${deleted} torolt`);

  return {
    clean: false,
    files,
    summary: parts.join(', ') || `${files.length} fajl`,
  };
}

function getRecentCommits(count = 5) {
  const log = exec(`git log --oneline -${count} --pretty=format:"%h|%s|%an|%ai"`);
  if (!log) return [];

  return log.split('\n').filter(Boolean).map((line) => {
    const [hash, message, author, date] = line.split('|');
    return { hash, message, author, date: date ? date.substring(0, 16) : '' };
  });
}

function getTodayChanges() {
  const today = new Date().toISOString().substring(0, 10);
  const log = exec(`git log --since="${today}T00:00:00" --pretty=format:"%h|%s|%an" --stat`);
  if (!log) return { commits: 0, files: 0, insertions: 0, deletions: 0, details: '' };

  const commitCount = (log.match(/%h\|/g) || []).length || log.split('\n').filter((l) => l.includes('|')).length;

  let totalFiles = 0, totalIns = 0, totalDel = 0;
  for (const line of log.split('\n')) {
    const stat = line.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
    if (stat) {
      totalFiles += parseInt(stat[1]) || 0;
      totalIns += parseInt(stat[2]) || 0;
      totalDel += parseInt(stat[3]) || 0;
    }
  }

  return { commits: commitCount, files: totalFiles, insertions: totalIns, deletions: totalDel, details: log };
}

function getCurrentBranch() {
  return exec('git branch --show-current') || 'main';
}

function gitCommit(message) {
  if (DRY_RUN) {
    log(`[DRY-RUN] Git commit: "${message}"`);
    return true;
  }

  try {
    exec('git add -A');
    execSync(`git commit -m "${message}"`, { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 15000 });
    log('Git commit sikeres');
    return true;
  } catch (error) {
    if (error.message.includes('nothing to commit')) {
      log('Nincs commitolnivalo');
      return false;
    }
    log(`Git commit hiba: ${error.message}`);
    return false;
  }
}

function gitPush() {
  if (DRY_RUN) {
    log('[DRY-RUN] Git push kihagyva');
    return true;
  }
  if (NO_PUSH) {
    log('Git push kihagyva (--no-push)');
    return true;
  }

  try {
    execSync('git push', { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 30000 });
    log('Git push sikeres');
    return true;
  } catch (error) {
    log(`Git push hiba: ${error.message}`);
    return false;
  }
}

// ============================================
// TEST RUNNER
// ============================================

function runTests() {
  if (NO_TEST || !config.include_test_results) {
    return { skipped: true, summary: 'Tesztek kihagyva' };
  }

  const testFiles = ['payment.test.js', 'costCenter.test.js', 'invoice.test.js', 'sprint2-invoice.test.js', 'agentEmail.test.js'];
  const results = [];

  for (const file of testFiles) {
    const filePath = path.join(BACKEND_DIR, 'tests', file);
    if (!fs.existsSync(filePath)) continue;

    try {
      const output = execSync(`node "${filePath}"`, { encoding: 'utf-8', timeout: 30000, cwd: BACKEND_DIR });
      const match = output.match(/Results:\s*(\d+)\s*passed,\s*(\d+)\s*failed,\s*(\d+)\s*total/);
      results.push({
        file,
        passed: match ? parseInt(match[1]) : 0,
        failed: match ? parseInt(match[2]) : 0,
        total: match ? parseInt(match[3]) : 0,
        success: match ? parseInt(match[2]) === 0 : false,
      });
    } catch (error) {
      results.push({ file, passed: 0, failed: 1, total: 1, success: false });
    }
  }

  const totalPassed = results.reduce((s, r) => s + r.passed, 0);
  const totalFailed = results.reduce((s, r) => s + r.failed, 0);
  const totalTests = results.reduce((s, r) => s + r.total, 0);

  return {
    skipped: false,
    results,
    totalPassed,
    totalFailed,
    totalTests,
    allPassed: totalFailed === 0,
    summary: `${totalPassed}/${totalTests} sikeres${totalFailed > 0 ? `, ${totalFailed} sikertelen` : ''}`,
  };
}

// ============================================
// BACKUP REPORT
// ============================================

function generateReport(gitStatus, todayChanges, recentCommits, testResults, commitDone, pushDone) {
  const ts = timestamp();
  const branch = getCurrentBranch();

  const testSection = testResults.skipped
    ? '> Tesztek kihagyva\n'
    : testResults.results.map((r) =>
        `| ${r.file} | ${r.passed} | ${r.failed} | ${r.total} | ${r.success ? 'SIKERES' : 'SIKERTELEN'} |`
      ).join('\n');

  const testTableHeader = testResults.skipped ? '' : `
| Teszt fajl | Sikeres | Sikertelen | Osszes | Statusz |
|------------|---------|------------|--------|---------|
${testSection}

**Osszesites:** ${testResults.summary}
`;

  const changedFilesSection = gitStatus.clean
    ? '> Nincs valtozas a munkakonyvtarban'
    : gitStatus.files.map((f) => `- \`${f.file}\` (${f.type})`).join('\n');

  const commitsSection = recentCommits.map((c) =>
    `- \`${c.hash}\` ${c.message} _(${c.author}, ${c.date})_`
  ).join('\n');

  const report = `# HR-ERP Backup Jelentes

**Datum:** ${dateHu()}
**Branch:** \`${branch}\`
**Mod:** ${DRY_RUN ? 'DRY-RUN (nincs valtozas)' : 'LIVE'}

---

## Allapot

| Metrika | Ertek |
|---------|-------|
| Git statusz | ${gitStatus.clean ? 'Tiszta' : gitStatus.summary} |
| Mai commitok | ${todayChanges.commits} |
| Mai modositott fajlok | ${todayChanges.files} |
| Mai hozzaadott sorok | +${todayChanges.insertions} |
| Mai torolt sorok | -${todayChanges.deletions} |
| Commit | ${commitDone ? 'Sikeres' : gitStatus.clean ? 'Nem szukseges' : 'Nem tortent'} |
| Push | ${pushDone ? 'Sikeres' : NO_PUSH ? 'Kihagyva' : 'Nem tortent'} |

---

## Teszt eredmenyek

${testTableHeader || '> Tesztek kihagyva'}

---

## Valtoztatasok a munkakonyvtarban

${changedFilesSection}

---

## Utolso 5 commit

${commitsSection || '> Nincs commit'}

---

## Konfiguracio

\`\`\`json
${JSON.stringify(config, null, 2)}
\`\`\`

---

_Generalva: ${new Date().toISOString()} | HR-ERP Backup System_
`;

  return report;
}

// ============================================
// GOOGLE DRIVE COPY
// ============================================

function copyToGoogleDrive(reportPath) {
  const drivePath = config.google_drive_path || process.env.GOOGLE_DRIVE_BACKUP_PATH;
  if (!drivePath) return;

  try {
    if (!fs.existsSync(drivePath)) {
      log(`Google Drive eleresi ut nem talalhato: ${drivePath}`);
      return;
    }

    const filename = path.basename(reportPath);
    const destPath = path.join(drivePath, filename);
    fs.copyFileSync(reportPath, destPath);
    log(`Google Drive masolat: ${destPath}`);
  } catch (error) {
    log(`Google Drive masolat hiba: ${error.message}`);
  }
}

// ============================================
// CLEANUP OLD BACKUPS
// ============================================

function cleanupOldBackups() {
  const maxBackups = config.max_backups || 30;

  try {
    if (!fs.existsSync(BACKUP_DIR)) return;

    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('backup-') && f.endsWith('.md'))
      .sort()
      .reverse();

    if (files.length <= maxBackups) return;

    const toDelete = files.slice(maxBackups);
    for (const file of toDelete) {
      fs.unlinkSync(path.join(BACKUP_DIR, file));
      log(`Regi backup torolve: ${file}`);
    }
  } catch (error) {
    log(`Cleanup hiba: ${error.message}`);
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  log('========================================');
  log(`HR-ERP Backup inditas - ${dateHu()}`);
  log(`Projekt: ${PROJECT_ROOT}`);
  if (DRY_RUN) log('MOD: DRY-RUN (nincs valtozas)');
  if (NO_PUSH) log('MOD: --no-push');
  if (NO_TEST) log('MOD: --no-test');
  log('----------------------------------------');

  // 1. Gather info
  log('Git statusz lekerdezese...');
  const gitStatus = getGitStatus();
  log(`  Statusz: ${gitStatus.summary}`);

  log('Mai valtoztatasok...');
  const todayChanges = getTodayChanges();
  log(`  ${todayChanges.commits} commit, ${todayChanges.files} fajl, +${todayChanges.insertions}/-${todayChanges.deletions}`);

  const recentCommits = getRecentCommits(5);
  log(`  Utolso commitok: ${recentCommits.length}`);

  // 2. Run tests
  log('Tesztek futtatasa...');
  const testResults = runTests();
  log(`  ${testResults.summary}`);

  // 3. Auto-commit if there are changes
  let commitDone = false;
  if (!gitStatus.clean && config.auto_commit) {
    const commitMsg = `backup: Auto backup ${timestamp()} [${gitStatus.summary}]`;
    log(`Commit: ${commitMsg}`);
    commitDone = gitCommit(commitMsg);
  } else if (gitStatus.clean) {
    log('Nincs commitolnivalo (tiszta munkakonytar)');
  }

  // 4. Push
  let pushDone = false;
  if (config.auto_push && (commitDone || !gitStatus.clean)) {
    pushDone = gitPush();
  }

  // 5. Generate report
  log('Jelentes generalasa...');
  const report = generateReport(gitStatus, todayChanges, recentCommits, testResults, commitDone, pushDone);

  // 6. Save report
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    log(`Backup konyvtar letrehozva: ${BACKUP_DIR}`);
  }

  const reportFilename = `backup-${timestamp()}.md`;
  const reportPath = path.join(BACKUP_DIR, reportFilename);

  if (!DRY_RUN) {
    fs.writeFileSync(reportPath, report, 'utf-8');
    log(`Jelentes mentve: ${reportPath}`);
  } else {
    log(`[DRY-RUN] Jelentes lenne: ${reportPath}`);
  }

  // 7. Google Drive copy
  if (!DRY_RUN) {
    copyToGoogleDrive(reportPath);
  }

  // 8. Cleanup old backups
  if (!DRY_RUN) {
    cleanupOldBackups();
  }

  // 9. Summary
  log('----------------------------------------');
  log('Backup osszesites:');
  log(`  Git: ${gitStatus.clean ? 'tiszta' : gitStatus.summary}`);
  log(`  Tesztek: ${testResults.summary}`);
  log(`  Commit: ${commitDone ? 'igen' : 'nem'}`);
  log(`  Push: ${pushDone ? 'igen' : NO_PUSH ? 'kihagyva' : 'nem'}`);
  log(`  Jelentes: ${reportFilename}`);
  log('========================================');

  // Return results for programmatic use
  return {
    gitStatus,
    todayChanges,
    testResults,
    commitDone,
    pushDone,
    reportPath: DRY_RUN ? null : reportPath,
  };
}

main().catch((err) => {
  console.error('[backup] HIBA:', err);
  process.exit(1);
});
