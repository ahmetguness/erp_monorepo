import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

function digest(value: unknown): string {
  return createHash("sha256")
    .update(
      JSON.stringify(value, (_, field: unknown) =>
        typeof field === "bigint" ? field.toString() : field,
      ),
    )
    .digest("hex");
}
// Run against the disposable verification client only. Never emit business rows.
export async function databaseFingerprint(db: PrismaClient) {
  const [columns, constraints, migrations] = await Promise.all([
    db.$queryRaw<
      unknown[]
    >`SELECT c.relname,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,
    db.$queryRaw<
      unknown[]
    >`SELECT c.relname,k.conname,pg_get_constraintdef(k.oid) FROM pg_constraint k
      JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' ORDER BY c.relname,k.conname`,
    db.$queryRaw<
      Array<{
        migration_name: string;
        checksum: string;
        finished_at: Date | null;
        rolled_back_at: Date | null;
      }>
    >`
      SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY migration_name`,
  ]);
  if (
    !migrations.length ||
    migrations.some((row) => !row.finished_at || row.rolled_back_at)
  )
    throw new Error("Incomplete or rolled-back migration history.");
  const groups = {
    tenants: await db.tenant.findMany({ orderBy: { id: "asc" } }),
    contacts: await db.contact.findMany({ orderBy: { id: "asc" } }),
    products: await db.product.findMany({ orderBy: { id: "asc" } }),
    warehouses: await db.warehouse.findMany({ orderBy: { id: "asc" } }),
    stock: await db.stockLevel.findMany({ orderBy: { id: "asc" } }),
    stockMovements: await db.stockMovement.findMany({ orderBy: { id: "asc" } }),
    orders: await db.salesOrder.findMany({ orderBy: { id: "asc" } }),
    invoices: await db.invoice.findMany({ orderBy: { id: "asc" } }),
    payments: await db.payment.findMany({ orderBy: { id: "asc" } }),
    allocations: await db.paymentAllocation.findMany({
      orderBy: { id: "asc" },
    }),
    accountEntries: await db.accountEntry.findMany({ orderBy: { id: "asc" } }),
    journals: await db.journalEntry.findMany({ orderBy: { id: "asc" } }),
    journalLines: await db.journalEntryLine.findMany({
      orderBy: { id: "asc" },
    }),
    outbox: await db.domainEventOutbox.findMany({ orderBy: { id: "asc" } }),
    reservations: await db.storageReservation.findMany({
      orderBy: { id: "asc" },
    }),
    attachments: await db.attachment.findMany({ orderBy: { id: "asc" } }),
    usage: await db.tenantStorageUsage.findMany({
      orderBy: { tenantId: "asc" },
    }),
  };
  return {
    schemaHash: digest({ columns, constraints }),
    migrations: { count: migrations.length, hash: digest(migrations) },
    groups: Object.fromEntries(
      Object.entries(groups).map(([name, rows]) => [
        name,
        { count: rows.length, hash: digest(rows) },
      ]),
    ),
  };
}
