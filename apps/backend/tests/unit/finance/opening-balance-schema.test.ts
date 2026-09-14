import { describe, expect, it } from 'vitest';
import { openingBalanceInputSchema } from '../../../src/modules/finance/application/opening-balances/index.js';

describe('openingBalanceInputSchema', () => {
  const valid = {
    openingDate: '2026-01-01', reference: 'DEVIR', contacts: [], banks: [],
    ledger: [{ accountCode: '100', debit: 10, credit: 0 }, { accountCode: '500', debit: 0, credit: 10 }],
  };

  it('geçerli açılış paketini kabul eder', () => {
    expect(openingBalanceInputSchema.safeParse(valid).success).toBe(true);
  });

  it('geçersiz tarih ve negatif borç tutarını reddeder', () => {
    expect(openingBalanceInputSchema.safeParse({ ...valid, openingDate: '01.01.2026' }).success).toBe(false);
    expect(openingBalanceInputSchema.safeParse({ ...valid, ledger: [{ accountCode: '100', debit: -1, credit: 0 }, valid.ledger[1]] }).success).toBe(false);
  });
});
