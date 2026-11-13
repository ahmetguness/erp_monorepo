import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { db } from './database.js';
import { create, request } from './http.js';
import type { TenantFixture } from './fixtures.js';

export async function stock(tenant: TenantFixture): Promise<Prisma.Decimal> {
  const sum = await db.stockLevel.aggregate({ where: { tenantId: tenant.tenant.id, productId: tenant.product.id, warehouseId: tenant.warehouse.id }, _sum: { quantity: true } });
  return sum._sum.quantity ?? new Prisma.Decimal(0);
}

export async function addStock(tenant: TenantFixture, quantity: number): Promise<void> {
  await create('/api/stock/movements', tenant.identity, {
    idempotencyKey: randomUUID(), productId: tenant.product.id, warehouseId: tenant.warehouse.id, type: 'IN', quantity, unitCost: 40,
  });
}

export async function assertBalancedJournal(tenantId: string, refId: string): Promise<void> {
  const entries = await db.journalEntry.findMany({ where: { tenantId, refId }, include: { lines: true } });
  expect(entries.length).toBeGreaterThan(0);
  for (const entry of entries) {
    const debit = entry.lines.reduce((total, line) => total.plus(line.debit), new Prisma.Decimal(0));
    const credit = entry.lines.reduce((total, line) => total.plus(line.credit), new Prisma.Decimal(0));
    expect(debit.equals(credit)).toBe(true);
    expect(debit.greaterThan(0)).toBe(true);
  }
}

export async function assertTenantBoundary(owner: TenantFixture, foreign: TenantFixture, path: string): Promise<void> {
  expect((await request('GET', path, foreign.identity)).status).toBe(404);
  expect((await request('GET', path, owner.identity)).status).toBe(200);
}
