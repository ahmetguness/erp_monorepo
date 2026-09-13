import { ValidationError } from '../../../../errors/index.js';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

export function parseIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string') throw new ValidationError('idempotencyKey alani zorunludur.');
  const key = value.trim();
  if (key.length < 8 || key.length > 120 || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new ValidationError('idempotencyKey 8-120 karakter olmali ve sadece harf, rakam, nokta, tire, alt cizgi veya iki nokta icermelidir.');
  }
  return key;
}
