import { describe, expect, it } from 'vitest';
import type { UnifiedPermissionContext } from '../../src/modules/platform/application/unified-command/unified-command.ports.js';
import { getIntentHandoff, resolveUnifiedIntent } from '../../src/modules/platform/application/unified-command/unified-intent-resolver.js';

function permissions(allowed: ReadonlySet<string>): UnifiedPermissionContext {
  return {
    can(action, module) {
      return allowed.has(`${action}:${module}`);
    },
  };
}

describe('unified intent resolver', () => {
  it('previews a write intent with explicit confirmation', () => {
    const context = permissions(new Set(['CREATE:invoicing']));
    const intent = resolveUnifiedIntent('ABC cari için yeni teklif oluştur', context);

    expect(intent?.id).toBe('CREATE_SALES_QUOTE');
    expect(intent?.requiresConfirmation).toBe(true);
    expect(intent?.risk).toBe('MEDIUM');
  });

  it('does not expose an intent without permission', () => {
    const context = permissions(new Set());
    expect(resolveUnifiedIntent('ödeme oluştur', context)).toBeNull();
    expect(getIntentHandoff('CREATE_PAYMENT', 'ödeme oluştur', context)).toBeNull();
  });

  it('creates only a contextual handoff and never executes a mutation', () => {
    const context = permissions(new Set(['CREATE:attachments']));
    const href = getIntentHandoff('IMPORT_DOCUMENT', "bu PDF'den fatura taslağı oluştur", context);
    expect(href).toContain('/dashboard/documents?intent=extract-draft&command=');
  });
});
