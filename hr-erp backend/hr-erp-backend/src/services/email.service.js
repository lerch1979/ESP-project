const nodemailer = require('nodemailer');
const { logger } = require('../utils/logger');
const { generateInvoicePDF } = require('./pdfGenerator.service');

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

/**
 * Send invoice via email with PDF attachment
 */
async function sendInvoiceEmail(invoiceId, { to, cc, subject, body }) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return { error: 'Email konfiguracio nincs beallitva (SMTP_USER/SMTP_PASS)', status: 503 };
  }

  if (!to) {
    return { error: 'Cimzett megadasa kotelezo', status: 400 };
  }

  const result = await generateInvoicePDF(invoiceId);
  if (!result) {
    return { error: 'Szamla nem talalhato', status: 404 };
  }

  const { doc, invoice } = result;

  // Collect PDF into buffer
  const chunks = [];
  await new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', resolve);
    doc.on('error', reject);
  });
  const pdfBuffer = Buffer.concat(chunks);

  const defaultSubject = `Szamla: ${invoice.invoice_number || 'N/A'} - ${invoice.vendor_name || ''}`;
  const defaultBody = [
    'Tisztelt Partnerem!',
    '',
    `Mellekletben kuldjem a(z) ${invoice.invoice_number || ''} szamu szamlat.`,
    '',
    `Szamla datuma: ${invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString('hu-HU') : '-'}`,
    `Fizetesi hatarido: ${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('hu-HU') : '-'}`,
    `Osszeg: ${new Intl.NumberFormat('hu-HU', { style: 'currency', currency: invoice.currency || 'HUF', maximumFractionDigits: 0 }).format(invoice.total_amount || invoice.amount || 0)}`,
    '',
    'Udv,',
    'HR-ERP Rendszer',
  ].join('\n');

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    cc: cc || undefined,
    subject: subject || defaultSubject,
    text: body || defaultBody,
    attachments: [
      {
        filename: `${invoice.invoice_number || 'szamla'}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  };

  try {
    const info = await getTransporter().sendMail(mailOptions);
    logger.info(`Invoice email sent: ${invoice.invoice_number} to ${to}`, { messageId: info.messageId });
    return { data: { messageId: info.messageId, to, invoice_number: invoice.invoice_number } };
  } catch (error) {
    logger.error('Email sending failed:', error);
    return { error: `Email kuldesi hiba: ${error.message}`, status: 500 };
  }
}

module.exports = { sendInvoiceEmail };
