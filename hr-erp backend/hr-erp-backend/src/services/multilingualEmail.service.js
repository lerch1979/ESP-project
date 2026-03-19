/**
 * Multilingual Email Service
 * Sends emails in user's preferred language using Handlebars templates.
 */
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');
const { query } = require('../database/connection');
const { logger } = require('../utils/logger');

const SUPPORTED_LANGS = ['hu', 'en', 'tl', 'uk', 'de'];
const TEMPLATE_DIR = path.join(__dirname, '..', 'templates', 'emails');

// Load email translations
function loadEmailStrings(lang) {
  const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : 'hu';
  const filePath = path.join(__dirname, '..', 'locales', safeLang, 'emails.json');
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', 'hu', 'emails.json'), 'utf8'));
  }
}

// Create transporter
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Get user's language
async function getUserLanguage(userId) {
  try {
    const result = await query('SELECT preferred_language FROM users WHERE id = $1', [userId]);
    return result.rows[0]?.preferred_language || 'hu';
  } catch { return 'hu'; }
}

// Get user's email + name + language
async function getUserInfo(userId) {
  try {
    const result = await query(
      'SELECT id, email, first_name, last_name, preferred_language FROM users WHERE id = $1', [userId]
    );
    const u = result.rows[0];
    if (!u) return null;
    return { ...u, full_name: `${u.first_name} ${u.last_name}`.trim() };
  } catch { return null; }
}

/**
 * Send email using Handlebars template in user's language
 */
async function sendTemplateEmail(to, templateName, lang, data = {}) {
  const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : 'hu';
  const strings = loadEmailStrings(safeLang);

  // Try language-specific template, fallback to hu
  let templatePath = path.join(TEMPLATE_DIR, safeLang, `${templateName}.hbs`);
  if (!fs.existsSync(templatePath)) {
    templatePath = path.join(TEMPLATE_DIR, 'hu', `${templateName}.hbs`);
  }
  if (!fs.existsSync(templatePath)) {
    // Use inline fallback
    logger.warn(`Email template not found: ${templateName} (${safeLang})`);
    return sendPlainEmail(to, data.subject || templateName, JSON.stringify(data));
  }

  const source = fs.readFileSync(templatePath, 'utf8');
  const template = handlebars.compile(source);

  // Merge strings into data
  const html = template({ ...data, s: strings, lang: safeLang });

  const subject = strings[templateName]?.subject
    ? handlebars.compile(strings[templateName].subject)(data)
    : templateName;

  return sendPlainEmail(to, subject, html);
}

/**
 * Send raw email
 */
async function sendPlainEmail(to, subject, html) {
  try {
    if (!process.env.EMAIL_USER) {
      logger.info(`[Email] Would send to ${to}: ${subject} (SMTP not configured)`);
      return { messageId: 'mock', to, subject };
    }
    const info = await transporter.sendMail({
      from: `"HR-ERP" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    logger.info(`[Email] Sent to ${to}: ${subject} (${info.messageId})`);
    return info;
  } catch (err) {
    logger.error(`[Email] Failed to send to ${to}:`, err.message);
    throw err;
  }
}

/**
 * Send email to user in their preferred language
 */
async function sendToUser(userId, templateName, data = {}) {
  const user = await getUserInfo(userId);
  if (!user?.email) { logger.warn(`[Email] No email for user ${userId}`); return; }

  return sendTemplateEmail(user.email, templateName, user.preferred_language, {
    ...data,
    userName: user.full_name,
    userEmail: user.email,
  });
}

/**
 * Send bulk to multiple users (each in their own language)
 */
async function sendBulk(userIds, templateName, data = {}) {
  const results = await Promise.allSettled(
    userIds.map(id => sendToUser(id, templateName, data))
  );
  const ok = results.filter(r => r.status === 'fulfilled').length;
  const fail = results.filter(r => r.status === 'rejected').length;
  logger.info(`[Email] Bulk: ${ok} sent, ${fail} failed (${templateName})`);
  return { sent: ok, failed: fail };
}

module.exports = { sendTemplateEmail, sendPlainEmail, sendToUser, sendBulk, getUserLanguage };
