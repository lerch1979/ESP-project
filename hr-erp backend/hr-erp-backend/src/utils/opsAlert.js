/**
 * Ops alerting for backend jobs (cron/scheduled). Posts to a Slack-compatible
 * incoming webhook in OPS_ALERT_WEBHOOK — the same env used by the shell
 * disk-alert. Always logs (so failures are visible even without a webhook) and
 * NEVER throws (an alert must not break the job that's reporting a problem).
 */
const https = require('https');
const { logger } = require('./logger');

function alertOps(text) {
  logger.error(`[ops-alert] ${text}`);
  const url = process.env.OPS_ALERT_WEBHOOK;
  if (!url) return Promise.resolve(); // no webhook configured — logged only
  return new Promise((resolve) => {
    try {
      const body = JSON.stringify({ text: `⚠️ hr-erp-prod: ${text}` });
      const u = new URL(url);
      const req = https.request(
        { hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 8000 },
        (res) => { res.resume(); res.on('end', resolve); }
      );
      req.on('error', () => resolve());
      req.on('timeout', () => { req.destroy(); resolve(); });
      req.write(body);
      req.end();
    } catch { resolve(); }
  });
}

module.exports = { alertOps };
