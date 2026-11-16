import { describe, expect, it } from 'vitest';
import { restoreStoredEvent } from '../../src/domain-events/event-codec.js';
import { IncompatibleEventError, PermanentDeliveryError } from '../../src/domain-events/delivery/retry-policy.js';

const legacy = {
  tenantId: 'tenant-a', name: 'payment.received', schemaVersion: 1,
  context: { tenantId: 'tenant-a', occurredAt: '2026-11-16T12:00:00Z' },
  payload: { paymentId: 'payment-1', contactId: null, amount: 10, method: 'CASH', reference: null }
};

describe('durable event protocol', () => {
  it('reads v1 and additive payload fields with the current worker', () => {
    expect(restoreStoredEvent({ ...legacy, payload: { ...legacy.payload, additiveField: 'vNext' } }).name).toBe('payment.received');
  });
  it('distinguishes an incompatible future version from a tenant context violation', () => {
    expect(() => restoreStoredEvent({ ...legacy, schemaVersion: 3 })).toThrow(IncompatibleEventError);
    expect(() => restoreStoredEvent({ ...legacy, tenantId: 'tenant-b' })).toThrow(PermanentDeliveryError);
  });
  it('rejects malformed expiry and completion metadata instead of silently disabling those checks', () => {
    for (const payload of [{ mailId: 'mail-1', expiresAt: 42 }, { mailId: 'mail-1', provisioning: { jobId: 'job-1', attempt: -1 } }]) {
      expect(() => restoreStoredEvent({ ...legacy, name: 'mail.delivery.requested', schemaVersion: 2, payload })).toThrow();
    }
  });
});
