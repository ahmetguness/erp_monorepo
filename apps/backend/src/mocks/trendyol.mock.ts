/**
 * Trendyol API Mock Server
 *
 * Gerçek Trendyol API'sini taklit eder.
 * TRENDYOL_MOCK=true env var set edilince trendyol.service.ts
 * bu mock'a istek atar (apigw.trendyol.com yerine localhost:3099).
 *
 * Başlatmak için:
 *   TRENDYOL_MOCK=true npm run dev
 *
 * Mock'un desteklediği endpoint'ler:
 *   GET  /integration/sellers/:sellerId/addresses
 *   GET  /integration/order/sellers/:sellerId/orders
 *   POST /integration/inventory/sellers/:sellerId/products/price-and-inventory
 *   GET  /integration/product/sellers/:sellerId/products/batch-requests/:batchId
 *   GET  /integration/product/sellers/:sellerId/products
 */

import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { logger } from '../lib/logger';

export const MOCK_PORT = 3099;
export const MOCK_BASE_URL = `http://localhost:${MOCK_PORT}`;

// ─────────────────────────────────────────────
// In-memory state
// ─────────────────────────────────────────────

let orderPage = 0; // cycles through mock order pages

const MOCK_ORDERS = Array.from({ length: 5 }, (_, i) => ({
  shipmentPackageId: 1000000 + i,
  orderNumber: `TY-ORDER-${1000 + i}`,
  status: ['Created', 'Picking', 'Shipped', 'Delivered', 'Cancelled'][i % 5],
  shipmentPackageStatus: 'Created',
  orderDate: Date.now() - i * 3_600_000,
  lastModifiedDate: Date.now() - i * 1_800_000,
  activationDate: Date.now() - i * 3_600_000,
  estimatedDeliveryStartDate: Date.now() + 86_400_000,
  estimatedDeliveryEndDate: Date.now() + 2 * 86_400_000,
  agreedDeliveryDate: null,
  originShipmentDate: null,
  packageGrossAmount: 199.99 + i * 50,
  packageSellerDiscount: 0,
  packageTyDiscount: 0,
  packageTotalDiscount: 0,
  packageTotalPrice: 199.99 + i * 50,
  currencyCode: 'TRY',
  taxNumber: null,
  identityNumber: null,
  customerFirstName: `Test${i}`,
  customerLastName: `Müşteri${i}`,
  customerEmail: `test${i}@example.com`,
  customerId: 9000000 + i,
  supplierId: 12345,
  shipmentAddress: {
    id: 200000 + i,
    firstName: `Test${i}`,
    lastName: `Müşteri${i}`,
    company: '',
    address1: `Test Sokak No:${i + 1}`,
    address2: '',
    city: 'İstanbul',
    cityCode: 34,
    district: 'Kadıköy',
    districtId: 1,
    postalCode: '34710',
    countryCode: 'TR',
    neighborhoodId: 0,
    neighborhood: 'Test Mahallesi',
    phone: null,
    fullAddress: `Test Sokak No:${i + 1}, Kadıköy, İstanbul`,
    fullName: `Test${i} Müşteri${i}`,
  },
  invoiceAddress: null,
  lines: [
    {
      lineId: 3000000 + i,
      quantity: 1 + (i % 3),
      salesCampaignId: 0,
      productSize: 'Tek Ebat',
      stockCode: `STK-00${i + 1}`,
      productName: `Test Ürün ${i + 1}`,
      contentId: 4000000 + i,
      productOrigin: 'TR',
      sellerId: 12345,
      lineGrossAmount: 199.99 + i * 50,
      lineTotalDiscount: 0,
      lineSellerDiscount: 0,
      lineTyDiscount: 0,
      discountDetails: [],
      currencyCode: 'TRY',
      productColor: 'Siyah',
      vatRate: 20,
      barcode: `8680000000${i + 1}`,
      orderLineItemStatusName: 'Created',
      lineUnitPrice: 199.99 + i * 50,
      productCategoryId: 1001,
      commission: 12,
      cancelledBy: '',
      cancelReason: '',
      cancelReasonCode: 0,
    },
  ],
  cargoTrackingNumber: null,
  cargoTrackingLink: null,
  cargoSenderNumber: null,
  cargoProviderName: null,
  deliveryType: 'normal',
  deliveryAddressType: 'Shipment',
  fastDelivery: false,
  fastDeliveryType: null,
  commercial: false,
  micro: false,
  isCod: false,
  warehouseId: 1,
  invoiceLink: null,
  packageHistories: [],
  createdBy: 'order-creation' as const,
  originPackageIds: null,
  giftBoxRequested: false,
  containsDangerousProduct: false,
  cargoDeci: 5,
  shipmentNumber: 5000000 + i,
}));

