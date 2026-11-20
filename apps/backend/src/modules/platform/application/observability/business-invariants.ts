import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
export const invariantCountsSchema = z.object({
  negativeStock: z.number().int().nonnegative(), invalidPaymentBalances: z.number().int().nonnegative(),
  nonpositiveAllocations: z.number().int().nonnegative(), foreignInvoiceLines: z.number().int().nonnegative(),
  foreignAllocations: z.number().int().nonnegative(), duplicatePayments: z.number().int().nonnegative(),
  duplicateStockEffects: z.number().int().nonnegative(), duplicateJournalEffects: z.number().int().nonnegative(),
  unbalancedJournals: z.number().int().nonnegative(), invalidStorageAccounting: z.number().int().nonnegative(),
});
/** Independent aggregate checks. No writes, payloads, SQL text or identifiers are exported. */
export async function checkBusinessInvariants(db: Pick<PrismaClient, '$queryRaw'>) {
  const result: unknown = await db.$queryRaw`
    SELECT
      (SELECT count(*)::int FROM stock_levels WHERE quantity<0) AS "negativeStock",
      (SELECT count(*)::int FROM invoices i LEFT JOIN
        (SELECT "invoiceId", sum(amount) AS amount FROM payment_allocations GROUP BY "invoiceId") a
        ON a."invoiceId"=i.id WHERE coalesce(a.amount,0)>i."totalGross") AS "invalidPaymentBalances",
      (SELECT count(*)::int FROM payment_allocations WHERE amount<=0) AS "nonpositiveAllocations",
      (SELECT count(*)::int FROM invoice_lines l JOIN invoices i ON i.id=l."invoiceId" LEFT JOIN products p ON p.id=l."productId" WHERE l."tenantId"<>i."tenantId" OR p."tenantId"<>l."tenantId") AS "foreignInvoiceLines",
      (SELECT count(*)::int FROM payment_allocations a JOIN payments p ON p.id=a."paymentId" JOIN invoices i ON i.id=a."invoiceId" WHERE a."tenantId"<>p."tenantId" OR a."tenantId"<>i."tenantId") AS "foreignAllocations",
      (SELECT count(*)::int FROM (SELECT "tenantId","idempotencyKey" FROM payments WHERE "idempotencyKey" IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) d) AS "duplicatePayments",
      (SELECT count(*)::int FROM (SELECT "tenantId","idempotencyKey" FROM stock_movements WHERE "idempotencyKey" IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) d) AS "duplicateStockEffects",
      (SELECT count(*)::int FROM (SELECT "tenantId","refType","refId" FROM journal_entries WHERE "refId" IS NOT NULL GROUP BY 1,2,3 HAVING count(*)>1) d) AS "duplicateJournalEffects",
      (SELECT count(*)::int FROM (SELECT "journalEntryId" FROM journal_entry_lines GROUP BY 1 HAVING sum(debit)<>sum(credit)) j) AS "unbalancedJournals",
      (SELECT count(*)::int FROM tenant_storage_usage u LEFT JOIN
        (SELECT "tenantId", sum("expectedBytes") AS bytes FROM storage_reservations
          WHERE status IN ('RESERVED','UPLOADED','SCANNING') GROUP BY "tenantId") r
        ON r."tenantId"=u."tenantId"
        WHERE u."usedBytes"<0 OR u."reservedBytes"<0 OR u."reservedBytes"<>coalesce(r.bytes,0)) AS "invalidStorageAccounting"
  `;
  const counts = z.array(invariantCountsSchema).length(1).parse(result)[0];
  return { passed: Object.values(counts).every(value => value === 0), counts };
}
