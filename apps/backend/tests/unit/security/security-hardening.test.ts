import { describe, expect, it } from 'vitest';

import {
  getBcryptCost,
  hashPassword,
  PASSWORD_HASH_COST,
  passwordHashNeedsUpgrade,
  verifyPassword,
} from '../../../src/security/password-hashing.js';
import {
  createPasswordResetToken,
  verifyPasswordResetToken,
} from '../../../src/security/password-reset-token.js';

describe('security hardening primitives', () => {
  it('uses the approved bcrypt work factor and verifies the password', async () => {
    const hash = await hashPassword('Strong-password-42!');
    expect(getBcryptCost(hash)).toBe(PASSWORD_HASH_COST);
    await expect(verifyPassword('Strong-password-42!', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
    expect(passwordHashNeedsUpgrade(hash)).toBe(false);
    expect(passwordHashNeedsUpgrade('$2b$10$invalid-but-versioned-cost-marker')).toBe(true);
    expect(passwordHashNeedsUpgrade('legacy-or-invalid-hash')).toBe(true);
  });

  it('stores only a SHA-256 reset-token hash and compares timing-safely', () => {
    const token = createPasswordResetToken();
    expect(token.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(token.tokenHash).not.toContain(token.rawToken);
    expect(verifyPasswordResetToken(token.tokenHash, token.rawToken)).toBe(true);
    expect(verifyPasswordResetToken(token.tokenHash, 'different-token')).toBe(false);
  });
});
