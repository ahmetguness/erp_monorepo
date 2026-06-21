process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-jwt-secret';
process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'integration-test-admin-secret';
process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || 'http://localhost:3000';
process.env.MARKETPLACE_WORKER_ENABLED = 'false';

import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import {
  ContactType,
  DeliveryNoteType,
  DomainEventOutboxStatus,
  EntityType,
  FiscalPeriodStatus,
  InvoiceStatus,
  InvoiceType,
  MovementType,
  OrderStatus,
  PaymentMethod,
  PermissionAction,
  Plan,
  PurchaseOrderStatus,
  TenantStatus,
  WorkOrderStatus,
} from '@prisma/client';
import { prisma } from '../src/lib/prisma';

interface TestContext {
  tenantAId: string;
  tenantBId: string;
  ownerAId: string;
  limitedAId: string;
  contactAId: string;
  contactBId: string;
  contactBCode: string;
  contactBEmail: string;
  productAId: string;
  productBId: string;
  warehouseAId: string;
  cashAccountAId: string;
}

interface ApiResult {
  status: number;
  body: unknown;
}

interface ApiTextResult {
  status: number;
  text: string;
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

function readDataRecord(body: unknown): Record<string, unknown> {
  if (!isRecord(body) || !isRecord(body.data)) {
    throw new Error('Response data kaydi bulunamadi.');
  }
  return body.data;
}

function readDataArray(body: unknown): Record<string, unknown>[] {
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw new Error('Response data listesi bulunamadi.');
  }
  return body.data.filter(isRecord);
}

function readStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new Error(`${key} string olarak donmedi.`);
  return value;
}

function readNumberField(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number') throw new Error(`${key} number olarak donmedi.`);
  return value;
}

function readSimulationAllowed(body: unknown): boolean {
  if (!isRecord(body) || !isRecord(body.data) || typeof body.data.allowed !== 'boolean') {
    throw new Error('Permission simulator response data.allowed bulunamadi.');
  }
  return body.data.allowed;
}

function readSimulationGate(body: unknown, key: string): { allowed: boolean; reason: string } {
  if (!isRecord(body) || !isRecord(body.data) || !Array.isArray(body.data.gates)) {
    throw new Error('Permission simulator response data.gates bulunamadi.');
  }
  const gate = body.data.gates.find((item): item is Record<string, unknown> => isRecord(item) && item.key === key);
  if (!gate || typeof gate.allowed !== 'boolean' || typeof gate.reason !== 'string') {
    throw new Error(`Permission simulator ${key} gate bulunamadi.`);
  }
  return { allowed: gate.allowed, reason: gate.reason };
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

async function apiText(method: HttpMethod, path: string, bearerToken: string): Promise<ApiTextResult> {
  const { app } = await withTimeout('app import', import('../src/index.js'));
  const response = await withTimeout(`${method} ${path}`, Promise.resolve(app.request(path, {
    method,
    headers: new Headers({
      Authorization: `Bearer ${bearerToken}`,
      Origin: 'http://localhost:3000',
    }),
  })));
  return { status: response.status, text: await response.text() };
}

async function apiKeyRequest(method: HttpMethod, path: string, rawKey: string, body?: unknown): Promise<ApiResult> {
  const { app } = await withTimeout('app import', import('../src/index.js'));
  const headers = new Headers({
    'x-api-key': rawKey,
    Origin: 'http://localhost:3000',
  });
  let requestBody: BodyInit | undefined;

  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(body);
  }

  const response = await withTimeout(`${method} ${path}`, Promise.resolve(app.request(path, { method, headers, body: requestBody })));
  const text = await response.text();
  const parsedBody = text ? JSON.parse(text) as unknown : null;
  return { status: response.status, body: parsedBody };
}

