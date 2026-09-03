process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-jwt-secret';
process.env.ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'integration-test-admin-secret';
process.env.ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || 'http://localhost:3000';
process.env.MARKETPLACE_WORKER_ENABLED = 'false';

import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import {
  AppModule,
  ContactType,
  DeliveryNoteType,
  DomainEventOutboxStatus,
  EntityType,
  FiscalPeriodStatus,
  InvoiceStatus,
  InvoiceType,
  MovementType,
  MarketplaceChannel,
  OrderStatus,
  PaymentMethod,
  PermissionAction,
  Plan,
  PurchaseOrderStatus,
  TenantStatus,
  SyncJobStatus,
  SyncJobType,
  WorkOrderStatus,
} from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { runWithTenantScope } from '../src/lib/tenant-isolation-context';
import { createSecuritySession } from '../src/services/security-hardening.service';
import { createApiKeyHash } from '../src/utils/api-key-hash';
import { processDomainEventOutboxBatch } from '../src/services/domain-event-outbox-worker.service';
import { processPendingJobs, TrendyolWorker } from '../src/services/trendyol-worker.service';

interface TestContext {
  tenantAId: string;
  tenantBId: string;
  ownerAId: string;
  ownerBId: string;
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

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

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

function sessionToken(userId: string, tenantId: string, sessionId: string): string {
  return jwt.sign({ userId, tenantId, sessionId }, process.env.JWT_SECRET as string, { expiresIn: '10m' });
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

async function testPrometheusMetricsEndpoint(): Promise<void> {
  const { app } = await withTimeout('app import', import('../src/index.js'));
  const previousNodeEnv = process.env.NODE_ENV;
  const previousToken = process.env.METRICS_BEARER_TOKEN;
  process.env.NODE_ENV = 'test';
  delete process.env.METRICS_BEARER_TOKEN;
  const response = await withTimeout('GET /metrics', Promise.resolve(app.request('/metrics')));
  const body = await response.text();
  if (response.status !== 200 || !response.headers.get('content-type')?.includes('text/plain')) {
    throw new Error('Prometheus metrics endpoint scrape edilebilir formatta donmedi.');
  }
  if (!body.includes('axon_http_requests_total') || !body.includes('axon_outbox_pending')) {
    throw new Error('Prometheus metrics endpoint zorunlu uygulama metriklerini icermiyor.');
  }
  if (body.includes('tenantId') || body.includes('userId')) {
    throw new Error('Prometheus metrics endpoint hassas veya yuksek-cardinality kimlik etiketi sizdiriyor.');
  }

  process.env.NODE_ENV = 'production';
  process.env.METRICS_BEARER_TOKEN = 'integration-metrics-token';
  try {
    const unauthorized = await app.request('/metrics');
    if (unauthorized.status !== 401) throw new Error('Production metrics endpoint token olmadan erisime izin verdi.');
    const authorized = await app.request('/metrics', {
      headers: { authorization: 'Bearer integration-metrics-token' },
    });
    if (authorized.status !== 200) throw new Error('Production metrics endpoint gecerli bearer tokeni reddetti.');
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousToken === undefined) delete process.env.METRICS_BEARER_TOKEN;
    else process.env.METRICS_BEARER_TOKEN = previousToken;
  }
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
      modules: [
        AppModule.CONTACTS,
        AppModule.INVOICING,
        AppModule.ACCOUNTING,
        AppModule.INVENTORY,
        AppModule.PRODUCTION,
        AppModule.REPORTING,
        AppModule.PURCHASING,
        AppModule.APPROVALS,
        AppModule.DOCUMENTS,
        AppModule.WORKFLOW,
        AppModule.HR,
        AppModule.PAYROLL,
      ],
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
    ownerBId: tenantB.owner.id,
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
  await prisma.recordCollaborationEntry.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.recordFollower.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.notification.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.task.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.automationExecution.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.automationRule.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.domainEventOutbox.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.marketplaceSyncJob.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
  await prisma.marketplaceIntegration.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
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

async function testSessionAuthenticationKeepsTenantScope(ctx: TestContext): Promise<void> {
  const session = await runWithTenantScope(ctx.tenantAId, () => createSecuritySession(
    prisma,
    ctx.tenantAId,
    ctx.ownerAId,
    { ipAddress: '127.0.0.1', userAgent: 'integration-test' },
  ));
  const result = await api(
    'GET',
    '/api/invoices',
    sessionToken(ctx.ownerAId, ctx.tenantAId, session.id),
  );
  assertStatus(result, 200, 'session dogrulamasi tenant scope icinde calismali');
}

async function testRepositoryBackedQueries(ctx: TestContext): Promise<void> {
  const bearerToken = token(ctx.ownerAId, ctx.tenantAId);
  const cases = [
    ['/api/payments?limit=5', 'payment repository query'],
    ['/api/stock/levels?belowMin=true', 'stock level repository query'],
    ['/api/sales-orders/quotes?limit=5', 'sales quote repository query'],
    ['/api/payroll?limit=5', 'payroll repository query'],
    ['/api/tasks/today', 'today work queue repository query'],
  ] as const;

  for (const [path, label] of cases) {
    const result = await api('GET', path, bearerToken);
    assertStatus(result, 200, `${label} calismali`);
  }

  await prisma.task.create({ data: { tenantId: ctx.tenantBId, title: 'TENANT-B-TODAY-QUEUE-MARKER', status: 'TODO' } });
  const queueResult = await api('GET', '/api/tasks/today', bearerToken);
  if (JSON.stringify(queueResult.body).includes('TENANT-B-TODAY-QUEUE-MARKER')) {
    throw new Error('Today work queue tenant B gorevini sizdirdi.');
  }
}

async function testAutomationAssistantFlow(ctx: TestContext): Promise<void> {
  await prisma.automationRule.create({
    data: {
      tenantId: ctx.tenantBId,
      name: 'TENANT-B-AUTOMATION-MARKER',
      module: 'inventory',
      trigger: 'LOW_STOCK',
      action: 'CREATE_TASK',
      isActive: true,
    },
  });

  const policyUpdate = await api(
    'PUT',
    '/api/automation-rules/governance/policy',
    token(ctx.ownerAId, ctx.tenantAId),
    { approvalThreshold: 50000, minimumAutomaticConfidence: 0.9 },
  );
  assertStatus(policyUpdate, 200, 'automation governance policy guncellenebilmeli');

  const preview = await api(
    'POST',
    '/api/automation-rules/assistant/preview',
    token(ctx.ownerAId, ctx.tenantAId),
    { prompt: 'Stok minimum altina dusunce gorev olustur' },
  );
  assertStatus(preview, 200, 'automation assistant preview calismali');
  const serializedPreview = JSON.stringify(preview.body);
  if (serializedPreview.includes('TENANT-B-AUTOMATION-MARKER')) {
    throw new Error('Automation assistant tenant B kuralini conflict olarak sizdirdi.');
  }
  if (!serializedPreview.includes('"isActive":false') || !serializedPreview.includes('"recommendedMode":"SUGGESTION"')) {
    throw new Error('Automation assistant guvenli pasif oneri contractini dondurmedi.');
  }
  if (!serializedPreview.includes('"decision"') || !serializedPreview.includes('"approvalThreshold":50000') || !serializedPreview.includes('"dryRun":true')) {
    throw new Error('Automation assistant tenant guven politikasi ve karar aciklamasini dondurmedi.');
  }

  const createResult = await api(
    'POST',
    '/api/automation-rules',
    token(ctx.ownerAId, ctx.tenantAId),
    {
      name: 'Integration assistant suggestion',
      description: 'Integration dry-run suggestion',
      module: 'inventory',
      trigger: 'LOW_STOCK',
      action: 'CREATE_TASK',
      conditions: { minStockRequired: true },
      actionConfig: { priorityPolicy: 'deficit_based' },
      isActive: false,
    },
  );
  assertStatus(createResult, 201, 'automation assistant taslagi olusturulabilmeli');
  const created = await prisma.automationRule.findFirst({
    where: { tenantId: ctx.tenantAId, name: 'Integration assistant suggestion' },
    select: { id: true, isActive: true },
  });
  if (!created || created.isActive) throw new Error('Automation assistant taslagi pasif kaydedilmedi.');

  await prisma.automationRule.updateMany({ where: { id: created.id, tenantId: ctx.tenantAId }, data: { isActive: true } });
  const runResult = await api('POST', `/api/automation-rules/${created.id}/run`, token(ctx.ownerAId, ctx.tenantAId));
  assertStatus(runResult, 200, 'automation rule guven gunluguyle calismali');
  const executions = await api('GET', '/api/automation-rules/executions', token(ctx.ownerAId, ctx.tenantAId));
  assertStatus(executions, 200, 'automation execution guven gunlugu okunabilmeli');
  const serializedExecutions = JSON.stringify(executions.body);
  if (!serializedExecutions.includes('"decision"') || !serializedExecutions.includes('"idempotencyKey"') || !serializedExecutions.includes('"compensation"')) {
    throw new Error('Automation execution ortak karar aciklamasi contractini dondurmedi.');
  }
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
    data: { modules: originalModules.filter((module) => module !== AppModule.INVENTORY) },
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

  const workspaceResult = await api('GET', `/api/sales-orders/${orderId}/process-workspace`, token(ctx.ownerAId, ctx.tenantAId));
  assertStatus(workspaceResult, 200, 'satis is dosyasi okunabilmeli');
  const workspace = readDataRecord(workspaceResult.body);
  const progress = workspace.progress;
  if (!isRecord(progress) || readNumberField(progress, 'deliveryPercent') !== 100 || readNumberField(progress, 'invoicedPercent') !== 100) {
    throw new Error('Satis is dosyasi teslimat ve faturalama ilerlemesini dogru hesaplamadi.');
  }

  const crossTenantWorkspace = await api('GET', `/api/sales-orders/${orderId}/process-workspace`, token(ctx.ownerBId, ctx.tenantBId));
  assertStatus(crossTenantWorkspace, 404, 'satis is dosyasi tenant disina sizmamali');
}

async function testDataDeduplicationMergeAndRollback(ctx: TestContext): Promise<void> {
  const source = await prisma.contact.create({ data: { tenantId: ctx.tenantAId, type: ContactType.CUSTOMER, name: 'Dedup Acme Limited', code: `DEDUP-S-${crypto.randomUUID()}`, taxNumber: 'DEDUP-123', email: 'source@dedup.test' } });
  const target = await prisma.contact.create({ data: { tenantId: ctx.tenantAId, type: ContactType.CUSTOMER, name: 'Dedup Acme Ltd', code: `DEDUP-T-${crypto.randomUUID()}`, taxNumber: 'DEDUP-123', email: 'target@dedup.test' } });
  const entry = await prisma.accountEntry.create({ data: { tenantId: ctx.tenantAId, contactId: source.id, date: new Date(), debit: 10, credit: 0, balance: 10, description: 'dedup reference marker' } });
  const bearerToken = token(ctx.ownerAId, ctx.tenantAId);
  const crossTenantPreview = await api('POST', '/api/data-exchange/quality/duplicates/contacts/preview', bearerToken, { sourceId: ctx.contactBId, targetId: target.id, fieldWinners: {} });
  assertStatus(crossTenantPreview, 404, 'tenant disi cari merge onizlemesine girememeli');
  const scan = await api('GET', '/api/data-exchange/quality/duplicates/contacts', bearerToken);
  assertStatus(scan, 200, 'mukerrer cari taramasi calismali');
  if (!JSON.stringify(scan.body).includes(source.id) || !JSON.stringify(scan.body).includes(target.id)) throw new Error('Mükerrer cari adayi bulunamadi.');
  const input = { sourceId: source.id, targetId: target.id, fieldWinners: { email: 'source' } };
  const preview = await api('POST', '/api/data-exchange/quality/duplicates/contacts/preview', bearerToken, input);
  assertStatus(preview, 200, 'cari merge onizlemesi calismali');
  if (!JSON.stringify(preview.body).includes('"totalReferences":1')) throw new Error('Cari merge referans sayisi yanlis.');
  const merged = await api('POST', '/api/data-exchange/quality/duplicates/contacts/merge', bearerToken, input);
  assertStatus(merged, 200, 'cari merge calismali');
  const mergedData = readDataRecord(merged.body);
  const auditLogId = readStringField(mergedData, 'auditLogId');
  const movedEntry = await prisma.accountEntry.findFirst({ where: { tenantId: ctx.tenantAId, id: entry.id }, select: { contactId: true } });
  if (movedEntry?.contactId !== target.id) throw new Error('Cari merge referansi hedefe tasimadi.');
  const deletedSource = await prisma.contact.findFirst({ where: { tenantId: ctx.tenantAId, id: source.id }, select: { deletedAt: true, isActive: true } });
  if (!deletedSource?.deletedAt || deletedSource.isActive) throw new Error('Cari merge kaynak kaydi pasif soft-delete yapmadi.');
  await prisma.contact.updateMany({ where: { tenantId: ctx.tenantAId, id: target.id }, data: { city: 'Merge sonrasi degisiklik' } });
  const staleRollback = await api('POST', `/api/data-exchange/quality/duplicates/contacts/rollback/${auditLogId}`, bearerToken);
  assertStatus(staleRollback, 400, 'rollback merge sonrasindaki hedef degisikligini ezmemeli');
  await prisma.contact.updateMany({ where: { tenantId: ctx.tenantAId, id: target.id }, data: { city: null } });
  const rollback = await api('POST', `/api/data-exchange/quality/duplicates/contacts/rollback/${auditLogId}`, bearerToken);
  assertStatus(rollback, 200, 'cari merge rollback calismali');
  const restoredEntry = await prisma.accountEntry.findFirst({ where: { tenantId: ctx.tenantAId, id: entry.id }, select: { contactId: true } });
  if (restoredEntry?.contactId !== source.id) throw new Error('Cari merge rollback referansi kaynaga dondurmedi.');
  const restoredSource = await prisma.contact.findFirst({ where: { tenantId: ctx.tenantAId, id: source.id }, select: { deletedAt: true, isActive: true } });
  if (restoredSource?.deletedAt || !restoredSource?.isActive) throw new Error('Cari merge rollback kaynak kaydi geri acmadi.');
  const repeatedRollback = await api('POST', `/api/data-exchange/quality/duplicates/contacts/rollback/${auditLogId}`, bearerToken);
  assertStatus(repeatedRollback, 400, 'ayni cari merge rollback ikinci kez calismamali');
}

async function testBulkImportAssistanceFlow(ctx: TestContext): Promise<void> {
  const tenantAToken = token(ctx.ownerAId, ctx.tenantAId);
  const tenantBToken = token(ctx.ownerBId, ctx.tenantBId);
  const mappings = [
    { source: 'Stok Kodu', target: 'code', confidence: 1, learned: true },
    { source: 'Satış Fiyatı', target: 'salesPrice', confidence: 1, learned: true },
  ];
  const saveA = await api('POST', '/api/bulk-operations/imports/profiles', tenantAToken, {
    name: 'Tenant A ürün eşlemesi', target: 'products', headers: ['Stok Kodu', 'Satış Fiyatı'], mappings,
  });
  assertStatus(saveA, 201, 'bulk import esleme profili kaydedilebilmeli');
  const saveB = await api('POST', '/api/bulk-operations/imports/profiles', tenantBToken, {
    name: 'TENANT-B-BULK-PROFILE-MARKER', target: 'products', headers: ['Kod'],
    mappings: [{ source: 'Kod', target: 'code', confidence: 1, learned: true }],
  });
  assertStatus(saveB, 201, 'tenant B bulk import profili kaydedilebilmeli');

  const profiles = await api('GET', '/api/bulk-operations/imports/profiles', tenantAToken);
  assertStatus(profiles, 200, 'bulk import profilleri listelenebilmeli');
  if (JSON.stringify(profiles.body).includes('TENANT-B-BULK-PROFILE-MARKER')) {
    throw new Error('Bulk import profilleri tenant B verisini sizdirdi.');
  }

  const analysis = await api('POST', '/api/bulk-operations/imports/analyze', tenantAToken, {
    target: 'products', headers: ['Stok Kodu', 'Satış Fiyatı'],
    rows: [{ 'Stok Kodu': 'P-1', 'Satış Fiyatı': '1.250,50' }, { 'Stok Kodu': 'P-1', 'Satış Fiyatı': '20' }],
  });
  assertStatus(analysis, 200, 'bulk import analizi calismali');
  const serialized = JSON.stringify(analysis.body);
  if (!serialized.includes('"salesPrice":1250.5') || !serialized.includes('"duplicateCandidates":1')) {
    throw new Error('Bulk import normalizasyon veya mukerrer analizi contracti bozuk.');
  }
  if (!serialized.includes('"status":"planning_only"') || !serialized.includes('"resumeSupported":false')) {
    throw new Error('Bulk import worker hazirlik durumu dogru raporlanmadi.');
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
      keyHash: createApiKeyHash(rawKey),
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

async function testAtomicOutboxClaim(ctx: TestContext): Promise<void> {
  const marker = crypto.randomUUID();
  const source = `domain:stock.low:${marker}`;
  const event = await prisma.domainEventOutbox.create({
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
        productCode: 'IT-ATOMIC',
        productName: 'Atomic Claim Product',
        currentQuantity: 0,
        minStockLevel: 5,
        warehouseId: ctx.warehouseAId,
      },
      context: { tenantId: ctx.tenantAId, userId: ctx.ownerAId, occurredAt: new Date().toISOString() },
      status: DomainEventOutboxStatus.PENDING,
    },
    select: { id: true },
  });

  await Promise.all([processDomainEventOutboxBatch(100), processDomainEventOutboxBatch(100)]);
  const processed = await prisma.domainEventOutbox.findFirst({
    where: { id: event.id, tenantId: ctx.tenantAId },
    select: { status: true, attempts: true, leaseOwner: true, leaseExpiresAt: true },
  });
  if (!processed || processed.status !== DomainEventOutboxStatus.PROCESSED || processed.attempts !== 1) {
    throw new Error('Atomic outbox claim ayni eventi tek worker yerine birden fazla kez sahiplendi.');
  }
  if (processed.leaseOwner !== null || processed.leaseExpiresAt !== null) {
    throw new Error('Islenen outbox event lease bilgisi temizlenmedi.');
  }
}

async function testAtomicMarketplaceClaim(ctx: TestContext): Promise<void> {
  const integration = await prisma.marketplaceIntegration.create({
    data: {
      tenantId: ctx.tenantAId,
      channel: MarketplaceChannel.TRENDYOL,
      name: 'Atomic worker integration',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      storeId: '12345',
    },
    select: { id: true },
  });
  const jobId = await runWithTenantScope(ctx.tenantAId, () =>
    TrendyolWorker.enqueue(ctx.tenantAId, integration.id, SyncJobType.SYNC_STOCK),
  );

  await Promise.all([processPendingJobs(ctx.tenantAId), processPendingJobs(ctx.tenantAId)]);
  const job = await prisma.marketplaceSyncJob.findFirst({
    where: { id: jobId, tenantId: ctx.tenantAId },
    select: { status: true, attempts: true, leaseOwner: true, leaseExpiresAt: true },
  });
  if (!job || job.status !== SyncJobStatus.DONE || job.attempts !== 1) {
    throw new Error('Atomic marketplace claim ayni job icin tek worker sahipligini koruyamadi.');
  }
  if (job.leaseOwner !== null || job.leaseExpiresAt !== null) {
    throw new Error('Tamamlanan marketplace job lease bilgisi temizlenmedi.');
  }
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

async function testNavigationWorkspaceFlow(ctx: TestContext): Promise<void> {
  const ownerToken = token(ctx.ownerAId, ctx.tenantAId);
  await prisma.tenantUser.updateMany({
    where: { tenantId: ctx.tenantAId, userId: ctx.ownerAId },
    data: { preferences: { unrelatedPreference: { preserved: true } } },
  });

  const initial = await api('GET', '/api/navigation-workspace', ownerToken);
  assertStatus(initial, 200, 'navigation workspace yuklenebilmeli');
  const initialData = readDataRecord(initial.body);
  if (initialData.allowedModules !== '*') throw new Error('Tenant sahibi navigation workspace tam erisim almadi.');

  const updated = await api('PATCH', '/api/navigation-workspace/preferences', ownerToken, {
    persona: 'FINANCE',
    favoriteHrefs: ['/dashboard/payments', '/external/unsafe'],
    hiddenModules: ['inventory', 'unknown'],
  });
  assertStatus(updated, 200, 'navigation tercihleri kaydedilebilmeli');
  const updatedData = readDataRecord(updated.body);
  if (!Array.isArray(updatedData.favoriteHrefs) || updatedData.favoriteHrefs.includes('/external/unsafe')) {
    throw new Error('Navigation tercihleri guvensiz hedefi filtrelemedi.');
  }

  const activity = await api('POST', '/api/navigation-workspace/activity', ownerToken, { href: '/dashboard/payments?status=open' });
  assertStatus(activity, 204, 'navigation kullanimi kaydedilebilmeli');
  const stored = await prisma.tenantUser.findFirst({ where: { tenantId: ctx.tenantAId, userId: ctx.ownerAId }, select: { preferences: true } });
  if (!isRecord(stored?.preferences) || !isRecord(stored.preferences.unrelatedPreference)) {
    throw new Error('Navigation kaydi diger kullanici tercihlerini ezdi.');
  }

  const limitedMember = await prisma.tenantUser.findFirst({ where: { tenantId: ctx.tenantAId, userId: ctx.limitedAId }, select: { roleId: true } });
  if (!limitedMember?.roleId) throw new Error('Navigation profil testi icin rol bulunamadi.');
  const denied = await api('PUT', `/api/navigation-workspace/profiles/${limitedMember.roleId}`, token(ctx.limitedAId, ctx.tenantAId), { persona: 'SALES', favoriteHrefs: [], hiddenModules: [] });
  assertStatus(denied, 403, 'tenant sahibi olmayan kullanici profil dagitamamali');

  const foreignRole = await prisma.role.create({ data: { tenantId: ctx.tenantBId, name: `Foreign navigation ${crypto.randomUUID()}` }, select: { id: true } });
  const foreign = await api('PUT', `/api/navigation-workspace/profiles/${foreignRole.id}`, ownerToken, { persona: 'SALES', favoriteHrefs: [], hiddenModules: [] });
  assertStatus(foreign, 404, 'baska tenant rolu icin navigation profili dagitilmamali');

  const distributed = await api('PUT', `/api/navigation-workspace/profiles/${limitedMember.roleId}`, ownerToken, { persona: 'SALES', favoriteHrefs: ['/dashboard/sales-orders'], hiddenModules: [] });
  assertStatus(distributed, 200, 'tenant sahibi rol navigation profilini dagitabilmeli');
}

async function testNotificationAttentionFlow(ctx: TestContext): Promise<void> {
  const ownerToken = token(ctx.ownerAId, ctx.tenantAId);
  const summary = await api('GET', '/api/notifications/attention', ownerToken);
  assertStatus(summary, 200, 'bildirim dikkat ozeti yuklenebilmeli');
  const summaryData = readDataRecord(summary.body);
  if (!isRecord(summaryData.preferences) || !Array.isArray(summaryData.groupedSystemNotifications)) {
    throw new Error('Bildirim dikkat ozeti contract ile uyusmuyor.');
  }

  const preferences = {
    quietHours: { enabled: true, start: '21:00', end: '07:30', timezone: 'Europe/Istanbul' },
    digest: { cadence: 'WEEKLY', hour: 10, weekday: 1 },
    channels: { inApp: true, email: true },
    mutedModules: ['mail'],
    escalation: { enabled: true, afterHours: 12, targetRoleId: null },
  };
  const updated = await api('PUT', '/api/notifications/attention/preferences', ownerToken, preferences);
  assertStatus(updated, 200, 'bildirim dikkat tercihleri kaydedilebilmeli');
  const foreignRole = await prisma.role.findFirst({ where: { tenantId: ctx.tenantBId }, select: { id: true } });
  if (!foreignRole) throw new Error('Bildirim eskalasyon tenant testi icin rol bulunamadi.');
  const foreignEscalation = await api('PUT', '/api/notifications/attention/preferences', ownerToken, {
    ...preferences,
    escalation: { ...preferences.escalation, targetRoleId: foreignRole.id },
  });
  assertStatus(foreignEscalation, 200, 'baska tenant eskalasyon rolu guvenli bicimde reddedilmeli');
  const foreignEscalationData = readDataRecord(foreignEscalation.body);
  if (!isRecord(foreignEscalationData.escalation) || foreignEscalationData.escalation.targetRoleId !== null) {
    throw new Error('Baska tenant rolu eskalasyon hedefi olarak saklandi.');
  }
  const event = await api('POST', '/api/notifications/attention/events', ownerToken, { event: 'ACTION' });
  assertStatus(event, 204, 'bildirim dikkat etkinligi kaydedilebilmeli');

  const stored = await prisma.tenantUser.findFirst({ where: { tenantId: ctx.tenantAId, userId: ctx.ownerAId }, select: { preferences: true } });
  if (!isRecord(stored?.preferences) || !isRecord(stored.preferences.notificationAttention) || !isRecord(stored.preferences.navigationWorkspace)) {
    throw new Error('Bildirim dikkat tercihleri diger kullanici tercihlerini ezdi.');
  }
  const metrics = stored.preferences.notificationAttention.metrics;
  if (!isRecord(metrics) || metrics.actions !== 1) throw new Error('Bildirim dikkat etkinligi olculemedi.');

  const invalid = await api('PUT', '/api/notifications/attention/preferences', ownerToken, { digest: { cadence: 'INVALID' } });
  assertStatus(invalid, 400, 'gecersiz bildirim dikkat tercihleri reddedilmeli');
}

async function testFinanceOperationsFlow(ctx: TestContext): Promise<void> {
  const ownerToken = token(ctx.ownerAId, ctx.tenantAId);
  const foreignBefore = await prisma.tenantSetting.findFirst({ where: { tenantId: ctx.tenantBId, key: 'finance.operations.auto_match_confidence' }, select: { value: true } });
  const workspace = await api('GET', '/api/financial-autonomy/operations', ownerToken);
  assertStatus(workspace, 200, 'finans operasyon calisma alani yuklenebilmeli');
  const workspaceData = readDataRecord(workspace.body);
  if (!isRecord(workspaceData.summary) || !Array.isArray(workspaceData.exceptions) || !Array.isArray(workspaceData.recurringPatterns)) {
    throw new Error('Finans operasyon calisma alani contract ile uyusmuyor.');
  }

  const updated = await api('PUT', '/api/financial-autonomy/operations/policy', ownerToken, {
    autoProcessEnabled: false,
    autoMatchMinConfidence: 10,
    feedStaleHours: 0,
    duplicateWindowDays: 200,
  });
  assertStatus(updated, 200, 'finans operasyon politikasi kaydedilebilmeli');
  const updatedData = readDataRecord(updated.body);
  if (updatedData.autoMatchMinConfidence !== 75 || updatedData.feedStaleHours !== 1 || updatedData.duplicateWindowDays !== 90) {
    throw new Error('Finans operasyon politikasi guvenli sinirlara alinmadi.');
  }

  const run = await api('POST', '/api/financial-autonomy/operations/run', ownerToken);
  assertStatus(run, 200, 'finans operasyon akisi calistirilabilmeli');
  const runData = readDataRecord(run.body);
  if (runData.scanned !== 0 || runData.processed !== 0) throw new Error('Kapali finans otomasyonu kayit isledi.');
  const scheduled = await api('POST', '/api/automation-rules/scheduler/run', ownerToken, { jobKey: 'bank_auto_match' });
  assertStatus(scheduled, 200, 'zamanlanmis banka eslestirme politikaya gore calisabilmeli');
  const scheduledData = readDataRecord(scheduled.body);
  const scheduledItem = Array.isArray(scheduledData.items) ? scheduledData.items[0] : null;
  if (!isRecord(scheduledItem) || scheduledItem.status !== 'SKIPPED' || scheduledItem.changed !== 0) {
    throw new Error('Zamanlanmis banka eslestirme kapali tenant politikasini uygulamadi.');
  }

  const foreignSetting = await prisma.tenantSetting.findFirst({ where: { tenantId: ctx.tenantBId, key: 'finance.operations.auto_match_confidence' }, select: { value: true } });
  if (foreignSetting?.value !== foreignBefore?.value) throw new Error('Finans operasyon politikasi baska tenant verisini degistirdi.');
  const invalid = await api('PUT', '/api/financial-autonomy/operations/policy', ownerToken, { autoProcessEnabled: true });
  assertStatus(invalid, 400, 'gecersiz finans operasyon politikasi reddedilmeli');
}

async function testReplenishmentPlanningFlow(ctx: TestContext): Promise<void> {
  const ownerToken = token(ctx.ownerAId, ctx.tenantAId);
  const foreignBefore = await prisma.tenantSetting.findFirst({
    where: { tenantId: ctx.tenantBId, key: 'procurement.planning.horizon_days' },
    select: { value: true },
  });
  const workspace = await api('GET', '/api/procurement-autonomy/planning-workspace', ownerToken);
  assertStatus(workspace, 200, 'ikmal planlama calisma alani yuklenebilmeli');
  const workspaceData = readDataRecord(workspace.body);
  if (!isRecord(workspaceData.summary) || !isRecord(workspaceData.policy) || !Array.isArray(workspaceData.recommendations)) {
    throw new Error('Ikmal planlama calisma alani contract ile uyusmuyor.');
  }

  const updated = await api('PUT', '/api/procurement-autonomy/planning-policy', ownerToken, {
    lookbackDays: 1,
    horizonDays: 999,
    targetServiceLevel: 20,
    autoCreateDrafts: false,
    maximumDraftValue: -5,
  });
  assertStatus(updated, 200, 'ikmal politikasi kaydedilebilmeli');
  const policy = readDataRecord(updated.body);
  if (policy.lookbackDays !== 30 || policy.horizonDays !== 120 || policy.targetServiceLevel !== 85 || policy.maximumDraftValue !== 0) {
    throw new Error('Ikmal politikasi guvenli sinirlara alinmadi.');
  }

  const beforeDraftCount = await prisma.purchaseOrder.count({ where: { tenantId: ctx.tenantAId, status: PurchaseOrderStatus.DRAFT } });
  const run = await api('POST', '/api/procurement-autonomy/planning-run', ownerToken);
  assertStatus(run, 200, 'ikmal planlama akisi calistirilabilmeli');
  const runData = readDataRecord(run.body);
  if (!Array.isArray(runData.createdDrafts) || runData.createdDrafts.length !== 0) throw new Error('Kapali ikmal politikasi taslak olusturdu.');
  const afterDraftCount = await prisma.purchaseOrder.count({ where: { tenantId: ctx.tenantAId, status: PurchaseOrderStatus.DRAFT } });
  if (afterDraftCount !== beforeDraftCount) throw new Error('Kapali ikmal politikasi veritabanini degistirdi.');

  const invalid = await api('PUT', '/api/procurement-autonomy/planning-policy', ownerToken, { autoCreateDrafts: true });
  assertStatus(invalid, 400, 'eksik ikmal politikasi reddedilmeli');
  const foreignAfter = await prisma.tenantSetting.findFirst({
    where: { tenantId: ctx.tenantBId, key: 'procurement.planning.horizon_days' },
    select: { value: true },
  });
  if (foreignAfter?.value !== foreignBefore?.value) throw new Error('Ikmal politikasi baska tenant verisini degistirdi.');
}

async function testReportDecisionInsightsFlow(ctx: TestContext): Promise<void> {
  const now = new Date();
  const from = new Date(now); from.setDate(from.getDate() - 30);
  const result = await api('GET', `/api/reports/decision-insights?dateFrom=${encodeURIComponent(from.toISOString())}&dateTo=${encodeURIComponent(now.toISOString())}`, token(ctx.ownerAId, ctx.tenantAId));
  assertStatus(result, 200, 'rapor karar merkezi yuklenebilmeli');
  const workspace = readDataRecord(result.body);
  if (!isRecord(workspace.summary) || typeof workspace.executiveSummary !== 'string' || !Array.isArray(workspace.insights)) {
    throw new Error('Rapor karar merkezi contract ile uyusmuyor.');
  }
  for (const insight of workspace.insights.filter(isRecord)) {
    if (!isRecord(insight.action) || typeof insight.action.href !== 'string' || !Array.isArray(insight.sources)) throw new Error('Rapor icgorusu uygulanabilir veya izlenebilir degil.');
    for (const source of insight.sources.filter(isRecord)) {
      if (source.entityId === ctx.productBId || source.entityId === ctx.contactBId) throw new Error('Rapor karar merkezi baska tenant kaynagini sizdirdi.');
    }
  }
  const invalid = await api('GET', '/api/reports/decision-insights?dateFrom=invalid&dateTo=invalid', token(ctx.ownerAId, ctx.tenantAId));
  assertStatus(invalid, 400, 'gecersiz rapor karar tarihi reddedilmeli');
  const digest = await api('POST', '/api/automation-rules/scheduler/run', token(ctx.ownerAId, ctx.tenantAId), { jobKey: 'executive_insights_digest' });
  assertStatus(digest, 200, 'rol bazli yonetici ozeti zamanlayicidan calistirilabilmeli');
  const notification = await prisma.notification.findFirst({ where: { tenantId: ctx.tenantAId, userId: ctx.ownerAId, module: 'reporting', title: 'Günlük karar özeti' }, select: { id: true } });
  if (!notification) throw new Error('Yonetici ozeti raporlama yetkili kullaniciya ulasmadi.');
}

async function testRecordCollaborationFlow(ctx: TestContext): Promise<void> {
  const ownerToken = token(ctx.ownerAId, ctx.tenantAId);
  const basePath = `/api/record-collaboration/CONTACT/${ctx.contactAId}`;
  const initial = await api('GET', basePath, ownerToken);
  assertStatus(initial, 200, 'kayit isbirligi baglami yuklenebilmeli');

  const followed = await api('PUT', `${basePath}/following`, ownerToken, { following: true });
  assertStatus(followed, 200, 'kayit takip edilebilmeli');

  const comment = await api('POST', `${basePath}/entries`, ownerToken, {
    type: 'COMMENT',
    content: 'Cari risk limiti ekip tarafindan kontrol edilecek.',
    mentionIds: [ctx.limitedAId],
  });
  assertStatus(comment, 201, 'kayit baglaminda mention iceren yorum olusturulabilmeli');

  const decision = await api('POST', `${basePath}/entries`, ownerToken, {
    type: 'DECISION',
    content: 'Risk limiti onay gelene kadar degistirilmeyecek.',
    mentionIds: [],
  });
  assertStatus(decision, 201, 'kayit baglaminda karar olusturulabilmeli');

  const snapshot = await api('GET', basePath, ownerToken);
  assertStatus(snapshot, 200, 'guncel isbirligi baglami yuklenebilmeli');
  const snapshotData = readDataRecord(snapshot.body);
  if (!Array.isArray(snapshotData.entries) || snapshotData.entries.length < 2 || snapshotData.isFollowing !== true) {
    throw new Error('Isbirligi yorumu, karari veya takip durumu contract ile uyusmuyor.');
  }

  const activity = await api('GET', `/api/activity?entityType=CONTACT&entityId=${ctx.contactAId}`, ownerToken);
  assertStatus(activity, 200, 'isbirligi kayit aktivite akisinda gorulebilmeli');
  const activityData = readDataArray(activity.body);
  if (!activityData.some((item) => item.sourceType === 'COLLABORATION')) {
    throw new Error('Isbirligi kaydi ortak aktivite akisina eklenmedi.');
  }

  const notification = await prisma.notification.findFirst({ where: { tenantId: ctx.tenantAId, userId: ctx.limitedAId, entityType: 'CONTACT', entityId: ctx.contactAId, module: 'collaboration' } });
  if (!notification) throw new Error('Mention bildirimi tenant kullanicisina ulasmadi.');

  const foreignMention = await api('POST', `${basePath}/entries`, ownerToken, { type: 'COMMENT', content: 'Gecersiz mention', mentionIds: [ctx.ownerBId] });
  assertStatus(foreignMention, 400, 'baska tenant kullanicisi mention edilememeli');
  const foreignRecord = await api('GET', `/api/record-collaboration/CONTACT/${ctx.contactBId}`, ownerToken);
  assertStatus(foreignRecord, 404, 'baska tenant kaydinin isbirligi baglami gorulememeli');
}

async function main(): Promise<void> {
  const ctx = await withTimeout('seed', seed());
  try {
    console.log('Integration: Prometheus metrics export');
    await testPrometheusMetricsEndpoint();
    console.log('Integration: tenant isolation');
    await testTenantIsolation(ctx);
    console.log('Integration: session authentication tenant scope');
    await testSessionAuthenticationKeepsTenantScope(ctx);
    console.log('Integration: repository-backed critical queries');
    await testRepositoryBackedQueries(ctx);
    console.log('Integration: automation assistant tenant-safe preview and draft');
    await testAutomationAssistantFlow(ctx);
    console.log('Integration: bulk import assistance tenant-safe analysis and learning');
    await testBulkImportAssistanceFlow(ctx);
    console.log('Integration: data deduplication merge and rollback');
    await testDataDeduplicationMergeAndRollback(ctx);
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
    console.log('Integration: atomic outbox multi-instance claim');
    await testAtomicOutboxClaim(ctx);
    console.log('Integration: atomic marketplace multi-instance claim');
    await testAtomicMarketplaceClaim(ctx);
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
    console.log('Integration: navigation workspace personalization and tenant isolation');
    await testNavigationWorkspaceFlow(ctx);
    console.log('Integration: notification attention preferences, grouping and metrics');
    await testNotificationAttentionFlow(ctx);
    console.log('Integration: finance operations exception-first workspace');
    await testFinanceOperationsFlow(ctx);
    console.log('Integration: predictive replenishment planning and tenant safety');
    await testReplenishmentPlanningFlow(ctx);
    console.log('Integration: actionable and traceable report insights');
    await testReportDecisionInsightsFlow(ctx);
    console.log('Integration: record-context collaboration and tenant isolation');
    await testRecordCollaborationFlow(ctx);
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
