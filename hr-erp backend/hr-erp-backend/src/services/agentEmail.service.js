const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

function getRecipients() {
  return process.env.AGENT_EMAIL_TO || process.env.SMTP_USER;
}

// ============================================
// HTML TEMPLATES
// ============================================

function baseTemplate(title, content) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f1f5f9; }
    .container { max-width: 640px; margin: 0 auto; padding: 24px; }
    .card { background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 2px solid #e2e8f0; }
    .header h1 { margin: 0 0 4px; font-size: 22px; color: #1e293b; }
    .header .subtitle { color: #64748b; font-size: 13px; }
    .section { margin-bottom: 24px; }
    .section h2 { font-size: 16px; color: #334155; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; }
    .priority-high { color: #dc2626; font-weight: 600; }
    .priority-medium { color: #f59e0b; font-weight: 600; }
    .priority-low { color: #10b981; font-weight: 600; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge-red { background: #fef2f2; color: #dc2626; }
    .badge-yellow { background: #fffbeb; color: #d97706; }
    .badge-green { background: #f0fdf4; color: #16a34a; }
    .badge-blue { background: #eff6ff; color: #2563eb; }
    .badge-gray { background: #f8fafc; color: #64748b; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 12px; color: #64748b; text-transform: uppercase; padding: 8px 12px; border-bottom: 2px solid #e2e8f0; }
    td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #334155; }
    tr:hover td { background: #f8fafc; }
    .metric { text-align: center; padding: 16px; }
    .metric .value { font-size: 28px; font-weight: 700; color: #1e293b; }
    .metric .label { font-size: 12px; color: #64748b; margin-top: 4px; }
    .metrics-row { display: flex; gap: 16px; margin-bottom: 24px; }
    .metric-card { flex: 1; background: #f8fafc; border-radius: 8px; padding: 16px; text-align: center; }
    .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #94a3b8; }
    .alert-box { padding: 16px; border-radius: 8px; margin-bottom: 16px; }
    .alert-error { background: #fef2f2; border-left: 4px solid #dc2626; }
    .alert-warning { background: #fffbeb; border-left: 4px solid #f59e0b; }
    .alert-info { background: #eff6ff; border-left: 4px solid #2563eb; }
    .alert-success { background: #f0fdf4; border-left: 4px solid #16a34a; }
    .commit-list { list-style: none; padding: 0; margin: 0; }
    .commit-list li { padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    .commit-hash { font-family: monospace; color: #6366f1; font-size: 12px; }
    .commit-author { color: #64748b; font-size: 12px; }
    pre { background: #1e293b; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <h1>${title}</h1>
        <div class="subtitle">HR-ERP Rendszer | ${new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</div>
      </div>
      ${content}
    </div>
    <div class="footer">
      HR-ERP Agent System | Automatikusan generalt jelentes
    </div>
  </div>
</body>
</html>`;
}

function priorityBadge(priority) {
  if (priority === 'high' || priority === 'critical') return '<span class="badge badge-red">MAGAS</span>';
  if (priority === 'medium') return '<span class="badge badge-yellow">KOZEPES</span>';
  return '<span class="badge badge-green">ALACSONY</span>';
}

function statusBadge(status) {
  const map = {
    open: '<span class="badge badge-blue">Nyitott</span>',
    in_progress: '<span class="badge badge-yellow">Folyamatban</span>',
    done: '<span class="badge badge-green">Kesz</span>',
    closed: '<span class="badge badge-gray">Lezart</span>',
    blocked: '<span class="badge badge-red">Blokkolt</span>',
  };
  return map[status] || `<span class="badge badge-gray">${status}</span>`;
}

// ============================================
// SEND FUNCTIONS
// ============================================

/**
 * Send daily priorities email (CEO Agent)
 * @param {Object} priorities - { summary, items[], metrics, recommendations[] }
 */
async function sendDailyPriorities(priorities) {
  if (!process.env.SMTP_USER) {
    logger.warn('SMTP not configured, skipping CEO agent email');
    return { skipped: true };
  }

  const itemRows = (priorities.items || []).map((item) => `
    <tr>
      <td>${priorityBadge(item.priority)}</td>
      <td><strong>${item.title}</strong>${item.description ? `<br><span style="color:#64748b;font-size:12px">${item.description}</span>` : ''}</td>
      <td>${item.assignee || '-'}</td>
      <td>${item.due_date || '-'}</td>
      <td>${statusBadge(item.status || 'open')}</td>
    </tr>
  `).join('');

  const metricsHtml = priorities.metrics ? `
    <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">
      ${Object.entries(priorities.metrics).map(([key, val]) => `
        <div class="metric-card">
          <div class="value">${val}</div>
          <div class="label">${key}</div>
        </div>
      `).join('')}
    </div>
  ` : '';

  const recommendationsHtml = (priorities.recommendations || []).length > 0 ? `
    <div class="section">
      <h2>Javaslatok</h2>
      <ul style="padding-left:20px;color:#334155;">
        ${priorities.recommendations.map((r) => `<li style="margin-bottom:8px;">${r}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  const content = `
    ${priorities.summary ? `<div class="alert-box alert-info"><strong>Osszefoglalo:</strong> ${priorities.summary}</div>` : ''}
    ${metricsHtml}
    <div class="section">
      <h2>Napi prioritasok</h2>
      ${itemRows ? `
        <table>
          <thead><tr><th>Prioritas</th><th>Feladat</th><th>Felelos</th><th>Hatarido</th><th>Statusz</th></tr></thead>
          <tbody>${itemRows}</tbody>
        </table>
      ` : '<p style="color:#64748b;">Nincs kiemelendo feladat.</p>'}
    </div>
    ${recommendationsHtml}
  `;

  return _sendAgentEmail(
    'CEO Agent - Napi prioritasok',
    baseTemplate('CEO Agent - Napi prioritasok', content)
  );
}

/**
 * Send daily standup report
 * @param {Object} report - { commits[], issues[], summary, stats }
 */
async function sendDailyStandup(report) {
  if (!process.env.SMTP_USER) {
    logger.warn('SMTP not configured, skipping standup email');
    return { skipped: true };
  }

  const commitsHtml = (report.commits || []).length > 0 ? `
    <div class="section">
      <h2>Commitok (utolso 24 ora)</h2>
      <ul class="commit-list">
        ${report.commits.map((c) => `
          <li>
            <span class="commit-hash">${c.hash ? c.hash.substring(0, 7) : ''}</span>
            ${c.message}
            <span class="commit-author">- ${c.author || ''} (${c.date || ''})</span>
          </li>
        `).join('')}
      </ul>
    </div>
  ` : '<div class="section"><h2>Commitok</h2><p style="color:#64748b;">Nem volt commit az elmult 24 oraban.</p></div>';

  const issuesHtml = (report.issues || []).length > 0 ? `
    <div class="section">
      <h2>Nyitott issue-k</h2>
      <table>
        <thead><tr><th>#</th><th>Cim</th><th>Cimkek</th><th>Letrehozva</th></tr></thead>
        <tbody>
          ${report.issues.map((issue) => `
            <tr>
              <td>#${issue.number}</td>
              <td>${issue.title}</td>
              <td>${(issue.labels || []).map((l) => `<span class="badge badge-blue">${typeof l === 'string' ? l : l.name}</span>`).join(' ')}</td>
              <td>${issue.created_at ? new Date(issue.created_at).toLocaleDateString('hu-HU') : '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  const statsHtml = report.stats ? `
    <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">
      <div class="metric-card"><div class="value">${report.stats.total_commits || 0}</div><div class="label">Commitok</div></div>
      <div class="metric-card"><div class="value">${report.stats.files_changed || 0}</div><div class="label">Modositott fajlok</div></div>
      <div class="metric-card"><div class="value">${report.stats.insertions || 0}</div><div class="label">Hozzaadott sorok</div></div>
      <div class="metric-card"><div class="value">${report.stats.deletions || 0}</div><div class="label">Torolt sorok</div></div>
      <div class="metric-card"><div class="value">${report.stats.open_issues || 0}</div><div class="label">Nyitott issue-k</div></div>
    </div>
  ` : '';

  const content = `
    ${report.summary ? `<div class="alert-box alert-info"><strong>Osszefoglalo:</strong> ${report.summary}</div>` : ''}
    ${statsHtml}
    ${commitsHtml}
    ${issuesHtml}
  `;

  return _sendAgentEmail(
    'Daily Standup - Napi jelentes',
    baseTemplate('Daily Standup Report', content)
  );
}

/**
 * Send alert email (QA/system alerts)
 * @param {string} type - 'error' | 'warning' | 'info' | 'success'
 * @param {Object} alert - { title, message, details?, testResults?, failedTests[] }
 */
async function sendAlert(type, alert) {
  if (!process.env.SMTP_USER) {
    logger.warn('SMTP not configured, skipping alert email');
    return { skipped: true };
  }

  const alertClass = {
    error: 'alert-error',
    warning: 'alert-warning',
    info: 'alert-info',
    success: 'alert-success',
  }[type] || 'alert-info';

  const emoji = { error: 'HIBA', warning: 'FIGYELEM', info: 'INFO', success: 'SIKERES' }[type] || 'INFO';

  const failedTestsHtml = (alert.failedTests || []).length > 0 ? `
    <div class="section">
      <h2>Sikertelen tesztek</h2>
      <table>
        <thead><tr><th>Teszt</th><th>Hiba</th></tr></thead>
        <tbody>
          ${alert.failedTests.map((t) => `
            <tr>
              <td><strong>${t.name}</strong></td>
              <td style="color:#dc2626;font-size:13px;">${t.error || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  const testResultsHtml = alert.testResults ? `
    <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">
      <div class="metric-card"><div class="value" style="color:#16a34a">${alert.testResults.passed || 0}</div><div class="label">Sikeres</div></div>
      <div class="metric-card"><div class="value" style="color:#dc2626">${alert.testResults.failed || 0}</div><div class="label">Sikertelen</div></div>
      <div class="metric-card"><div class="value">${alert.testResults.total || 0}</div><div class="label">Osszes</div></div>
      ${alert.testResults.duration ? `<div class="metric-card"><div class="value">${alert.testResults.duration}</div><div class="label">Futasi ido</div></div>` : ''}
    </div>
  ` : '';

  const detailsHtml = alert.details ? `
    <div class="section">
      <h2>Reszletek</h2>
      <pre>${typeof alert.details === 'string' ? alert.details : JSON.stringify(alert.details, null, 2)}</pre>
    </div>
  ` : '';

  const content = `
    <div class="alert-box ${alertClass}">
      <strong>[${emoji}] ${alert.title || type.toUpperCase()}</strong>
      <p style="margin:8px 0 0;color:#334155;">${alert.message}</p>
    </div>
    ${testResultsHtml}
    ${failedTestsHtml}
    ${detailsHtml}
  `;

  const subjectPrefix = { error: 'HIBA', warning: 'FIGYELEM', info: 'INFO', success: 'OK' }[type] || '';

  return _sendAgentEmail(
    `[${subjectPrefix}] ${alert.title || 'Agent Alert'}`,
    baseTemplate(`QA Alert - ${alert.title || type}`, content)
  );
}

// ============================================
// INTERNAL
// ============================================

async function _sendAgentEmail(subject, html) {
  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: getRecipients(),
    subject: `[HR-ERP] ${subject}`,
    html,
  };

  try {
    const info = await getTransporter().sendMail(mailOptions);
    logger.info(`Agent email sent: "${subject}" to ${mailOptions.to}`, { messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Agent email failed: "${subject}"`, error);
    return { success: false, error: error.message };
  }
}

module.exports = { sendDailyPriorities, sendDailyStandup, sendAlert };
