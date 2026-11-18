import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { expect, test } from 'vitest';
import { createJwtVerificationKey } from '../../../src/lib/jwt-verification-key.js';

test.each(['HS256', 'HS384', 'HS512'] as const)('prepared JWT keys preserve %s validation and reject wrong/expired signatures', (algorithm) => {
  const secret = 'synthetic-key-for-unit-tests-not-a-customer-secret';
  const key = createJwtVerificationKey(secret);
  const token = jwt.sign({ tenantId: 'test-tenant', userId: 'test-user' }, secret, { algorithm, expiresIn: '1h' });
  expect(jwt.verify(token, key)).toEqual(jwt.verify(token, secret));
  expect(() => jwt.verify(token, createJwtVerificationKey('different-synthetic-secret'))).toThrow();
  expect(() => jwt.verify(jwt.sign({}, secret, { algorithm, expiresIn: -1 }), key)).toThrow('jwt expired');
  expect(() => jwt.verify(token, key, { algorithms: ['RS256'] })).toThrow();
});

test('PEM verification keys retain asymmetric validation rather than becoming HMAC secrets', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const key = createJwtVerificationKey(pem);
  expect(key.type).toBe('public');
  const token = jwt.sign({ tenantId: 'test' }, privateKey, { algorithm: 'RS256' });
  expect(jwt.verify(token, key)).toEqual(jwt.verify(token, pem));
  expect(() => jwt.verify(jwt.sign({}, 'wrong-hmac-secret'), key)).toThrow();
});