const MOCK_PRODUCTS = Array.from({ length: 3 }, (_, i) => ({
  contentId: 4000000 + i,
  productMainId: `MAIN-${i + 1}`,
  brand: { id: 1, name: 'Test Marka' },
  category: { id: 1001, name: 'Test Kategori' },
  creationDate: Date.now() - 30 * 86_400_000,
  lastModifiedDate: Date.now() - 86_400_000,
  title: `Test Ürün ${i + 1}`,
  description: `Test ürün açıklaması ${i + 1}`,
  images: [{ url: 'https://via.placeholder.com/400x600' }],
  attributes: [],
  variants: [
    {
      variantId: 7000000 + i,
      supplierId: 12345,
      barcode: `8680000000${i + 1}`,
      attributes: [],
      productUrl: `https://www.trendyol.com/test-urun-p-${4000000 + i}`,
      onSale: true,
      stock: { quantity: 10 + i * 5, lastModifiedDate: Date.now() },
      price: { salePrice: 199.99 + i * 50, listPrice: 249.99 + i * 50 },
      stockCode: `STK-00${i + 1}`,
      vatRate: 20,
      sellerCreatedDate: Date.now() - 30 * 86_400_000,
      sellerModifiedDate: Date.now() - 86_400_000,
      locked: false,
      lockReason: null,
      archived: false,
      blacklisted: false,
    },
  ],
}));

// Batch state: batchId -> status
const batches = new Map<string, { status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'; items: unknown[] }>();

// ─────────────────────────────────────────────
// Mock Hono app
// ─────────────────────────────────────────────

const mock = new Hono();

// Auth check (loose — just verify header exists)
mock.use('*', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Basic ')) {
    return c.json({ error: 'Unauthorized', exception: 'ClientApiAuthenticationException' }, 401);
  }
  await next();
});

// GET /integration/sellers/:sellerId/addresses
mock.get('/integration/sellers/:sellerId/addresses', (c) => {
  return c.json({
    supplierAddresses: [
      {
        id: 1,
        addressType: 'Shipment',
        country: 'Turkey',
        city: 'İstanbul',
        cityCode: 34,
        district: 'Kadıköy',
        districtId: 1,
        postCode: '34710',
        address: 'Test Sokak No:1 Kadıköy/İstanbul',
        neighborhoodId: 0,
        neighborhood: 'Test Mahallesi',
        floor: '1',
        doorNumber: '1',
        isDefault: true,
        fullAddress: 'Test Sokak No:1 Kadıköy/İstanbul',
      },
    ],
  });
});

// GET /integration/order/sellers/:sellerId/orders
mock.get('/integration/order/sellers/:sellerId/orders', (c) => {
  const page = parseInt(c.req.query('page') ?? '0', 10);
  const size = parseInt(c.req.query('size') ?? '50', 10);
  const status = c.req.query('status');

  let orders = MOCK_ORDERS;
  if (status) {
    orders = orders.filter((o) => o.status === status);
  }

  const start = page * size;
  const content = orders.slice(start, start + size);

  return c.json({
    page,
    size,
    totalPages: Math.ceil(orders.length / size),
    totalElements: orders.length,
    content,
  });
});

