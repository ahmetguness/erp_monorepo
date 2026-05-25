process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-jwt-secret';
process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'integration-test-admin-secret';
process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || 'http://localhost:3000';
process.env.MARKETPLACE_WORKER_ENABLED = 'false';

import jwt from 'jsonwebtoken';
import { ContactType, DomainEventOutboxStatus, EntityType, FiscalPeriodStatus, InvoiceType, MovementType, PaymentMethod, PermissionAction, Plan, TenantStatus, WorkOrderStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';

interface TestContext {
  tenantAId: string;
  tenantBId: string;
  ownerAId: string;
  limitedAId: string;
  contactAId: string;
  contactBId: string;
  productAId: string;
  warehouseAId: string;
  cashAccountAId: string;
}

interface ApiResult {
  status: number;
  body: unknown;
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

const createdTenantIds: string[] = [];
const createdUserIds: string[] = [];
const TEST_TIMEOUT_MS = 15_000;

console.log('Backend integration tests: starting');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readDataId(body: unknown): string {
  if (!isRecord(body) || !isRecord(body.data) || typeof body.data.id !== 'string') {
    throw new Error('Response data.id bulunamadi.');
  }
  return body.data.id;
}

function token(userId: string, tenantId: string): string {
  return jwt.sign({ userId, tenantId }, process.env.JWT_SECRET as string, { expiresIn: '10m' });
}

async function withTimeout<T>(label: string, task: Promise<T>): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label}: ${TEST_TIMEOUT_MS}ms icinde tamamlanmadi.`)), TEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([task, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function api(method: HttpMethod, path: string, bearerToken: string, body?: unknown): Promise<ApiResult> {
  const { app } = await withTimeout('app import', import('../src/index.js'));
  const headers = new Headers({
    Authorization: `Bearer ${bearerToken}`,
    Origin: 'http://localhost:3000',
  });
  let requestBody: BodyInit | undefined;

  if (body instanceof FormData) {
    requestBody = body;
  } else if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(body);
  }

  const response = await withTimeout(`${method} ${path}`, Promise.resolve(app.request(path, { method, headers, body: requestBody })));
  const text = await response.text();
  const parsedBody = text ? JSON.parse(text) as unknown : null;
  return { status: response.status, body: parsedBody };
}

function assertStatus(result: ApiResult, expected: number, label: string): void {
  if (result.status !== expected) {
    throw new Error(`${label}: HTTP ${expected} bekleniyordu, ${result.status} dondu. Body: ${JSON.stringify(result.body)}`);
  }
}

async function seedTenant(runId: string, suffix: 'a' | 'b') {
  const tenant = await prisma.tenant.create({
    data: {
      slug: `it-${runId}-${suffix}`,
      companyName: `Integration Tenant ${suffix.toUpperCase()}`,
      email: `tenant-${runId}-${suffix}@example.com`,
      plan: Plan.ENTERPRISE,
      status: TenantStatus.ACTIVE,
      modules: ['contacts', 'invoicing', 'accounting', 'inventory', 'attachments', 'settings', 'production'],
    },
  });
  createdTenantIds.push(tenant.id);

  const owner = await prisma.user.create({
    data: {
      email: `owner-${runId}-${suffix}@example.com`,
      name: `Owner ${suffix.toUpperCase()}`,
      password: 'integration-test',
      tenants: { create: { tenantId: tenant.id, isOwner: true } },
    },
  });
  createdUserIds.push(owner.id);

  return { tenant, owner };
}

async function seed(): Promise<TestContext> {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tenantA = await seedTenant(runId, 'a');
  const tenantB = await seedTenant(runId, 'b');

  const limitedRole = await prisma.role.create({
    data: {
      tenantId: tenantA.tenant.id,
      name: `Limited ${runId}`,
      permissions: { create: [{ module: 'contacts', action: PermissionAction.READ }] },
    },
  });

  const limitedUser = await prisma.user.create({
    data: {
      email: `limited-${runId}@example.com`,
      name: 'Limited User',
      password: 'integration-test',
      tenants: { create: { tenantId: tenantA.tenant.id, roleId: limitedRole.id, isOwner: false } },
    },
  });
  createdUserIds.push(limitedUser.id);

  const contactA = await prisma.contact.create({
    data: {
      tenantId: tenantA.tenant.id,
      type: ContactType.CUSTOMER,
      code: `CTA-${runId}`,
      name: 'Integration Contact A',
      email: `contact-a-${runId}@example.com`,
    },
  });

  const contactB = await prisma.contact.create({
    data: {
      tenantId: tenantB.tenant.id,
      type: ContactType.CUSTOMER,
      code: `CTB-${runId}`,
      name: 'Integration Contact B',
      email: `contact-b-${runId}@example.com`,
    },
  });

  const unit = await prisma.unit.create({
    data: { tenantId: tenantA.tenant.id, code: `PCS-${runId}`, name: 'Piece' },
  });

  const product = await prisma.product.create({
    data: {
      tenantId: tenantA.tenant.id,
      unitId: unit.id,
      code: `PRD-${runId}`,
      name: 'Integration Product',
      salesPrice: 100,
      purchasePrice: 50,
    },
  });

  const warehouse = await prisma.warehouse.create({
    data: { tenantId: tenantA.tenant.id, code: `WH-${runId}`, name: 'Integration Warehouse' },
  });

  const cashAccount = await prisma.cashAccount.create({
    data: { tenantId: tenantA.tenant.id, name: `Integration Cash ${runId}`, currencyCode: 'TRY' },
  });

  return {
    tenantAId: tenantA.tenant.id,
    tenantBId: tenantB.tenant.id,
    ownerAId: tenantA.owner.id,
    limitedAId: limitedUser.id,
    contactAId: contactA.id,
    contactBId: contactB.id,
    productAId: product.id,
    warehouseAId: warehouse.id,
    cashAccountAId: cashAccount.id,
  };
}

async function cleanup(): Promise<void> {
  if (createdTenantIds.length === 0 && createdUserIds.length === 0) return;

  await prisma.paymentAllocation.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.payment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.invoiceHistory.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.invoiceLine.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.invoice.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.accountEntry.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.stockValuation.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.stockMovement.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.stockLevel.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.inventoryReservation.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.workOrderHistory.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.workOrderOperation.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.workOrderItem.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.workOrder.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.attachment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.notification.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.task.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.domainEventOutbox.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.cashAccount.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.product.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.location.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.warehouse.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.unit.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.contact.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.rolePermission.deleteMany({ where: { role: { tenantId: { in: createdTenantIds } } } });
  await prisma.tenantUser.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.role.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.numberSequence.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.moduleSetting.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.fiscalPeriod.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.tenant.updateMany({ where: { id: { in: createdTenantIds } }, data: { deletedAt: new Date(), status: TenantStatus.CANCELLED } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
}

async function testTenantIsolation(ctx: TestContext): Promise<void> {
  const result = await api('GET', `/api/contacts/${ctx.contactBId}`, token(ctx.ownerAId, ctx.tenantAId));
  assertStatus(result, 404, 'tenant A, tenant B carisini okuyamamali');
}

async function testPermissionDenied(ctx: TestContext): Promise<void> {
  const result = await api('POST', '/api/invoices', token(ctx.limitedAId, ctx.tenantAId), {
    contactId: ctx.contactAId,
    type: InvoiceType.SALES,
    date: '2026-05-24',
    lines: [{ description: 'Service', quantity: 1, unitPrice: 100 }],
  });
  assertStatus(result, 403, 'CREATE izni olmayan kullanici fatura olusturamamali');
}

async function createInvoice(ctx: TestContext): Promise<string> {
  const result = await api('POST', '/api/invoices', token(ctx.ownerAId, ctx.tenantAId), {
    contactId: ctx.contactAId,
    type: InvoiceType.SALES,
    date: '2026-05-24',
    lines: [{ productId: ctx.productAId, description: 'Service', quantity: 1, unitPrice: 100 }],
  });
  assertStatus(result, 201, 'owner fatura olusturabilmeli');
  return readDataId(result.body);
}

async function testInvoiceCreatesAccountEntry(ctx: TestContext): Promise<string> {
  const invoiceId = await createInvoice(ctx);
  const accountEntry = await prisma.accountEntry.findFirst({
    where: { tenantId: ctx.tenantAId, contactId: ctx.contactAId, refType: 'INVOICE', refId: invoiceId },
  });
  if (!accountEntry || Number(accountEntry.debit) <= 0) {
    throw new Error('Fatura olusturma account entry yazmadi.');
  }
  return invoiceId;
}

async function testClosedFiscalPeriodBlocksInvoice(ctx: TestContext): Promise<void> {
  await prisma.fiscalPeriod.create({
    data: {
      tenantId: ctx.tenantAId,
      name: 'Closed April 2026',
      startDate: new Date('2026-04-01T00:00:00.000Z'),
      endDate: new Date('2026-04-30T00:00:00.000Z'),
      status: FiscalPeriodStatus.CLOSED,
    },
  });

  const result = await api('POST', '/api/invoices', token(ctx.ownerAId, ctx.tenantAId), {
    contactId: ctx.contactAId,
    type: InvoiceType.SALES,
    date: '2026-04-15',
    lines: [{ productId: ctx.productAId, description: 'Closed period service', quantity: 1, unitPrice: 100 }],
  });
  assertStatus(result, 400, 'kapali mali doneme fatura yazilamamali');
}

async function testPaymentAllocation(ctx: TestContext, invoiceId: string): Promise<void> {
  const result = await api('POST', '/api/payments', token(ctx.ownerAId, ctx.tenantAId), {
    contactId: ctx.contactAId,
    cashAccountId: ctx.cashAccountAId,
    date: '2026-05-24',
    amount: 100,
    method: PaymentMethod.CASH,
    direction: 'RECEIVE',
    allocations: [{ invoiceId, amount: 100 }],
  });
  assertStatus(result, 201, 'odeme tahsisati olusturulabilmeli');
  const paymentId = readDataId(result.body);
  const allocation = await prisma.paymentAllocation.findFirst({ where: { tenantId: ctx.tenantAId, paymentId, invoiceId } });
  if (!allocation || Number(allocation.amount) !== 100) {
    throw new Error('Odeme tahsisati fatura ile eslesmedi.');
  }
}

async function testPaymentAllocationCannotExceedInvoiceTotal(ctx: TestContext, invoiceId: string): Promise<void> {
  const result = await api('POST', '/api/payments', token(ctx.ownerAId, ctx.tenantAId), {
    contactId: ctx.contactAId,
    cashAccountId: ctx.cashAccountAId,
    date: '2026-05-24',
    amount: 1,
    method: PaymentMethod.CASH,
    direction: 'RECEIVE',
    allocations: [{ invoiceId, amount: 1 }],
  });
  assertStatus(result, 400, 'fatura toplamindan fazla tahsis engellenmeli');
}

async function testDomainEventOutbox(ctx: TestContext): Promise<void> {
  const events = await prisma.domainEventOutbox.findMany({
    where: {
      tenantId: ctx.tenantAId,
      name: { in: ['invoice.created', 'payment.received'] },
    },
    select: { name: true, source: true, idempotencyKey: true, status: true, attempts: true },
  });

  const invoiceEvent = events.find((event) => event.name === 'invoice.created');
  const paymentEvent = events.find((event) => event.name === 'payment.received');
  if (!invoiceEvent || !paymentEvent) {
    throw new Error('Domain event outbox invoice/payment eventlerini kaydetmedi.');
  }
  if (events.some((event) => event.status !== DomainEventOutboxStatus.PROCESSED || event.attempts < 1)) {
    throw new Error('Domain event outbox eventleri basarili islenmis durumda degil.');
  }
  if (events.some((event) => !event.source.startsWith(`domain:${event.name}:`) || event.idempotencyKey !== event.source)) {
    throw new Error('Domain event source/idempotency standardi bozuk.');
  }

  const result = await api('GET', '/api/domain-events?name=invoice.created', token(ctx.ownerAId, ctx.tenantAId));
  assertStatus(result, 200, 'domain event audit viewer listelenebilmeli');
}

async function testDomainEventIdempotency(ctx: TestContext): Promise<void> {
  const before = await prisma.notification.count({ where: { tenantId: ctx.tenantAId, module: 'accounting' } });
  const paymentEvent = await prisma.domainEventOutbox.findFirst({
    where: { tenantId: ctx.tenantAId, name: 'payment.received' },
    select: { idempotencyKey: true },
  });
  if (!paymentEvent) throw new Error('Idempotency testi icin payment.received event bulunamadi.');

  const duplicate = await prisma.domainEventOutbox.count({
    where: { tenantId: ctx.tenantAId, idempotencyKey: paymentEvent.idempotencyKey },
  });
  if (duplicate !== 1) throw new Error('Domain event idempotency unique kaydi bozuk.');

  const after = await prisma.notification.count({ where: { tenantId: ctx.tenantAId, module: 'accounting' } });
  if (after !== before) throw new Error('Domain event idempotency kontrolu yan etki uretmemeli.');
}

async function testStockMovementUpdatesLevel(ctx: TestContext): Promise<void> {
  const result = await api('POST', '/api/stock/movements', token(ctx.ownerAId, ctx.tenantAId), {
    productId: ctx.productAId,
    warehouseId: ctx.warehouseAId,
    type: MovementType.IN,
    quantity: 7,
    unitCost: 10,
  });
  assertStatus(result, 201, 'stok hareketi olusturulabilmeli');
  const stockLevel = await prisma.stockLevel.findFirst({
    where: { tenantId: ctx.tenantAId, productId: ctx.productAId, warehouseId: ctx.warehouseAId },
  });
  if (!stockLevel || Number(stockLevel.quantity) !== 7) {
    throw new Error('Stok hareketi stock level guncellemedi.');
  }
  const valuation = await prisma.stockValuation.findFirst({
    where: { tenantId: ctx.tenantAId, productId: ctx.productAId, warehouseId: ctx.warehouseAId },
    select: { unitCost: true, qtyBalance: true },
  });
  if (!valuation || Number(valuation.unitCost) !== 10 || Number(valuation.qtyBalance) !== 7) {
    throw new Error('Stok hareketi maliyet degerleme kaydi olusturmadi.');
  }
  const product = await prisma.product.findFirst({
    where: { tenantId: ctx.tenantAId, id: ctx.productAId },
    select: { averageCost: true },
  });
  if (!product || Number(product.averageCost) !== 10) {
    throw new Error('Stok hareketi hareketli ortalama maliyeti guncellemedi.');
  }
}

async function testProductionExecutionFlow(ctx: TestContext): Promise<void> {
  const workOrder = await prisma.workOrder.create({
    data: {
      tenantId: ctx.tenantAId,
      productId: ctx.productAId,
      number: `WO-IT-${Date.now()}`,
      plannedQty: 2,
      inputWarehouseId: ctx.warehouseAId,
      outputWarehouseId: ctx.warehouseAId,
      items: {
        create: [{
          tenantId: ctx.tenantAId,
          productId: ctx.productAId,
          requiredQty: 2,
          sourceWarehouseId: ctx.warehouseAId,
        }],
      },
      history: { create: { tenantId: ctx.tenantAId, toStatus: WorkOrderStatus.PLANNED } },
    },
    include: { items: true },
  });

  const startResult = await api('POST', `/api/production/work-orders/${workOrder.id}/status`, token(ctx.ownerAId, ctx.tenantAId), {
    status: WorkOrderStatus.IN_PROGRESS,
  });
  assertStatus(startResult, 200, 'is emri baslatilabilmeli');

  const reservation = await prisma.inventoryReservation.findFirst({
    where: { tenantId: ctx.tenantAId, refId: workOrder.id, releasedAt: null },
  });
  if (!reservation || Number(reservation.quantity) !== 2) {
    throw new Error('Is emri baslatilinca malzeme rezervasyonu olusmadi.');
  }

  const reportResult = await api('POST', `/api/production/work-orders/${workOrder.id}/report`, token(ctx.ownerAId, ctx.tenantAId), {
    producedQty: 2,
    scrapQty: 0.25,
    consumptions: [{ itemId: workOrder.items[0]!.id, quantity: 2 }],
  });
  assertStatus(reportResult, 200, 'uretim bildirimi kaydedilebilmeli');

  const consumedItem = await prisma.workOrderItem.findFirst({
    where: { tenantId: ctx.tenantAId, workOrderId: workOrder.id, id: workOrder.items[0]!.id },
    select: { consumedQty: true },
  });
  if (!consumedItem || Number(consumedItem.consumedQty) !== 2) {
    throw new Error('Uretim bildirimi malzeme tuketimini guncellemedi.');
  }

  const completeResult = await api('POST', `/api/production/work-orders/${workOrder.id}/status`, token(ctx.ownerAId, ctx.tenantAId), {
    status: WorkOrderStatus.COMPLETED,
  });
  assertStatus(completeResult, 200, 'is emri tamamlanabilmeli');

  const openReservation = await prisma.inventoryReservation.findFirst({
    where: { tenantId: ctx.tenantAId, refId: workOrder.id, releasedAt: null },
  });
  if (openReservation) throw new Error('Tamamlanan is emrinin rezervasyonu acik kalmamali.');

  const productionEvent = await prisma.domainEventOutbox.findFirst({
    where: { tenantId: ctx.tenantAId, name: 'production.completed', entityId: workOrder.id },
  });
  if (!productionEvent) throw new Error('Uretim tamamlaninca domain event olusmadi.');
}

async function testAttachmentTenantValidation(ctx: TestContext): Promise<void> {
  const formData = new FormData();
  formData.set('entityType', EntityType.CONTACT);
  formData.set('entityId', ctx.contactBId);
  formData.set('file', new File(['hello'], 'tenant-check.txt', { type: 'text/plain' }));
  const result = await api('POST', '/api/attachments/upload', token(ctx.ownerAId, ctx.tenantAId), formData);
  assertStatus(result, 400, 'dosya upload baska tenant entity id kabul etmemeli');
}

async function main(): Promise<void> {
  const ctx = await withTimeout('seed', seed());
  try {
    console.log('Integration: tenant isolation');
    await testTenantIsolation(ctx);
    console.log('Integration: permission denied');
    await testPermissionDenied(ctx);
    console.log('Integration: invoice account entry');
    const invoiceId = await testInvoiceCreatesAccountEntry(ctx);
    console.log('Integration: closed fiscal period');
    await testClosedFiscalPeriodBlocksInvoice(ctx);
    console.log('Integration: payment allocation');
    await testPaymentAllocation(ctx, invoiceId);
    console.log('Integration: payment allocation reconciliation');
    await testPaymentAllocationCannotExceedInvoiceTotal(ctx, invoiceId);
    console.log('Integration: domain event outbox');
    await testDomainEventOutbox(ctx);
    console.log('Integration: domain event idempotency');
    await testDomainEventIdempotency(ctx);
    console.log('Integration: stock movement');
    await testStockMovementUpdatesLevel(ctx);
    console.log('Integration: production execution');
    await testProductionExecutionFlow(ctx);
    console.log('Integration: attachment tenant validation');
    await testAttachmentTenantValidation(ctx);
    console.log('Backend integration tests: OK');
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

main().then(() => {
  process.exit(0);
}).catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Backend integration tests failed');
  await cleanup().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
