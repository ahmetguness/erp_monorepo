import { describe, expect, it } from 'vitest';
import { resolveCandidate } from '../../src/modules/platform/application/adaptive-defaults/adaptive-defaults.resolver.js';

describe('resolveCandidate', () => {
  it('üç örnekten az davranışı öğrenilmiş tercih saymaz', () => {
    expect(resolveCandidate('paymentTermDays', 'user', [{ value: '30', count: 2 }])).toBeNull();
  });

  it('baskın davranışı güven skoru ile otomatik uygulanabilir öneriye çevirir', () => {
    const suggestion = resolveCandidate('paymentTermDays', 'contact', [
      { value: '30', count: 8 },
      { value: '15', count: 2 },
    ]);
    expect(suggestion).toMatchObject({ value: '30', confidence: 0.8, sampleSize: 10, source: 'contact', autoApplicable: true });
  });

  it('kararsız örüntüyü gösterir fakat otomatik uygulamaz', () => {
    const suggestion = resolveCandidate('taxRateId', 'tenant', [
      { value: 'tax-20', count: 2 },
      { value: 'tax-10', count: 1 },
    ]);
    expect(suggestion).toMatchObject({ value: 'tax-20', confidence: 0.67, autoApplicable: false });
  });

  it('kesin politikayı öğrenilmiş davranış gibi otomatik uygulamaz', () => {
    const suggestion = resolveCandidate('paymentTermDays', 'policy', [{ value: '30', count: 1 }]);
    expect(suggestion).toMatchObject({ source: 'policy', confidence: 1, autoApplicable: false });
  });
});
