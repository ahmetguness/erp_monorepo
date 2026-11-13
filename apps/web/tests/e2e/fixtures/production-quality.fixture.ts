import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type { Page } from '@playwright/test';
import { z } from 'zod';
import { tenantSession } from './tenant-session';

type Scenario = Awaited<ReturnType<typeof tenantSession>> & { db: PrismaClient; id: string; productId: string };

export async function withProductionQuality(page: Page, verify: (scenario: Scenario) => Promise<void>): Promise<void> {
  const session = await tenantSession(page);
  const { api, tenantId } = session;
  const db = new PrismaClient();
  const marker = `QUALITY_${randomUUID()}`;
  let productId: string | undefined;
  let warehouseId: string | undefined;
  let id: string | undefined;
  try {
    const units = await api.send('GET', '/api/master/units', z.array(z.object({ id: z.string() })));
    if (!units[0]) throw new Error('Seed unit is missing.');
    productId = await api.create('/api/products', { code: marker, name: marker, unitId: units[0].id });
    warehouseId = await api.create('/api/warehouses', { code: marker, name: marker });
    id = await api.create('/api/production/work-orders', { productId, plannedQty: 2, outputWarehouseId: warehouseId, qualityRequired: true });
    await api.send('POST', `/api/production/work-orders/${id}/status`, z.unknown(), { status: 'IN_PROGRESS' });
    await api.send('POST', `/api/production/work-orders/${id}/report`, z.unknown(), { producedQty: 2 });
    await verify({ ...session, db, id, productId });
  } finally {
    if (id) {
      await db.journalEntryLine.deleteMany({ where: { tenantId, journalEntry: { tenantId, refId: id } } });
      await db.journalEntry.deleteMany({ where: { tenantId, refId: id } });
      await db.workOrderHistory.deleteMany({ where: { tenantId, workOrderId: id } });
      await db.workOrder.deleteMany({ where: { tenantId, id } });
    }
    if (productId) {
      await db.stockValuation.deleteMany({ where: { tenantId, productId } });
      await db.stockMovement.deleteMany({ where: { tenantId, productId } });
      await db.stockLevel.deleteMany({ where: { tenantId, productId } });
      await db.product.deleteMany({ where: { tenantId, id: productId, name: marker } });
    }
    if (warehouseId) {
      await db.location.deleteMany({ where: { tenantId, warehouseId } });
      await db.warehouse.deleteMany({ where: { tenantId, id: warehouseId, name: marker } });
    }
    await db.$disconnect();
  }
}
