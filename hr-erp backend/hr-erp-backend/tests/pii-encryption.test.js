/**
 * Comprehensive PII Encryption Tests
 * Tests all PII field encryption/decryption across employees and users tables.
 */

process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2';

const {
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
} = require('../src/services/encryption.service');

// ═══════════════════════════════════════════════════════════════════════
// EXPANDED PII FIELD DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════

describe('PII Field Definitions', () => {
  test('PII_FIELDS contains all 11 employee fields', () => {
    expect(PII_FIELDS).toContain('social_security_number');
    expect(PII_FIELDS).toContain('passport_number');
    expect(PII_FIELDS).toContain('bank_account');
    expect(PII_FIELDS).toContain('tax_id');
    expect(PII_FIELDS).toContain('company_phone');
    expect(PII_FIELDS).toContain('mothers_name');
    expect(PII_FIELDS).toContain('company_email');
    expect(PII_FIELDS).toContain('permanent_address_street');
    expect(PII_FIELDS).toContain('permanent_address_city');
    expect(PII_FIELDS).toContain('permanent_address_zip');
    expect(PII_FIELDS).toContain('permanent_address_number');
    expect(PII_FIELDS).toHaveLength(11);
  });

  test('USER_PII_FIELDS contains email and phone', () => {
    expect(USER_PII_FIELDS).toContain('email');
    expect(USER_PII_FIELDS).toContain('phone');
    expect(USER_PII_FIELDS).toHaveLength(2);
  });

  test('ALL_PII_FIELDS maps tables to field arrays', () => {
    expect(ALL_PII_FIELDS.employees).toEqual(PII_FIELDS);
    expect(ALL_PII_FIELDS.users).toEqual(USER_PII_FIELDS);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// CORE ENCRYPTION
// ═══════════════════════════════════════════════════════════════════════

describe('encrypt/decrypt', () => {
  test('encrypts and decrypts a string', () => {
    const plain = 'TAJ-123456789';
    const encrypted = encrypt(plain);
    expect(encrypted).not.toBe(plain);
    expect(decrypt(encrypted)).toBe(plain);
  });

  test('returns null for null input', () => {
    expect(encrypt(null)).toBeNull();
    expect(decrypt(null)).toBeNull();
  });

  test('returns null for undefined input', () => {
    expect(encrypt(undefined)).toBeNull();
    expect(decrypt(undefined)).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(encrypt('')).toBeNull();
    expect(decrypt('')).toBeNull();
  });

  test('different IVs produce different ciphertexts', () => {
    const plain = 'same-data';
    const enc1 = encrypt(plain);
    const enc2 = encrypt(plain);
    expect(enc1).not.toBe(enc2);
    expect(decrypt(enc1)).toBe(plain);
    expect(decrypt(enc2)).toBe(plain);
  });

  test('handles special characters', () => {
    const special = 'Árvíztűrő tükörfúrógép!@#$%^&*()';
    expect(decrypt(encrypt(special))).toBe(special);
  });

  test('handles numeric strings', () => {
    const num = '1234567890';
    expect(decrypt(encrypt(num))).toBe(num);
  });

  test('handles long strings', () => {
    const long = 'A'.repeat(10000);
    expect(decrypt(encrypt(long))).toBe(long);
  });

  test('returns plaintext as-is if no colon separator (backward compat)', () => {
    expect(decrypt('plaintext-no-colon')).toBe('plaintext-no-colon');
  });

  test('encrypted format is iv:data', () => {
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toHaveLength(32); // 16 bytes hex = 32 chars
  });

  test('handles numbers converted to strings', () => {
    expect(decrypt(encrypt(12345))).toBe('12345');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// isEncrypted DETECTION
// ═══════════════════════════════════════════════════════════════════════

describe('isEncrypted', () => {
  test('detects encrypted values', () => {
    const encrypted = encrypt('test');
    expect(isEncrypted(encrypted)).toBe(true);
  });

  test('rejects null', () => {
    expect(isEncrypted(null)).toBe(false);
  });

  test('rejects empty string', () => {
    expect(isEncrypted('')).toBe(false);
  });

  test('rejects plaintext without colon', () => {
    expect(isEncrypted('just plain text')).toBe(false);
  });

  test('rejects non-hex iv', () => {
    expect(isEncrypted('notahexvalue12345678901234567890:data')).toBe(false);
  });

  test('rejects short iv', () => {
    expect(isEncrypted('abc:data')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// EMPLOYEE PII FIELD ENCRYPTION
// ═══════════════════════════════════════════════════════════════════════

describe('encryptPiiFields (employees)', () => {
  test('encrypts all PII fields in employee data', () => {
    const data = {
      id: 'uuid-123',
      first_name: 'John',
      social_security_number: '123-45-678',
      passport_number: 'AB123456',
      bank_account: 'HU42-1234-5678-9012',
      tax_id: '8765432190',
      company_phone: '+36301234567',
      mothers_name: 'Kovács Mária',
      company_email: 'john@company.com',
      permanent_address_street: 'Kossuth utca',
      permanent_address_city: 'Budapest',
      permanent_address_zip: '1051',
      permanent_address_number: '42/A',
    };

    const encrypted = encryptPiiFields(data);

    // Non-PII fields unchanged
    expect(encrypted.id).toBe('uuid-123');
    expect(encrypted.first_name).toBe('John');

    // PII fields encrypted
    expect(encrypted.social_security_number).not.toBe('123-45-678');
    expect(encrypted.passport_number).not.toBe('AB123456');
    expect(encrypted.bank_account).not.toBe('HU42-1234-5678-9012');
    expect(encrypted.tax_id).not.toBe('8765432190');
    expect(encrypted.company_phone).not.toBe('+36301234567');
    expect(encrypted.mothers_name).not.toBe('Kovács Mária');
    expect(encrypted.company_email).not.toBe('john@company.com');
    expect(encrypted.permanent_address_street).not.toBe('Kossuth utca');
    expect(encrypted.permanent_address_city).not.toBe('Budapest');
    expect(encrypted.permanent_address_zip).not.toBe('1051');
    expect(encrypted.permanent_address_number).not.toBe('42/A');
  });

  test('does not encrypt null fields', () => {
    const data = { social_security_number: null, first_name: 'John' };
    const encrypted = encryptPiiFields(data);
    expect(encrypted.social_security_number).toBeNull();
  });

  test('does not encrypt empty strings', () => {
    const data = { social_security_number: '', first_name: 'John' };
    const encrypted = encryptPiiFields(data);
    expect(encrypted.social_security_number).toBe('');
  });

  test('returns non-object data as-is', () => {
    expect(encryptPiiFields(null)).toBeNull();
    expect(encryptPiiFields(undefined)).toBeUndefined();
    expect(encryptPiiFields('string')).toBe('string');
  });

  test('does not re-encrypt already encrypted values', () => {
    const data = { social_security_number: '123-45-678' };
    const first = encryptPiiFields(data);
    const second = encryptPiiFields(first);
    // Should be able to decrypt once
    expect(decrypt(second.social_security_number)).toBe('123-45-678');
  });

  test('handles partial data (not all PII fields present)', () => {
    const data = { social_security_number: '123', first_name: 'Test' };
    const encrypted = encryptPiiFields(data);
    expect(encrypted.first_name).toBe('Test');
    expect(isEncrypted(encrypted.social_security_number)).toBe(true);
    expect(encrypted.passport_number).toBeUndefined();
  });
});

describe('decryptPiiFields (employees)', () => {
  test('decrypts all PII fields', () => {
    const original = {
      social_security_number: '123-45-678',
      passport_number: 'AB123456',
      bank_account: 'HU42-1234-5678-9012',
      tax_id: '8765432190',
      company_phone: '+36301234567',
      mothers_name: 'Kovács Mária',
      company_email: 'john@company.com',
      permanent_address_street: 'Kossuth utca',
      permanent_address_city: 'Budapest',
      permanent_address_zip: '1051',
      permanent_address_number: '42/A',
      first_name: 'John',
    };

    const encrypted = encryptPiiFields(original);
    const decrypted = decryptPiiFields(encrypted);

    expect(decrypted.social_security_number).toBe('123-45-678');
    expect(decrypted.passport_number).toBe('AB123456');
    expect(decrypted.bank_account).toBe('HU42-1234-5678-9012');
    expect(decrypted.tax_id).toBe('8765432190');
    expect(decrypted.company_phone).toBe('+36301234567');
    expect(decrypted.mothers_name).toBe('Kovács Mária');
    expect(decrypted.company_email).toBe('john@company.com');
    expect(decrypted.permanent_address_street).toBe('Kossuth utca');
    expect(decrypted.permanent_address_city).toBe('Budapest');
    expect(decrypted.permanent_address_zip).toBe('1051');
    expect(decrypted.permanent_address_number).toBe('42/A');
    expect(decrypted.first_name).toBe('John');
  });

  test('handles plaintext backward compat', () => {
    const data = { social_security_number: 'plaintext-value' };
    const decrypted = decryptPiiFields(data);
    expect(decrypted.social_security_number).toBe('plaintext-value');
  });
});

describe('decryptPiiRows', () => {
  test('decrypts array of rows', () => {
    const rows = [
      encryptPiiFields({ social_security_number: '111' }),
      encryptPiiFields({ social_security_number: '222' }),
    ];

    const decrypted = decryptPiiRows(rows);
    expect(decrypted[0].social_security_number).toBe('111');
    expect(decrypted[1].social_security_number).toBe('222');
  });

  test('returns non-array as-is', () => {
    expect(decryptPiiRows(null)).toBeNull();
    expect(decryptPiiRows('string')).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// USER PII FIELD ENCRYPTION
// ═══════════════════════════════════════════════════════════════════════

describe('User PII encryption', () => {
  test('encryptUserPiiFields encrypts email and phone', () => {
    const data = {
      id: 'uuid-1',
      email: 'user@example.com',
      phone: '+36301234567',
      first_name: 'Test',
    };

    const encrypted = encryptUserPiiFields(data);
    expect(encrypted.id).toBe('uuid-1');
    expect(encrypted.first_name).toBe('Test');
    expect(encrypted.email).not.toBe('user@example.com');
    expect(encrypted.phone).not.toBe('+36301234567');
  });

  test('decryptUserPiiFields decrypts email and phone', () => {
    const data = {
      email: 'user@example.com',
      phone: '+36301234567',
    };
    const encrypted = encryptUserPiiFields(data);
    const decrypted = decryptUserPiiFields(encrypted);
    expect(decrypted.email).toBe('user@example.com');
    expect(decrypted.phone).toBe('+36301234567');
  });

  test('decryptUserPiiRows decrypts array', () => {
    const rows = [
      encryptUserPiiFields({ email: 'a@b.com' }),
      encryptUserPiiFields({ email: 'c@d.com' }),
    ];
    const decrypted = decryptUserPiiRows(rows);
    expect(decrypted[0].email).toBe('a@b.com');
    expect(decrypted[1].email).toBe('c@d.com');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// KEY ROTATION
// ═══════════════════════════════════════════════════════════════════════

describe('Key rotation', () => {
  test('reEncrypt works with different keys', () => {
    const newKey = generateEncryptionKey();
    process.env.ENCRYPTION_KEY_NEW = newKey;

    const plain = 'sensitive-data';
    const encrypted = encrypt(plain, 'ENCRYPTION_KEY');
    const reEncrypted = reEncrypt(encrypted, 'ENCRYPTION_KEY', 'ENCRYPTION_KEY_NEW');

    expect(reEncrypted).not.toBe(encrypted);
    expect(decrypt(reEncrypted, 'ENCRYPTION_KEY_NEW')).toBe(plain);

    delete process.env.ENCRYPTION_KEY_NEW;
  });

  test('reEncrypt returns null for null input', () => {
    expect(reEncrypt(null, 'ENCRYPTION_KEY', 'ENCRYPTION_KEY')).toBeNull();
  });

  test('getCurrentKeyVersion returns default 1', () => {
    delete process.env.ENCRYPTION_KEY_VERSION;
    expect(getCurrentKeyVersion()).toBe(1);
  });

  test('getCurrentKeyVersion reads from env', () => {
    process.env.ENCRYPTION_KEY_VERSION = '3';
    expect(getCurrentKeyVersion()).toBe(3);
    delete process.env.ENCRYPTION_KEY_VERSION;
  });
});

// ═══════════════════════════════════════════════════════════════════════
// KEY GENERATION
// ═══════════════════════════════════════════════════════════════════════

describe('generateEncryptionKey', () => {
  test('generates 64-char hex key', () => {
    const key = generateEncryptionKey();
    expect(key).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(key)).toBe(true);
  });

  test('generates unique keys', () => {
    const key1 = generateEncryptionKey();
    const key2 = generateEncryptionKey();
    expect(key1).not.toBe(key2);
  });

  test('generated key works for encryption', () => {
    const key = generateEncryptionKey();
    const originalKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = key;

    const encrypted = encrypt('test-data');
    expect(decrypt(encrypted)).toBe('test-data');

    process.env.ENCRYPTION_KEY = originalKey;
  });
});

// ═══════════════════════════════════════════════════════════════════════
// KEY VALIDATION
// ═══════════════════════════════════════════════════════════════════════

describe('Key validation', () => {
  test('throws on missing key', () => {
    const original = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt('test')).toThrow();
    process.env.ENCRYPTION_KEY = original;
  });

  test('throws on invalid key length', () => {
    const original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = 'tooshort';
    expect(() => encrypt('test')).toThrow();
    process.env.ENCRYPTION_KEY = original;
  });

  test('accepts 32-char utf8 key', () => {
    const original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012'; // exactly 32 chars
    const encrypted = encrypt('test');
    expect(decrypt(encrypted)).toBe('test');
    process.env.ENCRYPTION_KEY = original;
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════

describe('Module exports', () => {
  const mod = require('../src/services/encryption.service');

  test('exports all expected functions', () => {
    expect(typeof mod.encrypt).toBe('function');
    expect(typeof mod.decrypt).toBe('function');
    expect(typeof mod.isEncrypted).toBe('function');
    expect(typeof mod.encryptPiiFields).toBe('function');
    expect(typeof mod.decryptPiiFields).toBe('function');
    expect(typeof mod.decryptPiiRows).toBe('function');
    expect(typeof mod.encryptUserPiiFields).toBe('function');
    expect(typeof mod.decryptUserPiiFields).toBe('function');
    expect(typeof mod.decryptUserPiiRows).toBe('function');
    expect(typeof mod.reEncrypt).toBe('function');
    expect(typeof mod.generateEncryptionKey).toBe('function');
    expect(typeof mod.getCurrentKeyVersion).toBe('function');
  });

  test('exports PII field arrays', () => {
    expect(Array.isArray(mod.PII_FIELDS)).toBe(true);
    expect(Array.isArray(mod.USER_PII_FIELDS)).toBe(true);
    expect(typeof mod.ALL_PII_FIELDS).toBe('object');
  });
});
