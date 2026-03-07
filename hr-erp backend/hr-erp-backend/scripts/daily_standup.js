#!/usr/bin/env node

/**
 * Daily Standup Agent - Napi jelentes generalo
 *
 * Git log (utolso 24 ora), GitHub issues, AI osszefoglalo.
 *
 * Futtatas: node scripts/daily_standup.js
 * Cron: 0 14 * * 1-5 (hetfotol pentekig 14:00)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { execSync } = require('child_process');
const https = require('https');
const Anthropic = require('@anthropic-ai/sdk');
const { sendDailyStandup } = require('../src/services/agentEmail.service');

// ============================================
// CONFIG
// ============================================

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'lerch1979/ESP-project';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(__dirname, '..', '..', '..');

// ============================================
// GIT LOG PARSING
// ============================================

function getGitLog() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const log = execSync(
      `git log --since="${since}" --pretty=format:"%H|||%h|||%s|||%an|||%ai" --stat`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 10000 }
    );

    if (!log.trim()) return { commits: [], stats: { total_commits: 0, files_changed: 0, insertions: 0, deletions: 0 } };

    const lines = log.split('\n');
    const commits = [];
    let totalFiles = 0;
    let totalInsertions = 0;
    let totalDeletions = 0;

    for (const line of lines) {
      if (line.includes('|||')) {
        const [hash, shortHash, message, author, date] = line.split('|||');
        commits.push({ hash: shortHash, full_hash: hash, message, author, date: date.substring(0, 16) });
      }

      // Parse stat lines like " 5 files changed, 120 insertions(+), 30 deletions(-)"
      const statMatch = line.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
      if (statMatch) {
        totalFiles += parseInt(statMatch[1]) || 0;
        totalInsertions += parseInt(statMatch[2]) || 0;
        totalDeletions += parseInt(statMatch[3]) || 0;
      }
    }

    return {
      commits,
      stats: {
        total_commits: commits.length,
        files_changed: totalFiles,
        insertions: totalInsertions,
        deletions: totalDeletions,
      },
    };
  } catch (error) {
    console.error('Git log hiba:', error.message);
    return { commits: [], stats: { total_commits: 0, files_changed: 0, insertions: 0, deletions: 0 } };
  }
}

// ============================================
// GITHUB API
// ============================================

function githubRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: endpoint,
      method: 'GET',
      headers: {
        'User-Agent': 'HR-ERP-Standup-Agent',
        'Accept': 'application/vnd.github.v3+json',
      },
    };

    if (GITHUB_TOKEN) {
      options.headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`GitHub API ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function fetchOpenIssues() {
  try {
    const issues = await githubRequest(`/repos/${GITHUB_REPO}/issues?state=open&per_page=20&sort=updated`);
    return issues.filter((i) => !i.pull_request);
  } catch (error) {
    console.error('GitHub issues lekeres hiba:', error.message);
    return [];
  }
}

// ============================================
// AI SUMMARY
// ============================================

async function generateSummary(gitData, issues) {
  if (!ANTHROPIC_API_KEY) {
    return buildFallbackSummary(gitData, issues);
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const prompt = `Te egy fejlesztoi csapat standup report generatora vagy. Keszits tomor magyar nyelvu osszefoglalot az alabbi adatokbol.

Git commitok (utolso 24 ora):
${gitData.commits.map((c) => `- ${c.hash} ${c.message} (${c.author})`).join('\n') || 'Nincs commit'}

Statisztika: ${gitData.stats.total_commits} commit, ${gitData.stats.files_changed} fajl, +${gitData.stats.insertions}/-${gitData.stats.deletions} sor

Nyitott GitHub issue-k (${issues.length} db):
${issues.slice(0, 10).map((i) => `- #${i.number}: ${i.title} [${(i.labels || []).map((l) => l.name).join(', ')}]`).join('\n') || 'Nincs nyitott issue'}

Valaszolj KIZAROLAG az alabbi JSON formatumban:
{
  "summary": "2-3 mondatos osszefoglalo magyarul a mai naprol"
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.summary;
    }
  } catch (error) {
    console.error('Anthropic API hiba:', error.message);
  }

  return buildFallbackSummary(gitData, issues);
}

function buildFallbackSummary(gitData, issues) {
  const parts = [];
  if (gitData.stats.total_commits > 0) {
    parts.push(`${gitData.stats.total_commits} commit tortent az elmult 24 oraban (+${gitData.stats.insertions}/-${gitData.stats.deletions} sor).`);
  } else {
    parts.push('Nem volt commit az elmult 24 oraban.');
  }
  if (issues.length > 0) {
    parts.push(`${issues.length} nyitott issue van a repoban.`);
  }
  return parts.join(' ');
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('Daily Standup Agent inditas...');
  console.log(`Datum: ${new Date().toLocaleString('hu-HU')}`);
  console.log(`Projekt: ${PROJECT_ROOT}`);
  console.log('---');

  // Gather data
  const gitData = getGitLog();
  console.log(`Git: ${gitData.stats.total_commits} commit, ${gitData.stats.files_changed} fajl`);

  const issues = await fetchOpenIssues();
  console.log(`GitHub: ${issues.length} nyitott issue`);

  // Generate summary
  const summary = await generateSummary(gitData, issues);
  console.log(`Osszefoglalo: ${summary}`);

  // Build report
  const report = {
    commits: gitData.commits,
    issues: issues.slice(0, 15).map((i) => ({
      number: i.number,
      title: i.title,
      labels: (i.labels || []).map((l) => l.name),
      created_at: i.created_at,
      assignee: i.assignee?.login || null,
    })),
    summary,
    stats: {
      ...gitData.stats,
      open_issues: issues.length,
    },
  };

  // Send email
  const result = await sendDailyStandup(report);

  if (result.skipped) {
    console.log('Email kihagyva (SMTP nincs konfigralva)');
    console.log('\nJelentes (JSON):');
    console.log(JSON.stringify(report, null, 2));
  } else if (result.success) {
    console.log(`Email elkuldve: ${result.messageId}`);
  } else {
    console.error(`Email hiba: ${result.error}`);
    process.exit(1);
  }

  console.log('\nDaily Standup Agent befejezve.');
}

main().catch((err) => {
  console.error('Standup Agent hiba:', err);
  process.exit(1);
});
