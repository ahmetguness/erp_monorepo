import { expect, test } from 'vitest';
import { z } from 'zod';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { create, data, request } from '../support/http.js';
import { addStock, assertTenantBoundary, stock } from '../support/invariants.js';

isolatedDatabase();

test('E: customer asset → technician → parts → completion creates one invoice and consumes stock once', async () => {
  const { a, b } = await fixture();
  await addStock(a, 8);
  const assetId = await create('/api/service/assets', a.identity, { contactId: a.contact.id, name: 'Customer equipment' });
  const id = await create('/api/service/requests', a.identity, { contactId: a.contact.id, customerAssetId: assetId, subject: 'Repair' });
  expect((await request('POST', `/api/service/requests/${id}/automation/assign`, a.identity, { technicianId: a.owner.id })).status).toBe(200);
  await create(`/api/service/requests/${id}/items`, a.identity, { productId: a.product.id, description: 'Replacement parts', quantity: 2, unitPrice: 100 });
  const reserve = () => request('POST', `/api/service/requests/${id}/automation/reserve-parts`, a.identity, { warehouseId: a.warehouse.id });
  expect((await reserve()).status).toBe(200);
  expect((await reserve()).status).toBe(200);
  expect(await db.inventoryReservation.count({ where: { tenantId: a.tenant.id, refId: id, releasedAt: null } })).toBe(1);
  const complete = () => request('POST', `/api/service/requests/${id}/automation/complete-invoice`, a.identity, { warehouseId: a.warehouse.id });
  const results = await Promise.all([complete(), complete()]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  const success = results.find((result) => result.status === 200);
  if (!success) throw new Error('Completion did not succeed.');
  const { invoiceId } = data(success, 200, z.object({ invoiceId: z.string() }));
  const invoice = await db.invoice.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: invoiceId }, include: { lines: true } });
  expect(invoice.totalGross.toString()).toBe('240');
  expect(invoice.lines).toHaveLength(1);
  const movement = await db.stockMovement.findFirstOrThrow({ where: { tenantId: a.tenant.id, refId: id, type: 'OUT' } });
  expect(movement.totalCost?.toString()).toBe('80');
  expect((await stock(a)).toString()).toBe('6');
  expect(await db.inventoryReservation.count({ where: { tenantId: a.tenant.id, refId: id, releasedAt: null } })).toBe(0);
  expect(await db.invoice.count({ where: { tenantId: a.tenant.id } })).toBe(1);
  await assertTenantBoundary(a, b, `/api/service/requests/${id}`);
});

test('E: insufficient or missing warehouse rolls back completion and reservation effects', async () => {
  const { a } = await fixture();
  await addStock(a, 1);
  const id = await create('/api/service/requests', a.identity, { contactId: a.contact.id, subject: 'Insufficient parts' });
  await create(`/api/service/requests/${id}/items`, a.identity, { productId: a.product.id, description: 'Parts', quantity: 2, unitPrice: 100 });
  expect((await request('POST', `/api/service/requests/${id}/automation/complete-invoice`, a.identity, {})).status).toBe(400);
  expect((await request('POST', `/api/service/requests/${id}/automation/complete-invoice`, a.identity, { warehouseId: a.warehouse.id })).status).toBe(400);
  expect((await stock(a)).toString()).toBe('1');
  expect((await db.serviceRequest.findFirstOrThrow({ where: { tenantId: a.tenant.id, id } })).status).toBe('OPEN');
  expect(await db.invoice.count({ where: { tenantId: a.tenant.id } })).toBe(0);
  expect(await db.stockMovement.count({ where: { tenantId: a.tenant.id, refId: id } })).toBe(0);
});

test('E: foreign warehouse completion rolls back service state, invoice and stock', async () => {
  const { a, b, limited } = await fixture();
  await addStock(a, 2);
  const id = await create('/api/service/requests', a.identity, { contactId: a.contact.id, subject: 'Reject foreign warehouse' });
  await create(`/api/service/requests/${id}/items`, a.identity, { productId: a.product.id, description: 'Part', quantity: 1, unitPrice: 100 });
  expect((await request('POST', `/api/service/requests/${id}/automation/complete-invoice`, limited, { warehouseId: a.warehouse.id })).status).toBe(403);
  expect((await request('POST', `/api/service/requests/${id}/automation/complete-invoice`, a.identity, { warehouseId: b.warehouse.id })).status).toBe(404);
  expect((await db.serviceRequest.findFirstOrThrow({ where: { tenantId: a.tenant.id, id } })).status).toBe('OPEN');
  expect(await db.invoice.count({ where: { tenantId: a.tenant.id } })).toBe(0);
  expect((await stock(a)).toString()).toBe('2');
});
