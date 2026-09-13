import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { decrypt, encrypt, isEncryptedPayload } from '../../../src/utils/encryption.js';

describe('credential encryption', () => {
  const previousKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = 'unit-test-encryption-key';
  });

  afterEach(() => {
    if (previousKey === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = previousKey;
  });

  it('encrypts credentials with an authenticated versioned payload', () => {
    const encrypted = encrypt('marketplace-secret');

    expect(encrypted).not.toContain('marketplace-secret');
    expect(isEncryptedPayload(encrypted)).toBe(true);
    expect(decrypt(encrypted)).toBe('marketplace-secret');
  });

  it('recognizes legacy plaintext without exposing it as encrypted', () => {
    expect(isEncryptedPayload('legacy-secret')).toBe(false);
    expect(decrypt('legacy-secret')).toBe('legacy-secret');
  });
});
