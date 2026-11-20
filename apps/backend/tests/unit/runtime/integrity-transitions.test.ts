import { expect, it } from 'vitest';
import { IntegrityTransitions } from '../../../src/modules/platform/application/observability/integrity-transitions.js';

const stock = (count: number) => `axon_business_invariant_violations{invariant="negativeStock"} ${count}\n`;

it('reports audit failure even if no healthy scan occurs after a stock failure', () => {
  const transitions = new IntegrityTransitions();
  expect(transitions.update(stock(1))).toEqual({ changed: true, failed: true, causes: 'invariant:negativeStock' });
  expect(transitions.update(stock(0) + 'axon_audit_integrity_valid 0\n')).toEqual({ changed: true, failed: true, causes: 'auditIntegrity' });
});

it('coalesces repeated readings and count changes of the same cause', () => {
  const transitions = new IntegrityTransitions();
  transitions.update(stock(1));
  expect(transitions.update(stock(2))).toEqual({ changed: false, failed: true, causes: 'invariant:negativeStock' });
});

it('announces full recovery once and distinguishes simultaneous storage/audit causes', () => {
  const transitions = new IntegrityTransitions();
  expect(transitions.update('axon_audit_integrity_valid 0\naxon_storage_metadata_mismatches 1\n')).toEqual({ changed: true, failed: true, causes: 'auditIntegrity,storageMetadata' });
  expect(transitions.update(stock(0) + 'axon_audit_integrity_valid 1\n')).toEqual({ changed: true, failed: false, causes: '' });
  expect(transitions.update(stock(0))).toEqual({ changed: false, failed: false, causes: '' });
});
