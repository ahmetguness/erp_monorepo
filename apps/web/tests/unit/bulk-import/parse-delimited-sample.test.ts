import { describe, expect, it } from 'vitest';
import { parseDelimitedSample } from '../../../src/domain/bulk-import/parse-delimited-sample';

describe('parseDelimitedSample', () => {
  it('preserves delimiters and escaped quotes inside quoted cells', () => {
    const parsed = parseDelimitedSample('Ad,Açıklama\nAcme,"Parça, büyük ""seri"""');
    expect(parsed.headers).toEqual(['Ad', 'Açıklama']);
    expect(parsed.rows[0]).toEqual({ Ad: 'Acme', Açıklama: 'Parça, büyük "seri"' });
  });

  it('detects semicolon files and limits preview to 100 rows', () => {
    const rows = Array.from({ length: 105 }, (_, index) => `P-${index};${index}`).join('\n');
    const parsed = parseDelimitedSample(`Kod;Tutar\n${rows}`);
    expect(parsed.rows).toHaveLength(100);
    expect(parsed.rows[0]).toEqual({ Kod: 'P-0', Tutar: '0' });
  });
});
