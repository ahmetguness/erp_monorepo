import { describe, expect, it } from 'vitest';
import { getAccessLockReasons, hasRequiredModule, hasRequiredPlan, lockReasonSummary } from '../../../src/lib/access-lock';

describe('access locks', () => {
  it('compares plan hierarchy', () => {
    expect(hasRequiredPlan('ENTERPRISE', 'PROFESSIONAL')).toBe(true);
    expect(hasRequiredPlan('STARTER', 'PROFESSIONAL')).toBe(false);
    expect(hasRequiredPlan('STARTER')).toBe(true);
  });

  it('supports compatible module aliases', () => {
    expect(hasRequiredModule(['INVOICING'], 'sales')).toBe(true);
    expect(hasRequiredModule(['WAREHOUSE'], 'inventory')).toBe(true);
    expect(hasRequiredModule(['ACCOUNTING'], 'inventory')).toBe(false);
    expect(hasRequiredModule([], 'inventory')).toBe(true);
  });

  it('returns all independent lock reasons', () => {
    const reasons = getAccessLockReasons({
      currentPlan: 'STARTER',
      requiredPlan: 'ENTERPRISE',
      requiredModule: 'inventory',
      tenantModules: ['ACCOUNTING'],
      featureAllowed: false,
      limitReached: true,
    });
    expect(reasons.map((reason) => reason.code)).toEqual(['plan', 'module', 'feature', 'limit']);
    expect(lockReasonSummary(reasons)).toContain('Plan yetersiz');
    expect(lockReasonSummary([])).toBe('Erisim acik');
  });
});
