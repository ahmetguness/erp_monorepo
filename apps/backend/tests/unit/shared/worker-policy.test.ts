import { describe, expect, it } from 'vitest';
import { exponentialBackoffMs, hasAttemptsRemaining, nextRetryDate } from '../../../src/modules/shared/domain/worker-policy.js';

const policy = { maxAttempts: 4, initialDelayMs: 1_000, maxDelayMs: 5_000 } as const;

describe('worker retry policy', () => {
  it('uses capped exponential backoff', () => {
    expect([1, 2, 3, 4].map((attempt) => exponentialBackoffMs(attempt, policy))).toEqual([1_000, 2_000, 4_000, 5_000]);
  });

  it('computes deterministic retry dates and attempt exhaustion', () => {
    const now = new Date('2026-08-27T12:00:00.000Z');
    expect(nextRetryDate(3, now, policy).toISOString()).toBe('2026-08-27T12:00:04.000Z');
    expect(hasAttemptsRemaining(3, policy)).toBe(true);
    expect(hasAttemptsRemaining(4, policy)).toBe(false);
  });
});
