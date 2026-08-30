import { describe, expect, it } from 'vitest';
import { resolveContextualFormPolicy } from '../../src/modules/platform/application/contextual-forms/contextual-form.policy.js';

describe('contextual form policy', () => {
  it('fatura için temel ve ileri alanları birbirinden ayırır', () => {
    const policy = resolveContextualFormPolicy('invoice', 'PURCHASE');
    expect(policy.context).toBe('PURCHASE');
    expect(policy.sections.filter((section) => section.level === 'essential').flatMap((section) => section.fields)).toContain('lines.taxRateId');
    expect(policy.sections.filter((section) => section.level === 'advanced').flatMap((section) => section.fields)).toContain('lines.withholdingRateId');
    expect(policy.allowLineDuplication).toBe(true);
  });

  it('bilinmeyen işlem bağlamını güvenli varsayılana indirger', () => {
    expect(resolveContextualFormPolicy('invoice', 'UNKNOWN').context).toBe('DEFAULT');
  });

  it('cari ve ürün politikalarında sadece kendi alanlarını yayınlar', () => {
    expect(resolveContextualFormPolicy('contact', undefined).formKind).toBe('contact');
    expect(resolveContextualFormPolicy('product', undefined).formKind).toBe('product');
  });
});
