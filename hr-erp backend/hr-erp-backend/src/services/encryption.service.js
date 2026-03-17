/**
 * PII Encryption Service
 * AES-256-CBC encryption for sensitive personal data.
 * Uses Node.js built-in crypto module for maximum security.
 *
 * Supports:
 *  - Per-field transparent encryption/decryption
 *  - Multiple PII field sets (employees, users)
 *  - Key version tracking for rotation
 *  - Backward-compatible plaintext detection
 */

const crypto = require('crypto');
const { logger } = require('../utils/logger');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const ENCODING = 'hex';

// ─── PII Field Definitions ─────────────────────────────────────────────────

// Fields that must be encrypted in the employees table
const PII_FIELDS = [
  'social_security_number',
  'passport_number',
  'bank_account',
  'tax_id',
  'company_phone',
  'mothers_name',
  'company_email',
  'permanent_address_street',
  'permanent_address_city',
  'permanent_address_zip',
  'permanent_address_number',
];

// Fields that must be encrypted in the users table
const USER_PII_FIELDS = [
  'email',
  'phone',
];

// All PII fields across all tables (for reporting/auditing)
const ALL_PII_FIELDS = {
  employees: PII_FIELDS,
  users: USER_PII_FIELDS,
};

// ─── Key Management ────────────────────────────────────────────────────────

function getEncryptionKey(keyEnvVar = 'ENCRYPTION_KEY') {
  const key = process.env[keyEnvVar];
  if (!key) {
    throw new Error(`${keyEnvVar} environment variable is not set. Generate a 32-byte hex key.`);
  }
  // Accept hex-encoded 32-byte key (64 hex chars) or raw 32-char string
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, 'hex');
  }
  if (key.length === 32) {
    return Buffer.from(key, 'utf8');
  }
  throw new Error(`${keyEnvVar} must be a 64-char hex string (32 bytes) or a 32-char string.`);
}

/**
 * Get the current encryption key version.
 */
function getCurrentKeyVersion() {
  return parseInt(process.env.ENCRYPTION_KEY_VERSION) || 1;
}

// ─── Core Encryption ───────────────────────────────────────────────────────

/**
 * Encrypt a plaintext value.
 * Returns null if input is null/undefined/empty.
 * Returns format: iv:encryptedData (both hex-encoded)
 */
function encrypt(plaintext, keyEnvVar = 'ENCRYPTION_KEY') {
  if (plaintext == null || plaintext === '') return null;

  try {
    const key = getEncryptionKey(keyEnvVar);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(String(plaintext), 'utf8', ENCODING);
    encrypted += cipher.final(ENCODING);

    return `${iv.toString(ENCODING)}:${encrypted}`;
  } catch (error) {
    logger.error('Encryption failed:', { error: error.message });
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt an encrypted value.
 * Returns null if input is null/undefined/empty.
 * If input doesn't look encrypted (no colon separator), returns as-is (backward compat).
 */
function decrypt(encryptedText, keyEnvVar = 'ENCRYPTION_KEY') {
  if (encryptedText == null || encryptedText === '') return null;

  // If it doesn't contain our iv:data format, return as-is (plaintext backward compat)
  if (!String(encryptedText).includes(':')) {
    return encryptedText;
  }

  try {
    const key = getEncryptionKey(keyEnvVar);
    const [ivHex, encrypted] = String(encryptedText).split(':');

    if (!ivHex || !encrypted) return encryptedText;

    const iv = Buffer.from(ivHex, ENCODING);
    if (iv.length !== IV_LENGTH) return encryptedText;

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, ENCODING, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    // If decryption fails, the data might be plaintext — return as-is
    logger.warn('Decryption failed, returning raw value:', { error: error.message });
    return encryptedText;
  }
}

/**
 * Check if a value appears to be encrypted (has iv:data format).
 */
function isEncrypted(value) {
  if (value == null || value === '') return false;
  const str = String(value);
  if (!str.includes(':')) return false;
  const [ivHex] = str.split(':');
  return ivHex && ivHex.length === IV_LENGTH * 2 && /^[0-9a-fA-F]+$/.test(ivHex);
}

// ─── Field-level Helpers ───────────────────────────────────────────────────

/**
 * Encrypt PII fields in a data object (for INSERT/UPDATE).
 * Only encrypts fields listed in the specified field set.
 * Returns a new object with encrypted values.
 */
function encryptPiiFields(data, fields = PII_FIELDS) {
  if (!data || typeof data !== 'object') return data;

  const result = { ...data };
  for (const field of fields) {
    if (field in result && result[field] != null && result[field] !== '') {
      if (!isEncrypted(result[field])) {
        result[field] = encrypt(result[field]);
      }
    }
  }
  return result;
}

/**
 * Decrypt PII fields in a data object (for SELECT results).
 * Only decrypts fields listed in the specified field set.
 * Returns a new object with decrypted values.
 */
function decryptPiiFields(data, fields = PII_FIELDS) {
  if (!data || typeof data !== 'object') return data;

  const result = { ...data };
  for (const field of fields) {
    if (field in result && result[field] != null) {
      result[field] = decrypt(result[field]);
    }
  }
  return result;
}

/**
 * Decrypt PII fields in an array of rows.
 */
function decryptPiiRows(rows, fields = PII_FIELDS) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(row => decryptPiiFields(row, fields));
}

/**
 * Encrypt user PII fields.
 */
function encryptUserPiiFields(data) {
  return encryptPiiFields(data, USER_PII_FIELDS);
}

/**
 * Decrypt user PII fields.
 */
function decryptUserPiiFields(data) {
  return decryptPiiFields(data, USER_PII_FIELDS);
}

/**
 * Decrypt user PII fields in an array.
 */
function decryptUserPiiRows(rows) {
  return decryptPiiRows(rows, USER_PII_FIELDS);
}

// ─── Key Rotation ──────────────────────────────────────────────────────────

/**
 * Re-encrypt a value from one key to another.
 * Used during key rotation.
 */
function reEncrypt(encryptedText, oldKeyEnvVar, newKeyEnvVar) {
  const plaintext = decrypt(encryptedText, oldKeyEnvVar);
  if (plaintext == null) return null;
  return encrypt(plaintext, newKeyEnvVar);
}

// ─── Key Generation ────────────────────────────────────────────────────────

/**
 * Generate a random 32-byte encryption key (hex-encoded).
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  encryptPiiFields,
  decryptPiiFields,
  decryptPiiRows,
  encryptUserPiiFields,
  decryptUserPiiFields,
  decryptUserPiiRows,
  reEncrypt,
  generateEncryptionKey,
  getCurrentKeyVersion,
  PII_FIELDS,
  USER_PII_FIELDS,
  ALL_PII_FIELDS,
};
