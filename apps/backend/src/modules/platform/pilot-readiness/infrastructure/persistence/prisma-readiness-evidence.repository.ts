import { Prisma } from '@prisma/client';
import { prisma } from '../../../../../lib/prisma.js';
import type {
  DatabaseIntegrityEvidence,
  ReadinessEvidenceRepository,
} from '../../application/ports/readiness-evidence.repository.js';

interface CountRow {
  count: bigint;
}

function countOf(rows: readonly CountRow[]): number {
  return Number(rows[0]?.count ?? 0n);
}

export class PrismaReadinessEvidenceRepository implements ReadinessEvidenceRepository {
  async getDatabaseIntegrityEvidence(tenantId: string): Promise<DatabaseIntegrityEvidence> {
    const [negativeStockRows, crossTenantStockRows, crossTenantInvoiceRows] = await prisma.$transaction([
      prisma.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "count"
        FROM "stock_levels" sl
        WHERE sl."tenantId" = ${tenantId} AND sl."quantity" < 0
      `),
      prisma.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "count"
        FROM "stock_levels" sl
        INNER JOIN "products" p ON p."id" = sl."productId"
        INNER JOIN "warehouses" w ON w."id" = sl."warehouseId"
        WHERE sl."tenantId" = ${tenantId}
          AND (p."tenantId" <> sl."tenantId" OR w."tenantId" <> sl."tenantId")
      `),
      prisma.$queryRaw<CountRow[]>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "count"
        FROM "invoices" i
        INNER JOIN "contacts" c ON c."id" = i."contactId"
        WHERE i."tenantId" = ${tenantId} AND c."tenantId" <> i."tenantId"
      `),
    ]);

    return {
      negativeStockLevelCount: countOf(negativeStockRows),
      crossTenantStockLevelCount: countOf(crossTenantStockRows),
      crossTenantInvoiceCount: countOf(crossTenantInvoiceRows),
    };
  }
}
