import { z } from "zod";

const money = z.number().finite().min(0).max(999_999_999_999);
const description = z.string().trim().max(500).optional();

export const openingBalanceInputSchema = z
  .object({
    openingDate: z.iso.date(),
    reference: z.string().trim().min(1).max(100),
    contacts: z
      .array(
        z.object({
          contactCode: z.string().trim().min(1).max(100),
          debit: money,
          credit: money,
          description,
        }),
      )
      .max(10_000),
    banks: z
      .array(
        z.object({
          bankAccountId: z.string().trim().min(1),
          balance: z
            .number()
            .finite()
            .min(-999_999_999_999)
            .max(999_999_999_999),
          description,
        }),
      )
      .max(1_000),
    ledger: z
      .array(
        z.object({
          accountCode: z.string().trim().min(1).max(100),
          debit: money,
          credit: money,
          description,
        }),
      )
      .min(2)
      .max(10_000),
  })
  .strict();
