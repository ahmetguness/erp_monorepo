import { expect, test } from 'vitest';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { create, request } from '../support/http.js';
import { startProviderServer } from '../support/provider-server.js';
import { addStock, stock } from '../support/invariants.js';
import { signedWebhook } from '../support/marketplace.js';

isolatedDatabase();

test('D: listing publish survives real socket failures and recovers into SKU/order fulfillment without duplicate stock effects', async () => {
  const provider = await startProviderServer();
  try {
    const { a, b } = await fixture();
    await addStock(a, 5);
    const integration = await db.marketplaceIntegration.create({ data: { tenantId: a.tenant.id, name: 'Protocol provider',
      channel: 'TRENDYOL', storeId: '12345', apiKey: 'test-key', apiSecret: 'test-secret' } });
    const listingId = await create('/api/marketplace/listings', a.identity, { integrationId: integration.id, productId: a.product.id,
      externalId: 'PROVIDER-SKU', price: 100, stock: 5 });
    const path = `/api/marketplace/listings/${listingId}/publish`;
    const product = { brandId: 1, categoryId: 1, cargoCompanyId: 1, barcode: 'PROVIDER-SKU', stockCode: a.product.code, quantity: 5, salePrice: 100 };
    expect((await request('POST', path, b.identity, product)).status).toBe(404);
    expect(provider.attempts()).toBe(0);
    provider.disconnect();
    expect((await request('POST', path, a.identity, product)).status).toBe(502);
    expect(provider.attempts()).toBe(4);
    const failed = await db.marketplaceListing.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: listingId } });
    expect(failed.syncError).not.toBeNull();
    expect(failed.lastSyncAt).toBeNull();
    expect((await stock(a)).toString()).toBe('5');
    provider.reconnect();
    expect((await request('POST', path, a.identity, product)).status).toBe(202);
    expect(provider.products).toEqual([{ barcode: 'PROVIDER-SKU', stockCode: a.product.code, quantity: 5 }]);
    const published = await db.marketplaceListing.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: listingId } });
    expect(published.syncError).toBeNull();
    expect(published.lastSyncAt).not.toBeNull();
    const body = { shipmentPackageId: 'provider-package', status: 'Created', orderDate: Date.now(), customerFirstName: 'Provider customer',
      packageTotalPrice: 120, lines: [{ contentId: 'PROVIDER-SKU', productName: a.product.name, quantity: 1, lineUnitPrice: 100 }] };
    expect((await signedWebhook(integration.id, 'test-secret', body)).failed).toBe(0);
    expect((await signedWebhook(integration.id, 'test-secret', { ...body, status: 'Delivered' })).failed).toBe(0);
    expect((await signedWebhook(integration.id, 'test-secret', { ...body, status: 'Delivered' })).duplicate).toBe(1);
    expect((await stock(a)).toString()).toBe('4');
    expect(await db.salesOrder.count({ where: { tenantId: a.tenant.id } })).toBe(1);
    expect(await db.deliveryNote.count({ where: { tenantId: a.tenant.id } })).toBe(1);
  } finally { await provider.close(); }
}, 30_000);