function assertStatus(result: { status: number; body?: unknown }, expected: number, label: string): void {
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
      modules: ['contacts', 'invoicing', 'accounting', 'inventory', 'attachments', 'settings', 'production', 'reporting', 'purchasing', 'api_keys'],
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

  // Seed basic accounting TDHP structure for production costing
  await prisma.ledgerAccount.createMany({
    data: [
      { tenantId: tenant.id, code: '150', name: 'Raw Materials', accountType: 'ASSET' },
      { tenantId: tenant.id, code: '152', name: 'Finished Goods', accountType: 'ASSET' },
      { tenantId: tenant.id, code: '720', name: 'Direct Labor', accountType: 'EXPENSE' },
      { tenantId: tenant.id, code: '730', name: 'Production Overhead', accountType: 'EXPENSE' },
      { tenantId: tenant.id, code: '689', name: 'Scrap Expenses', accountType: 'EXPENSE' },
    ],
  });

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

  const unitB = await prisma.unit.create({
    data: { tenantId: tenantB.tenant.id, code: `PCB-${runId}`, name: 'Piece B' },
  });

  const productB = await prisma.product.create({
    data: {
      tenantId: tenantB.tenant.id,
      unitId: unitB.id,
      code: `PRDB-${runId}`,
      name: 'Integration Product B',
      salesPrice: 200,
      purchasePrice: 75,
    },
  });

  const warehouse = await prisma.warehouse.create({
    data: { tenantId: tenantA.tenant.id, code: `WH-${runId}`, name: 'Integration Warehouse' },
  });

  const cashAccount = await prisma.cashAccount.create({
    data: { tenantId: tenantA.tenant.id, name: `Integration Cash ${runId}`, currencyCode: 'TRY' },
  });

  await prisma.accountEntry.create({
    data: {
      tenantId: tenantB.tenant.id,
      contactId: contactB.id,
      date: new Date('2026-05-24T00:00:00.000Z'),
      debit: 1234,
      credit: 0,
      balance: 1234,
      description: 'Tenant B isolation marker',
      refType: 'TEST',
      refId: `tenant-b-${runId}`,
    },
  });

  return {
    tenantAId: tenantA.tenant.id,
    tenantBId: tenantB.tenant.id,
    ownerAId: tenantA.owner.id,
    limitedAId: limitedUser.id,
    contactAId: contactA.id,
    contactBId: contactB.id,
    contactBCode: contactB.code ?? '',
    contactBEmail: contactB.email ?? '',
    productAId: product.id,
    productBId: productB.id,
    warehouseAId: warehouse.id,
    cashAccountAId: cashAccount.id,
  };
}

