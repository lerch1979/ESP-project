/**
 * Encryption Service Tests
 */

// Set test encryption key before requiring the service
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2';

const {
  encrypt,
  decrypt,
  encryptPiiFields,
  decryptPiiFields,
  decryptPiiRows,
  generateEncryptionKey,
  PII_FIELDS,
} = require('../src/services/encryption.service');

describe('Encryption Service', () => {
  describe('encrypt/decrypt', () => {
    test('should encrypt and decrypt a string correctly', () => {
      const plaintext = '123-45-6789';
      const encrypted = encrypt(plaintext);

      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain(':');

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    test('should return null for null input', () => {
      expect(encrypt(null)).toBeNull();
      expect(decrypt(null)).toBeNull();
    });

    test('should return null for undefined input', () => {
      expect(encrypt(undefined)).toBeNull();
      expect(decrypt(undefined)).toBeNull();
    });

    test('should return null for empty string', () => {
      expect(encrypt('')).toBeNull();
      expect(decrypt('')).toBeNull();
    });

    test('should produce different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'HU12345678';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    test('should handle special characters', () => {
      const plaintext = 'HU-1234/5678 (special) áéíóöőúüű';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    test('should handle numeric strings', () => {
      const plaintext = '1234567890';
      const encrypted = encrypt(plaintext);
      expect(decrypt(encrypted)).toBe(plaintext);
    });

    test('should convert numbers to strings before encrypting', () => {
      const encrypted = encrypt(12345);
      expect(decrypt(encrypted)).toBe('12345');
    });

    test('should return plaintext as-is if decryption input has no colon', () => {
      expect(decrypt('plaintext-without-colon')).toBe('plaintext-without-colon');
    });

    test('should handle backward-compatible plaintext gracefully', () => {
      // Old plaintext data that hasn't been encrypted yet
      const oldPlaintext = 'AB123456';
      const result = decrypt(oldPlaintext);
      expect(result).toBe(oldPlaintext);
    });
  });

  describe('encryptPiiFields', () => {
    test('should encrypt only PII fields in an object', () => {
      const data = {
        first_name: 'John',
        last_name: 'Doe',
        social_security_number: '123-45-6789',
        passport_number: 'AB123456',
        bank_account: 'HU12345678901234567890',
        tax_id: '1234567890',
        workplace: 'Budapest Office',
      };

      const encrypted = encryptPiiFields(data);

      // Non-PII fields should be unchanged
      expect(encrypted.first_name).toBe('John');
      expect(encrypted.last_name).toBe('Doe');
      expect(encrypted.workplace).toBe('Budapest Office');

      // PII fields should be encrypted
      expect(encrypted.social_security_number).not.toBe('123-45-6789');
      expect(encrypted.passport_number).not.toBe('AB123456');
      expect(encrypted.bank_account).not.toBe('HU12345678901234567890');
      expect(encrypted.tax_id).not.toBe('1234567890');

      // Should contain iv:data format
      expect(encrypted.social_security_number).toContain(':');
    });

    test('should not modify the original object', () => {
      const data = { social_security_number: '123-45-6789' };
      const encrypted = encryptPiiFields(data);
      expect(data.social_security_number).toBe('123-45-6789');
      expect(encrypted.social_security_number).not.toBe('123-45-6789');
    });

    test('should handle null/undefined fields gracefully', () => {
      const data = {
        social_security_number: null,
        passport_number: undefined,
        bank_account: '',
        tax_id: '12345',
      };
      const encrypted = encryptPiiFields(data);
      expect(encrypted.social_security_number).toBeNull();
      expect(encrypted.passport_number).toBeUndefined();
      expect(encrypted.bank_account).toBe('');
      expect(encrypted.tax_id).toContain(':');
    });

    test('should return null/undefined input as-is', () => {
      expect(encryptPiiFields(null)).toBeNull();
      expect(encryptPiiFields(undefined)).toBeUndefined();
    });
  });

  describe('decryptPiiFields', () => {
    test('should decrypt PII fields in an object', () => {
      const original = {
        first_name: 'John',
        social_security_number: '123-45-6789',
        passport_number: 'AB123456',
        bank_account: 'HU123',
        tax_id: '9876',
      };

      const encrypted = encryptPiiFields(original);
      const decrypted = decryptPiiFields(encrypted);

      expect(decrypted.first_name).toBe('John');
      expect(decrypted.social_security_number).toBe('123-45-6789');
      expect(decrypted.passport_number).toBe('AB123456');
      expect(decrypted.bank_account).toBe('HU123');
      expect(decrypted.tax_id).toBe('9876');
    });
  });

  describe('decryptPiiRows', () => {
    test('should decrypt PII fields in an array of rows', () => {
      const rows = [
        { id: '1', social_security_number: encrypt('SSN1'), first_name: 'Alice' },
        { id: '2', social_security_number: encrypt('SSN2'), first_name: 'Bob' },
      ];

      const decrypted = decryptPiiRows(rows);

      expect(decrypted[0].social_security_number).toBe('SSN1');
      expect(decrypted[0].first_name).toBe('Alice');
      expect(decrypted[1].social_security_number).toBe('SSN2');
      expect(decrypted[1].first_name).toBe('Bob');
    });

    test('should handle empty array', () => {
      expect(decryptPiiRows([])).toEqual([]);
    });

    test('should handle non-array input', () => {
      expect(decryptPiiRows(null)).toBeNull();
      expect(decryptPiiRows(undefined)).toBeUndefined();
    });
  });

  describe('generateEncryptionKey', () => {
    test('should generate a 64-char hex string (32 bytes)', () => {
      const key = generateEncryptionKey();
      expect(key).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(key)).toBe(true);
    });

    test('should generate unique keys', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('PII_FIELDS constant', () => {
    test('should contain the original fields', () => {
      expect(PII_FIELDS).toContain('social_security_number');
      expect(PII_FIELDS).toContain('passport_number');
      expect(PII_FIELDS).toContain('bank_account');
      expect(PII_FIELDS).toContain('tax_id');
    });

    test('should contain the extended fields', () => {
      expect(PII_FIELDS).toContain('company_phone');
      expect(PII_FIELDS).toContain('mothers_name');
    });

    test('should have 6 total PII fields', () => {
      expect(PII_FIELDS).toHaveLength(6);
    });
  });

  describe('Extended PII field encryption', () => {
    test('should encrypt company_phone', () => {
      const data = { company_phone: '+36201234567', first_name: 'Test' };
      const encrypted = encryptPiiFields(data);
      expect(encrypted.company_phone).not.toBe('+36201234567');
      expect(encrypted.company_phone).toContain(':');
      expect(encrypted.first_name).toBe('Test');

      const decrypted = decryptPiiFields(encrypted);
      expect(decrypted.company_phone).toBe('+36201234567');
    });

    test('should encrypt mothers_name', () => {
      const data = { mothers_name: 'Nagy Mária' };
      const encrypted = encryptPiiFields(data);
      expect(encrypted.mothers_name).toContain(':');
      const decrypted = decryptPiiFields(encrypted);
      expect(decrypted.mothers_name).toBe('Nagy Mária');
    });

    test('should encrypt all 6 PII fields in one object', () => {
      const data = {
        social_security_number: '123-456-789',
        passport_number: 'AB123456',
        bank_account: 'HU12345678',
        tax_id: '8765432109',
        company_phone: '+36201234567',
        mothers_name: 'Teszt Éva',
        first_name: 'Unchanged',
      };
      const encrypted = encryptPiiFields(data);
      for (const field of PII_FIELDS) {
        expect(encrypted[field]).toContain(':');
      }
      expect(encrypted.first_name).toBe('Unchanged');

      const decrypted = decryptPiiFields(encrypted);
      expect(decrypted.social_security_number).toBe('123-456-789');
      expect(decrypted.mothers_name).toBe('Teszt Éva');
    });
  });
});
