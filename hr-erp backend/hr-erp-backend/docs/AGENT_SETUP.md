# Agent Email Service - Setup Guide

## Environment Variables

Add these to your `.env` file:

```env
# Required - SMTP (already configured if email works)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=HR-ERP System <your-email@gmail.com>

# Agent-specific
AGENT_EMAIL_TO=ceo@company.com           # Who receives agent emails (default: SMTP_USER)
ANTHROPIC_API_KEY=sk-ant-...              # For AI analysis (CEO agent, standup)
GITHUB_TOKEN=ghp_...                      # GitHub Personal Access Token (optional, increases rate limit)
GITHUB_REPO=lerch1979/ESP-project         # GitHub repo (owner/name)
PROJECT_ROOT=/path/to/HR-ERP-PROJECT      # Git repo root (for standup git log)
```

## Agents

### 1. CEO Agent (`scripts/ceo_agent.js`)

Analyzes GitHub issues with Anthropic AI, prioritizes tasks, sends daily summary email.

```bash
# Manual run
node scripts/ceo_agent.js
npm run agent:ceo

# Cron: weekdays 08:00
0 8 * * 1-5 cd /path/to/hr-erp-backend && node scripts/ceo_agent.js >> logs/ceo_agent.log 2>&1
```

**What it does:**
- Fetches open GitHub issues via GitHub API
- Fetches recent repo activity/events
- Sends to Claude for priority analysis
- Generates HTML email with priority table, metrics, recommendations
- Falls back to label-based prioritization if API key missing

### 2. Daily Standup (`scripts/daily_standup.js`)

Parses git log (last 24h), fetches issues, generates AI standup report.

```bash
# Manual run
node scripts/daily_standup.js
npm run agent:standup

# Cron: weekdays 14:00
0 14 * * 1-5 cd /path/to/hr-erp-backend && node scripts/daily_standup.js >> logs/standup.log 2>&1
```

**What it does:**
- Runs `git log --since=24h` with `--stat` to get commits and file changes
- Fetches open GitHub issues
- Generates AI summary of daily progress
- Sends HTML email with commit list, stats, issue table

### 3. QA Agent (`scripts/qa_agent.js`)

Runs test suites, analyzes results, sends alert on failures.

```bash
# Run all tests and alert on failure
node scripts/qa_agent.js
npm run agent:qa

# Also send email on success
node scripts/qa_agent.js --notify-success

# Use CI pipeline result instead of running tests
node scripts/qa_agent.js --ci-result '{"passed":30,"failed":2,"failedTests":[{"name":"test1","error":"assertion failed"}]}'

# Cron: every 6 hours
0 */6 * * * cd /path/to/hr-erp-backend && node scripts/qa_agent.js >> logs/qa_agent.log 2>&1
```

**What it does:**
- Runs all test files in `tests/` directory
- Parses pass/fail results from output
- Sends alert email only on failure (unless `--notify-success`)
- Exits with code 1 on failure (useful for CI)

## GitHub Actions Integration

### QA Agent in CI

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install
      - run: node scripts/qa_agent.js --notify-success
        env:
          SMTP_USER: ${{ secrets.SMTP_USER }}
          SMTP_PASS: ${{ secrets.SMTP_PASS }}
          AGENT_EMAIL_TO: ${{ secrets.AGENT_EMAIL_TO }}
```

## Email Templates

All emails use responsive HTML templates with:
- Priority badges (high/medium/low)
- Status badges (open/in_progress/done/blocked)
- Metric cards (commit count, files changed, etc.)
- Tables for issues, commits, test results
- Alert boxes (error/warning/info/success)
- Code blocks for error details

## Architecture

```
src/services/agentEmail.service.js    # Email templates & send functions
scripts/ceo_agent.js                  # CEO priority analysis
scripts/daily_standup.js              # Daily standup report
scripts/qa_agent.js                   # Test monitor & alerts
```

All scripts:
- Load `.env` via dotenv
- Can run standalone (`node scripts/xxx.js`)
- Output to console when SMTP not configured
- Exit with code 1 on failure
- Use the shared `agentEmail.service.js` for sending
