import { describe, expect, it } from 'vitest';
import { buildOpeningBalanceInput } from '@/components/features/accounting/opening-balances/parse-opening-balance-csv';

describe('buildOpeningBalanceInput', () => {
  it('cari, banka ve muhasebe CSV alanlarını type-safe payloada dönüştürür', () => {
    const result = buildOpeningBalanceInput({
      openingDate: '2026-01-01', reference: 'DEVIR-2026',
      contactsCsv: 'contactCode;debit;credit\nCAR-1;1250,50;0',
      banksCsv: 'bankAccountId;balance\nBANK-1;-200',
      ledgerCsv: 'accountCode;debit;credit\n100;1250,50;0\n500;0;1250,50',
    });
    expect(result.contacts[0]).toMatchObject({ contactCode: 'CAR-1', debit: 1250.5, credit: 0 });
    expect(result.banks[0]?.balance).toBe(-200);
    expect(result.ledger).toHaveLength(2);
  });

  it('sayısal olmayan tutarı reddeder', () => {
    expect(() => buildOpeningBalanceInput({
      openingDate: '2026-01-01', reference: 'DEVIR',
      contactsCsv: 'contactCode,debit,credit\nCAR-1,bozuk,0',
      banksCsv: 'bankAccountId,balance',
      ledgerCsv: 'accountCode,debit,credit\n100,1,0\n500,0,1',
    })).toThrow();
  });
});
