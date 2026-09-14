import { describe, expect, it } from 'vitest';
import { isTrialExpiredError, TRIAL_EXPIRED_MESSAGE } from '../../src/lib/http/trial-expiry.handler';

describe('trial expiry handler', () => {
  it('recognizes the centralized trial expiry error', () => {
    expect(isTrialExpiredError({ error: { code: 'TRIAL_EXPIRED', message: 'expired' } })).toBe(true);
  });
  it('does not intercept unrelated forbidden errors', () => {
    expect(isTrialExpiredError({ error: { code: 'FORBIDDEN', message: 'forbidden' } })).toBe(false);
  });
  it('provides an actionable Turkish warning', () => {
    expect(TRIAL_EXPIRED_MESSAGE).toContain('tam sürüme geçin');
  });
});
