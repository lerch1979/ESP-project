#!/usr/bin/env node

/**
 * CEO Agent - Napi prioritas-elemzo
 *
 * Lekeerdezi a GitHub issue-kat, Anthropic API-val elemzi,
 * es prioritas-sorrendben email-t kuld.
 *
 * Futtatas: node scripts/ceo_agent.js
 * Cron: 0 8 * * 1-5 (hetfotol pentekig 08:00)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const Anthropic = require('@anthropic-ai/sdk');
const https = require('https');
const { sendDailyPriorities } = require('../src/services/agentEmail.service');

// ============================================
// CONFIG
// ============================================

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'lerch1979/ESP-project';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

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
        'User-Agent': 'HR-ERP-CEO-Agent',
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

async function fetchGitHubIssues() {
  try {
    const issues = await githubRequest(`/repos/${GITHUB_REPO}/issues?state=open&per_page=50&sort=updated`);
    return issues.filter((i) => !i.pull_request); // Exclude PRs
  } catch (error) {
    console.error('GitHub API hiba:', error.message);
    return [];
  }
}

async function fetchRecentActivity() {
  try {
    const events = await githubRequest(`/repos/${GITHUB_REPO}/events?per_page=30`);
    return events;
  } catch (error) {
    console.error('GitHub Events API hiba:', error.message);
    return [];
  }
}

// ============================================
// ANTHROPIC ANALYSIS
// ============================================

async function analyzeWithClaude(issues, events) {
  if (!ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY nincs beallitva, AI elemzes kihagyva');
    return buildFallbackPriorities(issues);
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const issuesSummary = issues.map((i) => ({
    number: i.number,
    title: i.title,
    labels: (i.labels || []).map((l) => l.name),
    assignee: i.assignee?.login || null,
    created_at: i.created_at,
    updated_at: i.updated_at,
    body: (i.body || '').substring(0, 300),
  }));

  const recentEvents = (events || []).slice(0, 10).map((e) => ({
    type: e.type,
    actor: e.actor?.login,
    created_at: e.created_at,
  }));

  const prompt = `Te egy CEO asszisztens AI vagy egy HR-ERP rendszerben. Elemezd az alabbi GitHub issue-kat es az utolso aktivitasokat, majd adj prioritas-sorrendet.

GitHub Issues (nyitott):
${JSON.stringify(issuesSummary, null, 2)}

Utolso aktivitasok:
${JSON.stringify(recentEvents, null, 2)}

Kerlek valaszolj KIZAROLAG az alabbi JSON formatumban, semmi mas szoveget ne irj:
{
  "summary": "1-2 mondatos osszefoglalo a projekt allapotarol",
  "items": [
    {
      "title": "Issue cime",
      "description": "Rovid leiras miert fontos",
      "priority": "high|medium|low",
      "assignee": "felhasznalonev vagy null",
      "due_date": "becsult hatarido vagy null",
      "status": "open|in_progress|blocked",
      "issue_number": 123
    }
  ],
  "metrics": {
    "Nyitott issue-k": 5,
    "Magas prioritas": 2,
    "Blokkolt": 0,
    "Heti aktivitas": 15
  },
  "recommendations": [
    "1-3 rovid javaslat a csapat szamara"
  ]
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text.trim();

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    console.error('Claude valasz nem JSON formatumu');
    return buildFallbackPriorities(issues);
  } catch (error) {
    console.error('Anthropic API hiba:', error.message);
    return buildFallbackPriorities(issues);
  }
}

function buildFallbackPriorities(issues) {
  const priorityMap = { bug: 'high', critical: 'high', enhancement: 'medium', feature: 'medium' };

  return {
    summary: `${issues.length} nyitott issue talalhato. AI elemzes nem elerheto.`,
    items: issues.slice(0, 10).map((i) => {
      const labels = (i.labels || []).map((l) => l.name);
      let priority = 'low';
      for (const label of labels) {
        if (priorityMap[label.toLowerCase()]) {
          priority = priorityMap[label.toLowerCase()];
          break;
        }
      }
      return {
        title: i.title,
        description: (i.body || '').substring(0, 100),
        priority,
        assignee: i.assignee?.login || null,
        due_date: null,
        status: 'open',
        issue_number: i.number,
      };
    }),
    metrics: {
      'Nyitott issue-k': issues.length,
      'Magas prioritas': issues.filter((i) => (i.labels || []).some((l) => ['bug', 'critical'].includes(l.name?.toLowerCase()))).length,
    },
    recommendations: ['AI elemzes nem elerheto - ellenorizd az ANTHROPIC_API_KEY beallitast.'],
  };
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('CEO Agent inditas...');
  console.log(`Repo: ${GITHUB_REPO}`);
  console.log(`Datum: ${new Date().toLocaleString('hu-HU')}`);
  console.log('---');

  // Fetch data
  const [issues, events] = await Promise.all([
    fetchGitHubIssues(),
    fetchRecentActivity(),
  ]);

  console.log(`${issues.length} nyitott issue talalva`);
  console.log(`${events.length} utolso esemeny`);

  // Analyze
  const priorities = await analyzeWithClaude(issues, events);

  console.log('Elemzes kesz:');
  console.log(`  Osszefoglalo: ${priorities.summary}`);
  console.log(`  Prioritasos elemek: ${(priorities.items || []).length}`);
  console.log(`  Javaslatok: ${(priorities.recommendations || []).length}`);

  // Send email
  const result = await sendDailyPriorities(priorities);

  if (result.skipped) {
    console.log('Email kihagyva (SMTP nincs konfigralva)');
    console.log('\nEredmeny (JSON):');
    console.log(JSON.stringify(priorities, null, 2));
  } else if (result.success) {
    console.log(`Email elkuldve: ${result.messageId}`);
  } else {
    console.error(`Email hiba: ${result.error}`);
    process.exit(1);
  }

  console.log('\nCEO Agent befejezve.');
}

main().catch((err) => {
  console.error('CEO Agent hiba:', err);
  process.exit(1);
});