async function cleanup(): Promise<void> {
  if (createdTenantIds.length === 0 && createdUserIds.length === 0) return;

  await prisma.journalEntryLine.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.journalEntry.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.paymentAllocation.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.payment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.invoiceHistory.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.invoiceLine.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.invoice.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.accountEntry.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.deliveryNoteItem.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.deliveryNote.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.salesOrderHistory.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.salesOrderItem.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.salesOrder.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.purchaseRequestItem.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.purchaseRequest.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.purchaseOrderHistory.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.purchaseOrderItem.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.purchaseOrder.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.stockValuation.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.stockMovement.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.stockLevel.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.lotSerialNumber.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
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
  await prisma.apiKey.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
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
  await prisma.ledgerAccount.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.fiscalPeriod.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.tenant.updateMany({ where: { id: { in: createdTenantIds } }, data: { deletedAt: new Date(), status: TenantStatus.CANCELLED } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
}

async function testTenantIsolation(ctx: TestContext): Promise<void> {
  const result = await api('GET', `/api/contacts/${ctx.contactBId}`, token(ctx.ownerAId, ctx.tenantAId));
  assertStatus(result, 404, 'tenant A, tenant B carisini okuyamamali');
}

async function testDataExchangeTenantIsolation(ctx: TestContext): Promise<void> {
  const exportResult = await apiText('GET', '/api/data-exchange/export/contacts', token(ctx.ownerAId, ctx.tenantAId));
  assertStatus(exportResult, 200, 'data exchange contact export calismali');
  if (exportResult.text.includes('Integration Contact B') || exportResult.text.includes('CTB-')) {
    throw new Error('Data exchange export tenant B carisini sizdirdi.');
  }

  const previewResult = await api('POST', '/api/data-exchange/import/preview/contacts', token(ctx.ownerAId, ctx.tenantAId), {
    csv: `type,code,name,email\nCUSTOMER,${ctx.contactBCode},Integration Contact B,${ctx.contactBEmail}\n`,
    mapping: {},
    partialImport: true,
  });
  assertStatus(previewResult, 200, 'data exchange import preview calismali');
  if (JSON.stringify(previewResult.body).includes('sistemde mevcut')) {
    throw new Error('Data exchange import preview tenant B kaydini duplicate olarak gordu.');
  }
}

async function testReportingTenantIsolation(ctx: TestContext): Promise<void> {
  const result = await api('GET', '/api/reports/contact-balance', token(ctx.ownerAId, ctx.tenantAId));
  assertStatus(result, 200, 'contact balance raporu calismali');
  const serialized = JSON.stringify(result.body);
  if (serialized.includes(ctx.contactBId) || serialized.includes('Integration Contact B') || serialized.includes('1234')) {
    throw new Error('Reporting contact-balance tenant B bakiyesini sizdirdi.');
  }
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

async function testPermissionSimulatorSmoke(ctx: TestContext): Promise<void> {
  const ownerResult = await api('POST', '/api/roles/permission-simulator/simulate', token(ctx.ownerAId, ctx.tenantAId), {
    userId: ctx.ownerAId,
    module: 'invoicing',
    action: PermissionAction.CREATE,
    routeId: 'invoices:create',
  });
  assertStatus(ownerResult, 200, 'owner permission simulator calismali');
  if (!readSimulationAllowed(ownerResult.body)) throw new Error('Owner kullanici invoices:create icin izinli olmali.');

  const limitedResult = await api('POST', '/api/roles/permission-simulator/simulate', token(ctx.ownerAId, ctx.tenantAId), {
    userId: ctx.limitedAId,
    module: 'invoicing',
    action: PermissionAction.CREATE,
    routeId: 'invoices:create',
  });
  assertStatus(limitedResult, 200, 'limited role permission simulator calismali');
  if (readSimulationAllowed(limitedResult.body)) throw new Error('Limited kullanici invoices:create icin izinli olmamali.');
  if (readSimulationGate(limitedResult.body, 'permission').allowed) throw new Error('Limited kullanici permission gate tarafindan engellenmeli.');

  const originalModules = (await prisma.tenant.findUniqueOrThrow({
    where: { id: ctx.tenantAId },
    select: { modules: true },
  })).modules;
  await prisma.tenant.update({
    where: { id: ctx.tenantAId },
    data: { modules: originalModules.filter((module) => module !== 'inventory') },
  });

  try {
    const moduleDisabledResult = await api('POST', '/api/roles/permission-simulator/simulate', token(ctx.ownerAId, ctx.tenantAId), {
      userId: ctx.ownerAId,
      module: 'inventory',
      action: PermissionAction.READ,
      routeId: 'stock:movements',
    });
    assertStatus(moduleDisabledResult, 200, 'module-disabled tenant permission simulator calismali');
    if (readSimulationAllowed(moduleDisabledResult.body)) throw new Error('Inventory modulu kapaliyken stock:movements izinli olmamali.');
    if (readSimulationGate(moduleDisabledResult.body, 'module').allowed) throw new Error('Inventory modulu kapaliyken module gate engellemeli.');
  } finally {
    await prisma.tenant.update({ where: { id: ctx.tenantAId }, data: { modules: originalModules } });
  }
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

async function testInvoiceCancelCreatesReverseEntry(ctx: TestContext): Promise<void> {
  const invoiceId = await createInvoice(ctx);
  const beforeEntries = await prisma.accountEntry.findMany({
    where: { tenantId: ctx.tenantAId, refType: 'INVOICE', refId: invoiceId },
    select: { debit: true, credit: true },
  });
  if (beforeEntries.length !== 1 || Number(beforeEntries[0]?.debit ?? 0) !== 100) {
    throw new Error('Iptal oncesi fatura muhasebe kaydi beklenen durumda degil.');
  }

  const cancelResult = await api('POST', `/api/invoices/${invoiceId}/cancel`, token(ctx.ownerAId, ctx.tenantAId));
  assertStatus(cancelResult, 200, 'fatura iptal edilebilmeli');

  const invoice = await prisma.invoice.findFirst({
    where: { tenantId: ctx.tenantAId, id: invoiceId },
    select: { status: true },
  });
  if (!invoice || invoice.status !== InvoiceStatus.CANCELLED) {
    throw new Error('Fatura iptal sonrasi CANCELLED durumuna gecmedi.');
  }

  const entries = await prisma.accountEntry.findMany({
    where: { tenantId: ctx.tenantAId, refType: 'INVOICE', refId: invoiceId },
    select: { debit: true, credit: true },
  });
  if (entries.length !== 2 || !entries.some((entry) => Number(entry.credit) === 100)) {
    throw new Error('Fatura iptali ters muhasebe kaydi olusturmadi.');
  }

  const secondCancelResult = await api('POST', `/api/invoices/${invoiceId}/cancel`, token(ctx.ownerAId, ctx.tenantAId));
  assertStatus(secondCancelResult, 400, 'iptal edilmis fatura tekrar iptal edilememeli');
}

async function testSalesOrderDeliveryInvoiceChain(ctx: TestContext): Promise<void> {
  const orderResult = await api('POST', '/api/sales-orders', token(ctx.ownerAId, ctx.tenantAId), {
    contactId: ctx.contactAId,
    date: '2026-05-25',
    items: [{ productId: ctx.productAId, description: 'Sales chain product', quantity: 2, unitPrice: 100 }],
  });
  assertStatus(orderResult, 201, 'satis siparisi olusturulabilmeli');
  const orderId = readDataId(orderResult.body);

  const orderItem = await prisma.salesOrderItem.findFirst({
    where: { tenantId: ctx.tenantAId, orderId, productId: ctx.productAId },
    select: { id: true },
  });
  if (!orderItem) throw new Error('Satis siparisi kalemi bulunamadi.');

  const deliveryResult = await api('POST', '/api/delivery-notes', token(ctx.ownerAId, ctx.tenantAId), {
    type: DeliveryNoteType.OUTBOUND,
    salesOrderId: orderId,
    contactId: ctx.contactAId,
    warehouseId: ctx.warehouseAId,
    date: '2026-05-25',
    items: [{
      productId: ctx.productAId,
      orderedQty: 2,
      deliveredQty: 2,
      salesOrderItemId: orderItem.id,
    }],
  });
  assertStatus(deliveryResult, 201, 'satis teslimat notu olusturulabilmeli');

  const deliveredOrder = await prisma.salesOrder.findFirst({
    where: { tenantId: ctx.tenantAId, id: orderId },
    select: { status: true, items: { select: { delivered: true } } },
  });
  if (!deliveredOrder || deliveredOrder.status !== OrderStatus.DELIVERED) {
    throw new Error('Teslimat sonrasi satis siparisi DELIVERED olmadi.');
  }
  const deliveredQty = deliveredOrder.items.reduce((sum, item) => sum + Number(item.delivered), 0);
  if (deliveredQty !== 2) throw new Error('Teslimat satis siparisi kalem teslim miktarini guncellemedi.');

  const invoiceResult = await api('POST', '/api/invoices', token(ctx.ownerAId, ctx.tenantAId), {
    contactId: ctx.contactAId,
    salesOrderId: orderId,
    type: InvoiceType.SALES,
    date: '2026-05-25',
    lines: [{ productId: ctx.productAId, description: 'Sales chain invoice', quantity: 2, unitPrice: 100 }],
  });
  assertStatus(invoiceResult, 201, 'satis siparisinden fatura olusturulabilmeli');

  const invoicedOrder = await prisma.salesOrder.findFirst({
    where: { tenantId: ctx.tenantAId, id: orderId },
    select: { invoicedAmount: true },
  });
  if (!invoicedOrder || Number(invoicedOrder.invoicedAmount) !== 200) {
    throw new Error('Satis siparisi faturalanan tutari guncellenmedi.');
  }
}

async function testPurchaseOrderReceiptInvoiceChain(ctx: TestContext): Promise<void> {
  const beforeStock = await prisma.stockLevel.findFirst({
    where: { tenantId: ctx.tenantAId, productId: ctx.productAId, warehouseId: ctx.warehouseAId },
    select: { quantity: true },
  });
  const beforeQty = Number(beforeStock?.quantity ?? 0);

  const orderResult = await api('POST', '/api/purchase-orders', token(ctx.ownerAId, ctx.tenantAId), {
    contactId: ctx.contactAId,
    date: '2026-05-26',
    items: [{ productId: ctx.productAId, description: 'Purchase chain product', quantity: 3, unitPrice: 40 }],
  });
  assertStatus(orderResult, 201, 'satinalma siparisi olusturulabilmeli');
  const orderId = readDataId(orderResult.body);

  const orderItem = await prisma.purchaseOrderItem.findFirst({
    where: { tenantId: ctx.tenantAId, orderId, productId: ctx.productAId },
    select: { id: true },
  });
  if (!orderItem) throw new Error('Satinalma siparisi kalemi bulunamadi.');

  const sendResult = await api('POST', `/api/purchase-orders/${orderId}/send`, token(ctx.ownerAId, ctx.tenantAId));
  assertStatus(sendResult, 200, 'satinalma siparisi gonderilebilmeli');

  const receiveResult = await api('POST', `/api/purchase-orders/${orderId}/receive`, token(ctx.ownerAId, ctx.tenantAId), {
    warehouseId: ctx.warehouseAId,
    items: [{ itemId: orderItem.id, receivedQty: 3 }],
  });
  assertStatus(receiveResult, 200, 'satinalma siparisi teslim alinabilmeli');

  const receivedOrder = await prisma.purchaseOrder.findFirst({
    where: { tenantId: ctx.tenantAId, id: orderId },
    select: { status: true, items: { select: { received: true } } },
  });
  if (!receivedOrder || receivedOrder.status !== PurchaseOrderStatus.RECEIVED) {
    throw new Error('Satinalma teslimi sonrasi siparis RECEIVED olmadi.');
  }
  const receivedQty = receivedOrder.items.reduce((sum, item) => sum + Number(item.received), 0);
  if (receivedQty !== 3) throw new Error('Satinalma siparisi kalem teslim miktari guncellenmedi.');

  const afterStock = await prisma.stockLevel.findFirst({
    where: { tenantId: ctx.tenantAId, productId: ctx.productAId, warehouseId: ctx.warehouseAId },
    select: { quantity: true },
  });
  if (Number(afterStock?.quantity ?? 0) !== beforeQty + 3) {
    throw new Error('Satinalma teslimi stok seviyesini beklenen miktarda artirmadi.');
  }

  const invoiceResult = await api('POST', '/api/invoices', token(ctx.ownerAId, ctx.tenantAId), {
    contactId: ctx.contactAId,
    purchaseOrderId: orderId,
    type: InvoiceType.PURCHASE,
    date: '2026-05-26',
    lines: [{ productId: ctx.productAId, description: 'Purchase chain invoice', quantity: 3, unitPrice: 40 }],
  });
  assertStatus(invoiceResult, 201, 'satinalma siparisinden fatura olusturulabilmeli');
  const invoiceId = readDataId(invoiceResult.body);

  const accountEntry = await prisma.accountEntry.findFirst({
    where: { tenantId: ctx.tenantAId, refType: 'INVOICE', refId: invoiceId },
    select: { credit: true },
  });
  if (!accountEntry || Number(accountEntry.credit) !== 120) {
    throw new Error('Satinalma faturasi muhasebe alacak kaydi olusturmadi.');
  }
}

async function testDataImportPartialFailurePlan(ctx: TestContext): Promise<void> {
  const result = await api('POST', '/api/data-exchange/import/preview/contacts', token(ctx.ownerAId, ctx.tenantAId), {
    csv: 'type,code,name,email\nCUSTOMER,IT-IMPORT-OK,Valid Import,valid-import@example.com\nCUSTOMER,IT-IMPORT-BAD,,bad-import@example.com\n',
    mapping: {},
    partialImport: true,
  });
  assertStatus(result, 200, 'partial import preview calismali');
  const data = readDataRecord(result.body);
  if (readNumberField(data, 'validRows') !== 1 || readNumberField(data, 'invalidRows') !== 1) {
    throw new Error('Partial import preview satir hata/valid sayilarini dogru hesaplamadi.');
  }
  const batchPlan = data.batchPlan;
  if (!isRecord(batchPlan) || batchPlan.canImportValidRows !== true || batchPlan.rollbackAvailable !== false) {
    throw new Error('Partial import preview batch plan/rollback bilgisini dogru uretmedi.');
  }
}

async function testApiKeyScopeAndTenantIsolation(ctx: TestContext): Promise<void> {
  const rawKey = `it_${crypto.randomBytes(18).toString('hex')}`;
  await prisma.apiKey.create({
    data: {
      tenantId: ctx.tenantAId,
      name: 'Integration External Read',
      keyHash: crypto.createHash('sha256').update(rawKey).digest('hex'),
      keyPrefix: rawKey.slice(0, 8),
      scopes: ['products:read'],
      createdById: ctx.ownerAId,
    },
  });

  const productsResult = await apiKeyRequest('GET', '/api/external/products', rawKey);
  assertStatus(productsResult, 200, 'external products api key ile okunabilmeli');
  const productsData = readDataArray(productsResult.body);
  if (productsData.some((product) => readStringField(product, 'id') === ctx.productBId)) {
    throw new Error('External products API tenant B urununu sizdirdi.');
  }

  const otherTenantProductResult = await apiKeyRequest('GET', `/api/external/products/${ctx.productBId}`, rawKey);
  assertStatus(otherTenantProductResult, 404, 'external api baska tenant urun id icin 404 donmeli');

  const contactsResult = await apiKeyRequest('GET', '/api/external/contacts', rawKey);
  assertStatus(contactsResult, 403, 'external api eksik scope icin 403 donmeli');
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

async function testDomainEventCoverageAndDeadLetterReplay(ctx: TestContext): Promise<void> {
  const coverageResult = await api('GET', '/api/domain-events/coverage', token(ctx.ownerAId, ctx.tenantAId));
  assertStatus(coverageResult, 200, 'domain event coverage raporu listelenebilmeli');
  const coverageData = readDataRecord(coverageResult.body);
  if (readNumberField(coverageData, 'schemaVersion') < 1 || !Array.isArray(coverageData.publishCoverage)) {
    throw new Error('Domain event coverage raporu schemaVersion/publishCoverage dondurmedi.');
  }

  const source = `domain:stock.low:${ctx.productAId}:${ctx.warehouseAId}`;
  const outbox = await prisma.domainEventOutbox.create({
    data: {
      tenantId: ctx.tenantAId,
      name: 'stock.low',
      schemaVersion: 1,
      source,
      idempotencyKey: source,
      entityType: EntityType.PRODUCT,
      entityId: ctx.productAId,
      payload: {
        productId: ctx.productAId,
        productCode: 'IT-STOCK',
        productName: 'Integration Product',
        currentQuantity: 0,
        minStockLevel: 5,
        warehouseId: ctx.warehouseAId,
      },
      context: {
        tenantId: ctx.tenantAId,
        userId: ctx.ownerAId,
        occurredAt: new Date().toISOString(),
      },
      status: DomainEventOutboxStatus.DEAD_LETTER,
      attempts: 3,
      lastError: 'integration replay marker',
    },
    select: { id: true },
  });

  const replayResult = await api('POST', `/api/domain-events/${outbox.id}/replay`, token(ctx.ownerAId, ctx.tenantAId));
  assertStatus(replayResult, 200, 'dead-letter domain event replay edilebilmeli');
  const replayData = readDataRecord(replayResult.body);
  if (replayData.replayed !== true || replayData.afterStatus !== DomainEventOutboxStatus.PROCESSED) {
    throw new Error('Dead-letter replay event statusunu PROCESSED yapmadi.');
  }

  const task = await prisma.task.findFirst({
    where: { tenantId: ctx.tenantAId, source },
    select: { id: true },
  });
  if (!task) throw new Error('Dead-letter replay workflow listener idempotent task uretmedi.');
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
    console.log('Integration: data exchange tenant isolation');
    await testDataExchangeTenantIsolation(ctx);
    console.log('Integration: reporting tenant isolation');
    await testReportingTenantIsolation(ctx);
    console.log('Integration: permission denied');
    await testPermissionDenied(ctx);
    console.log('Integration: permission simulator smoke');
    await testPermissionSimulatorSmoke(ctx);
    console.log('Integration: invoice account entry');
    const invoiceId = await testInvoiceCreatesAccountEntry(ctx);
    console.log('Integration: closed fiscal period');
    await testClosedFiscalPeriodBlocksInvoice(ctx);
    console.log('Integration: payment allocation');
    await testPaymentAllocation(ctx, invoiceId);
    console.log('Integration: payment allocation reconciliation');
    await testPaymentAllocationCannotExceedInvoiceTotal(ctx, invoiceId);
    console.log('Integration: invoice cancel reverse accounting');
    await testInvoiceCancelCreatesReverseEntry(ctx);
    console.log('Integration: domain event outbox');
    await testDomainEventOutbox(ctx);
    console.log('Integration: domain event idempotency');
    await testDomainEventIdempotency(ctx);
    console.log('Integration: domain event coverage and dead-letter replay');
    await testDomainEventCoverageAndDeadLetterReplay(ctx);
    console.log('Integration: stock movement');
    await testStockMovementUpdatesLevel(ctx);
    console.log('Integration: sales order delivery invoice chain');
    await testSalesOrderDeliveryInvoiceChain(ctx);
    console.log('Integration: purchase order receipt invoice chain');
    await testPurchaseOrderReceiptInvoiceChain(ctx);
    console.log('Integration: production execution');
    await testProductionExecutionFlow(ctx);
    console.log('Integration: attachment tenant validation');
    await testAttachmentTenantValidation(ctx);
    console.log('Integration: data import partial failure plan');
    await testDataImportPartialFailurePlan(ctx);
    console.log('Integration: external API key scope and tenant isolation');
    await testApiKeyScopeAndTenantIsolation(ctx);
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
