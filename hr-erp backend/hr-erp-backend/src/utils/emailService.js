const nodemailer = require('nodemailer');

const isDev = process.env.NODE_ENV === 'development';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: parseInt(process.env.EMAIL_PORT) === 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

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
async function sendEmail({ to, subject, html }) {
  if (isDev) {
    console.log('[DEV EMAIL]', { to, subject, html: html.substring(0, 200) + '...' });
    return { success: true };
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
    });
    return { success: true };
  } catch (error) {
    console.error('Email send error:', error.message);
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
};