// POST /integration/inventory/sellers/:sellerId/products/price-and-inventory
mock.post('/integration/inventory/sellers/:sellerId/products/price-and-inventory', async (c) => {
  const body = await c.req.json<{ items: Array<{ barcode: string; quantity: number; salePrice: number; listPrice: number }> }>();

  // Validate
  for (const item of body.items ?? []) {
    if (item.listPrice < item.salePrice) {
      return c.json({
        errors: [{ code: 'PRICE_ERROR', message: `listPrice < salePrice for barcode ${item.barcode}` }],
      }, 400);
    }
  }

  const batchRequestId = `mock-batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Simulate async processing: IN_PROGRESS -> COMPLETED after 3s
  batches.set(batchRequestId, { status: 'IN_PROGRESS', items: body.items ?? [] });
  setTimeout(() => {
    const batch = batches.get(batchRequestId);
    if (batch) {
      batch.status = 'COMPLETED';
      // Simulate 1 failure for testing
      batch.items = (body.items ?? []).map((item, i) => ({
        requestItem: item,
        status: i === 0 && Math.random() < 0.2 ? 'FAILED' : 'SUCCESS',
        failureReasons: i === 0 && Math.random() < 0.2 ? ['Mock: Simulated failure'] : [],
      }));
    }
  }, 3_000);

  return c.json({ batchRequestId });
});

// GET /integration/product/sellers/:sellerId/products/batch-requests/:batchId
mock.get('/integration/product/sellers/:sellerId/products/batch-requests/:batchId', (c) => {
  const batchId = c.req.param('batchId');
  const batch = batches.get(batchId);

  if (!batch) {
    return c.json({ error: 'Batch not found' }, 404);
  }

  const items = batch.items as Array<{ requestItem: unknown; status: string; failureReasons: string[] }>;
  const failedCount = items.filter((i) => i.status !== 'SUCCESS').length;

  return c.json({
    batchRequestId: batchId,
    status: batch.status,
    creationDate: Date.now() - 5_000,
    lastModification: Date.now(),
    sourceType: 'PRICE_AND_INVENTORY',
    itemCount: items.length,
    failedItemCount: failedCount,
    items,
  });
});

// GET /integration/product/sellers/:sellerId/products
mock.get('/integration/product/sellers/:sellerId/products', (c) => {
  const page = parseInt(c.req.query('page') ?? '0', 10);
  const size = parseInt(c.req.query('size') ?? '50', 10);
  const barcode = c.req.query('barcode');

  let products = MOCK_PRODUCTS;
  if (barcode) {
    products = products.filter((p) => p.variants.some((v) => v.barcode === barcode));
  }

  return c.json({
    page,
    size,
    totalPages: Math.ceil(products.length / size),
    totalElements: products.length,
    nextPageToken: null,
    content: products.slice(page * size, page * size + size),
  });
});

// PUT /integration/order/sellers/:sellerId/shipment-packages/:packageId/tracking-details
mock.put('/integration/order/sellers/:sellerId/shipment-packages/:packageId/tracking-details', (c) => {
  return c.json({}, 200);
});

// PUT /integration/order/sellers/:sellerId/shipment-packages/:packageId
mock.put('/integration/order/sellers/:sellerId/shipment-packages/:packageId', (c) => {
  return c.json({}, 200);
});

// PUT /integration/order/sellers/:sellerId/shipment-packages/:packageId/items/unsupplied
mock.put('/integration/order/sellers/:sellerId/shipment-packages/:packageId/items/unsupplied', (c) => {
  return c.json({}, 200);
});

// 404 fallback
mock.notFound((c) => {
  logger.warn(`[TrendyolMock] 404: ${c.req.method} ${c.req.path}`);
  return c.json({ error: 'Mock endpoint not found', path: c.req.path }, 404);
});

// ─────────────────────────────────────────────
// Start / Stop
// ─────────────────────────────────────────────

let mockServer: ReturnType<typeof serve> | null = null;

export function startTrendyolMock(): void {
  if (mockServer) return;
  mockServer = serve({ fetch: mock.fetch, port: MOCK_PORT }, () => {
    logger.info(`[TrendyolMock] Mock server running on http://localhost:${MOCK_PORT}`);
    logger.info('[TrendyolMock] Use sellerId=12345, apiKey=test-key, apiSecret=test-secret');
  });
}

export function stopTrendyolMock(): void {
  if (mockServer) {
    (mockServer as unknown as { close(): void }).close();
    mockServer = null;
  }
}
