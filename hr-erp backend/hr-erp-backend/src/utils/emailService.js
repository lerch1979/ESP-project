const nodemailer = require('nodemailer');
const { logger } = require('./logger');

// Build transporter from SMTP_* env vars (Gmail compatible)
// Falls back to legacy EMAIL_* vars for backwards compatibility
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT) || 587,
  secure: (process.env.SMTP_SECURE === 'true') || (parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT) === 465),
  auth: {
    user: process.env.SMTP_USER || process.env.EMAIL_USER,
    pass: process.env.SMTP_PASS || process.env.EMAIL_PASSWORD,
  },
});

const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || process.env.EMAIL_USER;

/**
 * Replace {{key}} placeholders with variable values
 */
function interpolateTemplate(text, variables) {
  if (!text) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined && variables[key] !== null ? variables[key] : match;
  });
}

/**
 * Send a single email
 */
async function sendEmail({ to, subject, html, attachments }) {
  try {
    const info = await transporter.sendMail({
      from: emailFrom,
      to,
      subject,
      html,
      attachments,
    });
    logger.info('Email elküldve', { to, subject, messageId: info.messageId });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error('Email küldési hiba:', { to, subject, error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Verify SMTP connection is working
 */
async function verifyConnection() {
  try {
    await transporter.verify();
    return { success: true, message: 'SMTP kapcsolat sikeres' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Send bulk emails with per-recipient variable interpolation
 * @param {Array} recipients - [{email, name, ...vars}]
 * @param {string} subject - Subject template
 * @param {string} htmlTemplate - HTML body template
 * @param {Function} getVarsForRecipient - (recipient) => {key: value} for interpolation
 * @returns {{ sent: number, failed: number, errors: Array }}
 */
async function sendBulkEmails(recipients, subject, htmlTemplate, getVarsForRecipient) {
  const results = { sent: 0, failed: 0, errors: [] };

  for (const recipient of recipients) {
    const vars = getVarsForRecipient ? getVarsForRecipient(recipient) : recipient;
    const personalSubject = interpolateTemplate(subject, vars);
    const personalHtml = interpolateTemplate(htmlTemplate, vars);

    const result = await sendEmail({
      to: recipient.email,
      subject: personalSubject,
      html: personalHtml,
    });

    if (result.success) {
      results.sent++;
    } else {
      results.failed++;
      results.errors.push({ email: recipient.email, error: result.error });
    }

    // 100ms delay between sends to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return results;
}

module.exports = {
  sendEmail,
  sendBulkEmails,
  interpolateTemplate,
  verifyConnection,
};
