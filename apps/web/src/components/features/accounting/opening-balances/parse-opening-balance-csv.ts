import { z } from 'zod';
import { parseDelimitedSample, type DelimitedRow } from '@/domain/bulk-import/parse-delimited-sample';
import type { OpeningBalanceInput } from '@/services/opening-balance.service';
import { OpeningBalanceInputSchema } from '@/services/opening-balance.service';

const text = (row: DelimitedRow, key: string): string => String(row[key] ?? '').trim();
const number = (row: DelimitedRow, key: string): number => Number(text(row, key).replace(',', '.'));
const optional = (value: string): string | undefined => value || undefined;

const finiteRow = z.object({ debit: z.number().finite().min(0), credit: z.number().finite().min(0) });

export function buildOpeningBalanceInput(values: {
  openingDate: string; reference: string; contactsCsv: string; banksCsv: string; ledgerCsv: string;
}): OpeningBalanceInput {
  const contacts = parseDelimitedSample(values.contactsCsv, 10_000).rows.map((row) => ({ contactCode: text(row, 'contactCode'), debit: number(row, 'debit'), credit: number(row, 'credit'), description: optional(text(row, 'description')) }));
  const banks = parseDelimitedSample(values.banksCsv, 1_000).rows.map((row) => ({ bankAccountId: text(row, 'bankAccountId'), balance: number(row, 'balance'), description: optional(text(row, 'description')) }));
  const ledger = parseDelimitedSample(values.ledgerCsv, 10_000).rows.map((row) => ({ accountCode: text(row, 'accountCode'), debit: number(row, 'debit'), credit: number(row, 'credit'), description: optional(text(row, 'description')) }));
  contacts.forEach((row) => finiteRow.parse(row));
  ledger.forEach((row) => finiteRow.parse(row));
  banks.forEach((row) => z.number().finite().parse(row.balance));
  return OpeningBalanceInputSchema.parse({ openingDate: values.openingDate, reference: values.reference, contacts, banks, ledger });
}
