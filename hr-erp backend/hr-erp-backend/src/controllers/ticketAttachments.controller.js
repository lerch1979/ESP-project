/**
 * Ticket photo attachments (ticket-level, table `ticket_attachments`).
 *
 * Resident self-scoped (mounted behind requireOwnTicket):
 *   POST /tickets/my/:ticketId/attachments       — upload one image
 *   GET  /tickets/my/:ticketId/attachments/:attId — stream one image
 * Staff view (gated tickets.view + contractor check; no staff upload):
 *   GET  /tickets/:ticketId/attachments           — list
 *   GET  /tickets/:ticketId/attachments/:attId     — stream
 *
 * Reuses storage.service (saveAtPath/read) — files land at
 *   uploads/tickets/YYYY/MM/<ticketId>/<uuid>.<ext>
 * The list/getMyTicketById always reflects the ACTUAL rows on disk, so a
 * partial upload (1 of 3) shows an honest count — never silently complete.
 */

const multer = require('multer');
const crypto = require('crypto');
const { query } = require('../database/connection');
const storage = require('../services/storage.service');
const { logger } = require('../utils/logger');

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_BYTES = 8 * 1024 * 1024; // ~8 MB
const MAX_PER_TICKET = 3;

// Memory storage, single image field "photo", size-limited. Non-images are
// dropped by fileFilter (req.file stays undefined → handler returns 400).
const _mw = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => cb(null, IMAGE_MIMES.includes(file.mimetype)),
}).single('photo');

function uploadPhoto(req, res, next) {
  _mw(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, message: 'A fájl túl nagy (max 8 MB)' });
      }
      return res.status(400).json({ success: false, message: 'Hibás fájl' });
    }
    next();
  });
}

async function listAttachments(ticketId) {
  const r = await query(
    `SELECT id, file_name, mime_type, file_size, created_at
       FROM ticket_attachments WHERE ticket_id = $1 ORDER BY created_at ASC`,
    [ticketId],
  );
  return r.rows;
}

async function _stream(res, ticketId, attId) {
  const r = await query(
    `SELECT file_path, file_name, mime_type FROM ticket_attachments WHERE id = $1 AND ticket_id = $2`,
    [attId, ticketId],
  );
  if (r.rows.length === 0) return res.status(404).json({ success: false, message: 'Fájl nem található' });
  const file = r.rows[0];
  let buffer;
  try {
    buffer = await storage.read(file.file_path);
  } catch (e) {
    return res.status(404).json({ success: false, message: 'A fájl nem található a tárolóban' });
  }
  res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
  res.setHeader('Content-Length', buffer.length);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.send(buffer);
}

// ── Resident (requireOwnTicket already verified ownership) ──────────────
const uploadMine = async (req, res) => {
  try {
    const { ticketId } = req.params;
    if (!req.file || !IMAGE_MIMES.includes(req.file.mimetype)) {
      return res.status(400).json({ success: false, message: 'Csak kép tölthető fel (JPEG/PNG/WebP)' });
    }
    const used = await query('SELECT count(*)::int AS c FROM ticket_attachments WHERE ticket_id = $1', [ticketId]);
    if (used.rows[0].c >= MAX_PER_TICKET) {
      return res.status(409).json({ success: false, message: `Legfeljebb ${MAX_PER_TICKET} fotó tölthető fel` });
    }
    const ext = EXT[req.file.mimetype] || 'jpg';
    const now = new Date();
    const relPath = `tickets/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${ticketId}/${crypto.randomUUID()}.${ext}`;
    const saved = await storage.saveAtPath({ relPath, buffer: req.file.buffer });
    const ins = await query(
      `INSERT INTO ticket_attachments (ticket_id, uploaded_by, file_path, file_name, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, file_name, mime_type, file_size, created_at`,
      [ticketId, req.user.id, saved.path, req.file.originalname || `photo.${ext}`, saved.size, req.file.mimetype],
    );
    res.status(201).json({ success: true, data: { attachment: ins.rows[0], count: used.rows[0].c + 1 } });
  } catch (err) {
    logger.error('[ticketAttachments.uploadMine]', err);
    res.status(500).json({ success: false, message: 'Feltöltési hiba' });
  }
};

const streamMine = (req, res) => _stream(res, req.params.ticketId, req.params.attId);

// ── Staff view (contractor-scoped; superadmin sees all) ─────────────────
async function _staffCanAccess(req, ticketId) {
  const r = await query('SELECT contractor_id FROM tickets WHERE id = $1', [ticketId]);
  if (r.rows.length === 0) return false;
  if ((req.user.roles || []).includes('superadmin')) return true;
  return r.rows[0].contractor_id === req.user.contractorId;
}

const listForStaff = async (req, res) => {
  try {
    if (!(await _staffCanAccess(req, req.params.ticketId))) {
      return res.status(404).json({ success: false, message: 'Hibajegy nem található' });
    }
    res.json({ success: true, data: { attachments: await listAttachments(req.params.ticketId) } });
  } catch (err) {
    logger.error('[ticketAttachments.listForStaff]', err);
    res.status(500).json({ success: false, message: 'Hiba' });
  }
};

const streamForStaff = async (req, res) => {
  if (!(await _staffCanAccess(req, req.params.ticketId))) {
    return res.status(404).json({ success: false, message: 'Hibajegy nem található' });
  }
  return _stream(res, req.params.ticketId, req.params.attId);
};

module.exports = { uploadPhoto, uploadMine, streamMine, listForStaff, streamForStaff, listAttachments };
