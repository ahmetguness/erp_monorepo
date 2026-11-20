import { invariantCountsSchema } from './business-invariants.js';

const invariantNames = new Set(Object.keys(invariantCountsSchema.shape));

/** Coalesce repeated readings, never coalesce different critical failure causes. */
export class IntegrityTransitions {
  private signature = '';

  update(snapshot: string): { changed: boolean; failed: boolean; causes: string } {
    const causes = new Set<string>();
    for (const match of snapshot.matchAll(/^axon_business_invariant_violations\{invariant="([a-zA-Z]+)"\} [1-9][0-9]*$/gm)) {
      if (invariantNames.has(match[1])) causes.add('invariant:' + match[1]);
    }
    if (/^axon_audit_integrity_valid 0$/m.test(snapshot)) causes.add('auditIntegrity');
    if (/^axon_storage_metadata_mismatches [1-9][0-9]*$/m.test(snapshot)) causes.add('storageMetadata');
    const signature = [...causes].sort().join(',');
    const changed = signature !== this.signature;
    this.signature = signature;
    return { changed, failed: causes.size > 0, causes: signature };
  }
}
