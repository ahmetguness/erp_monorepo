import { describe, expect, it } from 'vitest';
import { normalizeDocumentQuantity } from '../../src/features/sales';

describe('normalizeDocumentQuantity', () => {
  it('formats numbers and serialized decimal values safely', () => {
    expect(normalizeDocumentQuantity(2)).toBe('2');
    expect(normalizeDocumentQuantity(2.5)).toBe('2.5');
    expect(normalizeDocumentQuantity('12.345')).toBe('12.345');
    expect(normalizeDocumentQuantity('1,25')).toBe('1.25');
  });

  it('does not throw for invalid numeric strings', () => {
    expect(normalizeDocumentQuantity('')).toBe('-');
    expect(normalizeDocumentQuantity('invalid')).toBe('-');
  });
});
