import type { PrismaClient } from '@prisma/client';

export async function checkInvariants(db: PrismaClient) {
  const [counts] = await db.$queryRaw<Array<Record<string, number>>>`
    SELECT
      (SELECT count(*)::int FROM stock_levels WHERE quantity<0) AS "negativeStock",
      (SELECT count(*)::int FROM invoices i WHERE (SELECT coalesce(sum(a.amount),0) FROM payment_allocations a WHERE a."invoiceId"=i.id)>i."totalGross") AS "invalidPaymentBalances",
      (SELECT count(*)::int FROM payment_allocations WHERE amount<=0) AS "nonpositiveAllocations",
      (SELECT count(*)::int FROM invoice_lines l JOIN invoices i ON i.id=l."invoiceId" LEFT JOIN products p ON p.id=l."productId" WHERE l."tenantId"<>i."tenantId" OR p."tenantId"<>l."tenantId") AS "foreignInvoiceLines",
      (SELECT count(*)::int FROM payment_allocations a JOIN payments p ON p.id=a."paymentId" JOIN invoices i ON i.id=a."invoiceId" WHERE a."tenantId"<>p."tenantId" OR a."tenantId"<>i."tenantId") AS "foreignAllocations",
      (SELECT count(*)::int FROM (SELECT "tenantId","idempotencyKey" FROM payments WHERE "idempotencyKey" IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) d) AS "duplicatePayments",
      (SELECT count(*)::int FROM (SELECT "tenantId","idempotencyKey" FROM stock_movements WHERE "idempotencyKey" IS NOT NULL GROUP BY 1,2 HAVING count(*)>1) d) AS "duplicateStockEffects",
      (SELECT count(*)::int FROM (SELECT "tenantId","refType","refId" FROM journal_entries WHERE "refId" IS NOT NULL GROUP BY 1,2,3 HAVING count(*)>1) d) AS "duplicateJournalEffects",
      (SELECT count(*)::int FROM (SELECT "journalEntryId" FROM journal_entry_lines GROUP BY 1 HAVING sum(debit)<>sum(credit)) j) AS "unbalancedJournals",
      (SELECT count(*)::int FROM tenant_storage_usage u WHERE "usedBytes"<0 OR "reservedBytes"<0 OR "reservedBytes"<>(SELECT coalesce(sum("expectedBytes"),0) FROM storage_reservations r WHERE r."tenantId"=u."tenantId" AND r.status IN ('RESERVED','UPLOADED','SCANNING'))) AS "invalidStorageAccounting"
  `;
  return { passed: !!counts && Object.values(counts).every((value) => value === 0), counts };
}
