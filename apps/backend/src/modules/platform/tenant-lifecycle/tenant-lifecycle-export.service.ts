import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { TenantLifecycleError } from './tenant-lifecycle.policy.js';

// A portable business-data export, not a full database/attachment backup.
const BUSINESS_MODELS = new Set(['Contact', 'Product', 'Warehouse', 'Invoice', 'InvoiceItem', 'SalesOrder', 'SalesOrderItem', 'PurchaseOrder', 'PurchaseOrderItem', 'Payment', 'JournalEntry', 'JournalEntryLine', 'StockMovement', 'StockLevel']);
function identifier(value: string): Prisma.Sql {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error('Invalid schema identifier');
  return Prisma.raw(`"${value}"`);
}

export async function createLifecycleExport(tenantId: string, adminId: string) {
  return prisma.$transaction(async tx => {
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new TenantLifecycleError('Tenant bulunamadı.', 404);
    const tables: Record<string, Prisma.InputJsonValue> = {};
    for (const model of Prisma.dmmf.datamodel.models.filter(item => BUSINESS_MODELS.has(item.name))) {
      if (!model.fields.some(field => field.name === 'tenantId')) continue;
      const fields = model.fields.filter(field => ['scalar', 'enum'].includes(field.kind) && !['Json', 'Bytes'].includes(field.type) && !/secret|token|password|credential/i.test(field.name));
      const columns = Prisma.join(fields.map(field => identifier(field.dbName ?? field.name)));
      const rows = await tx.$queryRaw<Array<{ row: Prisma.InputJsonObject }>>(Prisma.sql`
        SELECT row_to_json(t) AS row FROM (
          SELECT ${columns} FROM ${identifier(model.dbName ?? model.name)} WHERE "tenantId" = ${tenantId} ORDER BY "id" LIMIT 1001
        ) t`);
      if (rows.length > 1000) throw new TenantLifecycleError('Export sınırı aşıldı. Bu tenant için operasyonel tam yedek/export süreci gerekli.', 400);
      tables[model.name] = rows.map(row => row.row);
    }
    const data: Prisma.InputJsonObject = {
      tenant: { id: tenant.id, companyName: tenant.companyName, status: tenant.status },
      generatedAt: new Date().toISOString(), version: tenant.lifecycleVersion,
      scope: 'Business tables only; attachments, JSON fields, credentials and platform settings excluded. Separate full backup confirmation required.',
      tables,
    };
    const serialized = JSON.stringify(data);
    if (Buffer.byteLength(serialized) > 25 * 1024 * 1024) throw new TenantLifecycleError('Export 25 MB sınırını aşıyor.', 400);
    const digest = createHash('sha256').update(serialized).digest('hex');
    const exported = await tx.tenantLifecycleExport.create({ data: { tenantId, version: tenant.lifecycleVersion, createdById: adminId, digest, data } });
    await tx.auditLog.create({ data: { tenantId, adminId, module: 'TENANT_LIFECYCLE', entityType: 'OTHER', entityId: exported.id, action: 'EXPORT', reason: 'Yaşam döngüsü iş verisi export', newValues: { digest, version: tenant.lifecycleVersion } } });
    return { id: exported.id, digest, data };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000 });
}
