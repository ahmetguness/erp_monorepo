import { Prisma } from '@prisma/client';
import { z } from 'zod';

export const documentCurrencySchema = z.object({
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('TRY'),
  exchangeRate: z.number().finite().positive().max(999999).refine((rate) => new Prisma.Decimal(rate).decimalPlaces() <= 6).optional(),
}).superRefine((value, context) => {
  if (value.currencyCode === 'TRY' && (value.exchangeRate ?? 1) !== 1) {
    context.addIssue({ code: 'custom', path: ['exchangeRate'], message: 'TRY exchange rate must be 1.' });
  }
  if (value.currencyCode !== 'TRY' && value.exchangeRate === undefined) context.addIssue({ code: 'custom', path: ['exchangeRate'], message: 'Foreign currency requires an explicit rate.' });
}).transform((value) => ({ ...value, exchangeRate: value.exchangeRate ?? 1 }));

/** Rates are immutable document snapshots, expressed as TRY per document currency unit. */
export function toBaseMoney(amount: Prisma.Decimal.Value, exchangeRate: Prisma.Decimal.Value): Prisma.Decimal {
  return new Prisma.Decimal(amount).mul(exchangeRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
