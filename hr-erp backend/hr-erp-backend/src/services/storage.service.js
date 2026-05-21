/**
 * Storage adapter for expense file attachments.
 *
 * Today: local filesystem only. Layout is
 *   uploads/expenses/YYYY/MM/<expense_id>/<uuid>.<ext>
 *
 * Tomorrow: an S3 (or any blob-store) adapter that satisfies the same
 * interface drops in behind the same `storageService.*` calls without
 * touching the controller. Don't expand this interface for S3 specifics
 * until we actually add S3 — speculative breadth is the enemy here.
 *
 * Tech debt: uploads/ is not currently in the nightly backup cron. Before
 * production cutover, EITHER add it to the backup OR migrate to S3.
 * Tracked in PROJECT_STATE.md.
 */

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

// MIME → file extension. Doubles as the allowlist — anything not here is
// rejected by save() and won't end up on disk.
const EXT_BY_MIME = Object.freeze({
  'application/pdf': 'pdf',
  'image/jpeg':      'jpg',
  'image/jpg':       'jpg',
  'image/png':       'png',
});

const ALLOWED_MIMES = Object.freeze(Object.keys(EXT_BY_MIME));

const BILLING_MONTH_RE = /^\d{4}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class LocalStorageAdapter {
  /**
   * Persist a buffer and return a metadata record ready to push into
   * `accommodation_expenses.file_attachments`.
   */
  async save({ buffer, mime, expense_id, billing_month, original_name, uploaded_by = null }) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error('save: buffer required');
    }
    if (!EXT_BY_MIME[mime]) {
      throw new Error(`save: unsupported mime ${mime}`);
    }
    if (!BILLING_MONTH_RE.test(String(billing_month || ''))) {
      throw new Error('save: billing_month must be YYYY-MM');
    }
    if (!UUID_RE.test(String(expense_id || ''))) {
      throw new Error('save: expense_id must be UUID');
    }

    const [year, month] = billing_month.split('-');
    const file_id = crypto.randomUUID();
    const ext = EXT_BY_MIME[mime];
    const filename = `${file_id}.${ext}`;

    // path.posix to keep DB-stored paths portable (forward slashes
    // regardless of host OS). Absolute path on disk is rebuilt with
    // path.join in read/delete.
    const relPath = path.posix.join('expenses', year, month, expense_id, filename);
    const absPath = this._absolute(relPath);

    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, buffer);

    return {
      id: file_id,
      filename,
      original_name: original_name || filename,
      mime,
      size: buffer.length,
      path: relPath,
      uploaded_at: new Date().toISOString(),
      uploaded_by,
    };
  }

  async read(relPath) {
    const absPath = this._absolute(relPath);
    return fs.readFile(absPath);
  }

  async delete(relPath) {
    const absPath = this._absolute(relPath);
    try {
      await fs.unlink(absPath);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e; // unlinking a missing file is fine
    }
  }

  /**
   * URL the client should hit to fetch the file. Local mode = our own
   * authenticated download endpoint. S3 adapter will return a signed URL.
   */
  getUrl({ expense_id, file_id }) {
    return `/api/v1/expenses/${expense_id}/files/${file_id}`;
  }

  /**
   * Resolve relPath against UPLOAD_ROOT, refusing any result that
   * escapes UPLOAD_ROOT. Blocks path-traversal payloads like
   * '../etc/passwd' or absolute paths.
   */
  _absolute(relPath) {
    if (typeof relPath !== 'string' || !relPath) {
      throw new Error('storage: empty path');
    }
    const absPath = path.resolve(UPLOAD_ROOT, relPath);
    if (absPath !== UPLOAD_ROOT
        && !absPath.startsWith(UPLOAD_ROOT + path.sep)) {
      throw new Error('storage: path traversal blocked');
    }
    return absPath;
  }
}

const instance = new LocalStorageAdapter();

module.exports = instance;
module.exports.ALLOWED_MIMES = ALLOWED_MIMES;
module.exports.EXT_BY_MIME = EXT_BY_MIME;
module.exports.UPLOAD_ROOT = UPLOAD_ROOT;
