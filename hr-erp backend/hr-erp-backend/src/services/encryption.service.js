/**
 * PII Encryption Service
 * AES-256-CBC encryption for sensitive personal data.
 * Uses Node.js built-in crypto module for maximum security.
 */

const crypto = require('crypto');
const { logger } = require('../utils/logger');

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const ENCODING = 'hex';

// Fields that must be encrypted in the employees table
const PII_FIELDS = [
  'social_security_number',
  'passport_number',
  'bank_account',
  'tax_id',
  'company_phone',
  'mothers_name',
];

function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set. Generate a 32-byte hex key.');
  }
  // Accept hex-encoded 32-byte key (64 hex chars) or raw 32-char string
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, 'hex');
  }
  if (key.length === 32) {
    return Buffer.from(key, 'utf8');
  }
  throw new Error('ENCRYPTION_KEY must be a 64-char hex string (32 bytes) or a 32-char string.');
}

/**
 * Encrypt a plaintext value.
 * Returns null if input is null/undefined/empty.
 * Returns format: iv:encryptedData (both hex-encoded)
 */
function encrypt(plaintext) {
  if (plaintext == null || plaintext === '') return null;

  try {
    const key = getEncryptionKey();
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
 * If input doesn't look encrypted (no colon separator), returns as-is (for backward compat).
 */
function decrypt(encryptedText) {
  if (encryptedText == null || encryptedText === '') return null;

  // If it doesn't contain our iv:data format, return as-is (plaintext backward compat)
  if (!String(encryptedText).includes(':')) {
    return encryptedText;
  }

  try {
    const key = getEncryptionKey();
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
 * Encrypt PII fields in a data object (for INSERT/UPDATE).
 * Only encrypts fields listed in PII_FIELDS.
 * Returns a new object with encrypted values.
 */
function encryptPiiFields(data) {
  if (!data || typeof data !== 'object') return data;

  const result = { ...data };
  for (const field of PII_FIELDS) {
    if (field in result && result[field] != null && result[field] !== '') {
      result[field] = encrypt(result[field]);
    }
  }
  return result;
}

/**
 * Decrypt PII fields in a data object (for SELECT results).
 * Only decrypts fields listed in PII_FIELDS.
 * Returns a new object with decrypted values.
 */
function decryptPiiFields(data) {
  if (!data || typeof data !== 'object') return data;

  const result = { ...data };
  for (const field of PII_FIELDS) {
    if (field in result && result[field] != null) {
      result[field] = decrypt(result[field]);
    }
  }
  return result;
}

/**
 * Decrypt PII fields in an array of rows.
 */
function decryptPiiRows(rows) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(decryptPiiFields);
}

/**
 * Generate a random 32-byte encryption key (hex-encoded).
 */
function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  encrypt,
  decrypt,
  encryptPiiFields,
  decryptPiiFields,
  decryptPiiRows,
  generateEncryptionKey,
  PII_FIELDS,
};
