import { createHash } from 'node:crypto';
import { InvoiceType, Prisma } from '@prisma/client';
import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import { db, isolatedDatabase } from '../support/database.js';
import { fixture } from '../support/fixtures.js';
import { request, create, data } from '../support/http.js';
import { createLifecycleExport } from '../../../src/modules/platform/tenant-lifecycle/tenant-lifecycle-export.service.js';
import { encrypt, decrypt } from '../../../src/utils/encryption.js';
import jwt from 'jsonwebtoken';
import { verifyRotatedHttpProcess } from '../support/rotation-process.js';
import { collectOperationalProbe, readOperationalSnapshot } from '../../../src/modules/platform/application/observability/operational-probe.js';
import { createPlatformAudit } from '../../../src/modules/platform/platform-audit/platform-audit.service.js';
import { createRequest, verifyIdentity, decideRequest, executeRequest, createDownloadGrant, consumeDownload, createLegalHold } from '../../../src/modules/platform/privacy-operations/privacy.service.js';
import { createSecuritySession, listSecuritySessions } from '../../../src/services/security-hardening.service.js';
import { runWithTenantIsolationBypass, runWithTenantScope } from '../../../src/lib/tenant-isolation-context.js';
import { recordAiRequestLog } from '../../../src/services/ai-governance.service.js';
import { Hono } from 'hono';
import { registerPreRoutingMiddleware } from '../../../src/bootstrap/http/middleware.js';
import { readRuntimeConfig } from '../../../src/bootstrap/runtime-config.js';
import { AdminAuditController } from '../../../src/modules/platform/http/controllers/admin/admin-audit.controller.js';
import { runWithObservabilityContext } from '../../../src/services/observability.service.js';
import { buildDataRetentionPreview, recordDataRetentionDryRun } from '../../../src/services/data-retention-policy.service.js';
import { withMailProvider } from '../support/mail-provider.js';
import { withTraceCollector } from '../support/trace-collector.js';
import { flushTraces, traceExporterMetrics } from '../../../src/lib/telemetry/exporter.js';
import { processMailInSeparateWorker } from '../support/mail-worker-process.js';
import { processDomainEventOutboxBatch } from '../../../src/services/domain-event-outbox-worker.service.js';
import { domainEvents } from '../../../src/domain-events/bus.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
isolatedDatabase();

test('phase10: a row committed after probe transaction start cannot invalidate queue age metrics', async () => {
  const { a } = await fixture();
  await db.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    // SET does not acquire the repeatable-read data snapshot. A real concurrent
    // commit can be visible while PostgreSQL now() still precedes createdAt.
    const inFuture = new Date(Date.now() + 10_000);
    await db.domainEventOutbox.create({ data: { tenantId: a.tenant.id, name: 'probe.synthetic', source: 'assurance', idempotencyKey: 'probe-snapshot-age', entityType: 'OTHER', entityId: a.tenant.id, createdAt: inFuture, payload: {}, context: {} } });
    const age: unknown = await tx.$queryRaw`SELECT extract(epoch FROM (now() at time zone 'utc')-min("createdAt"))::float8 AS seconds FROM domain_event_outbox`;
    const [{ seconds }] = z.array(z.object({ seconds: z.number().finite() })).length(1).parse(age);
    expect(seconds).toBeLessThan(0);
    const snapshot = await readOperationalSnapshot(tx);
    expect(snapshot).toContain('axon_outbox_pending 1');
    expect(snapshot).toMatch(/^axon_outbox_oldest_seconds 0$/m);
    expect(snapshot).toContain('axon_audit_integrity_valid 1');
    console.info(JSON.stringify({ operation: 'phase10.probe.snapshot-age', originalAgeSeconds: seconds, concurrentCommitPreserved: true }));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 3000 });
});

test('phase10: bounded independent probe preserves payment and reservation checks over accumulated business history', async () => {
  const { a } = await fixture();
  const count = 6000;
  const date = new Date();
  const invoices = Array.from({ length: count }, (_, index) => ({ id: `probe-volume-${index}`, tenantId: a.tenant.id, contactId: a.contact.id, number: `PROBE-${index}`, type: InvoiceType.SALES, date, totalGross: 100 }));
  await db.invoice.createMany({ data: invoices });
  const payment = await db.payment.create({ data: { tenantId: a.tenant.id, date, amount: count * 100 } });
  await db.paymentAllocation.createMany({ data: invoices.map(invoice => ({ tenantId: a.tenant.id, invoiceId: invoice.id, paymentId: payment.id, amount: 100 })) });
  await db.tenantStorageUsage.create({ data: { tenantId: a.tenant.id, reservedBytes: 30n } });
  await db.storageReservation.createMany({ data: [
    { tenantId: a.tenant.id, source: 'ERP_ATTACHMENT', status: 'RESERVED', objectKey: 'probe-active', originalName: 'synthetic.txt', contentType: 'text/plain', createdById: a.owner.id, expectedBytes: 30n, expiresAt: date },
    { tenantId: a.tenant.id, source: 'ERP_ATTACHMENT', status: 'COMMITTED', objectKey: 'probe-completed', originalName: 'synthetic.txt', contentType: 'text/plain', createdById: a.owner.id, expectedBytes: 70n, expiresAt: date },
  ] });
  const started = performance.now();
  const healthy = await collectOperationalProbe(db);
  const healthyProbeMs = performance.now() - started;
  expect(healthy).toContain('axon_business_invariant_violations{invariant="invalidPaymentBalances"} 0');
  expect(healthy).toContain('axon_business_invariant_violations{invariant="invalidStorageAccounting"} 0');
  // Multiple allocations must still count one overpaid invoice, and invoices
  // without allocations must retain the original coalesce-to-zero semantics.
  const extraPayment = await db.payment.create({ data: { tenantId: a.tenant.id, date, amount: 2 } });
  await db.paymentAllocation.create({ data: { tenantId: a.tenant.id, invoiceId: invoices[0].id, paymentId: extraPayment.id, amount: 2 } });
  await db.invoice.create({ data: { tenantId: a.tenant.id, contactId: a.contact.id, number: 'PROBE-NEGATIVE', type: InvoiceType.SALES, date, totalGross: -1 } });
  await db.tenantStorageUsage.update({ where: { tenantId: a.tenant.id }, data: { reservedBytes: 31n } });
  const failedStarted = performance.now();
  const failed = await collectOperationalProbe(db);
  console.info(JSON.stringify({ operation: 'phase10.probe.volume', invoices: count + 1, allocations: count + 1, healthyProbeMs, violationProbeMs: performance.now() - failedStarted }));
  expect(failed).toContain('axon_business_invariant_violations{invariant="invalidPaymentBalances"} 2');
  expect(failed).toContain('axon_business_invariant_violations{invariant="invalidStorageAccounting"} 1');
});

test('phase10: one complete trace survives real HTTP mail enqueue, durable outbox, worker and provider HTTP', async () => {
  const { a } = await fixture();
  await withMailProvider(async provider => withTraceCollector(async collector => {
    vi.stubEnv('TELEMETRY_ENABLED', 'true');
    vi.stubEnv('TELEMETRY_SAMPLE_RATIO', '1');
    vi.stubEnv('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', collector.endpoint);
    try {
      const response = await request('POST', '/api/mail/send', a.identity, { to: 'synthetic-private-recipient@example.test', subject: 'synthetic-private-subject', html: '<p>synthetic-private-content</p>' });
      expect(response.status, JSON.stringify(response.body)).toBe(202);
      const traceId = response.headers.get('traceparent')?.split('-')[1];
      expect(traceId).toMatch(/^[a-f0-9]{32}$/);
      const queued = await db.domainEventOutbox.findFirstOrThrow({ where: { tenantId: a.tenant.id, name: 'mail.delivery.requested' } });
      expect(z.object({ traceparent: z.string() }).parse(queued.context).traceparent.split('-')[1]).toBe(traceId);
      const workerProcessId = await processMailInSeparateWorker();
      expect(workerProcessId).not.toBe(process.pid);
      expect(provider.delivered.size).toBe(1);
      expect((await db.domainEventOutbox.findUniqueOrThrow({ where: { id: queued.id } })).status).toBe('PROCESSED');
      for (let attempt = 0; attempt < 20; attempt++) {
        await flushTraces();
        if (traceExporterMetrics().axon_telemetry_queued_spans === 0) break;
      }
      const spans = collector.spans.filter(span => span.traceId === traceId);
      const ids = new Set(spans.map(span => span.spanId));
      expect(ids.size).toBe(spans.length);
      expect(spans.filter(span => !span.parentSpanId)).toHaveLength(1);
      for (const span of spans) if (span.parentSpanId) expect(ids.has(span.parentSpanId)).toBe(true);
      for (const name of ['http.request', 'application.request', 'database.operation', 'outbox.deliver', 'provider.request']) expect(spans.some(span => span.name === name)).toBe(true);
      expect(JSON.stringify(spans)).not.toContain('synthetic-private');
      const directory = resolve(process.env.CROSS_MODULE_REPORT_DIRECTORY ?? '../../artifacts/cross-module');
      const inside = relative(resolve('../../artifacts'), directory);
      if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('Trace evidence must remain in owned artifacts');
      await mkdir(directory, { recursive: true });
      await writeFile(resolve(directory, 'phase10-mail-trace.json'), JSON.stringify({ traceId, spans, producerProcessId: process.pid, workerProcessId, completeParentGraph: true, realProviderHttpDeliveries: provider.delivered.size }, null, 2));
    } finally {
      await flushTraces();
      vi.unstubAllEnvs();
    }
  }));
});

test('phase10: failed outbox consumer exports an error span and preserves durable retry state', async () => {
  const { a } = await fixture();
  await withMailProvider(async provider => withTraceCollector(async collector => {
    vi.stubEnv('TELEMETRY_ENABLED', 'true');
    vi.stubEnv('TELEMETRY_SAMPLE_RATIO', '1');
    vi.stubEnv('OTEL_EXPORTER_OTLP_TRACES_ENDPOINT', collector.endpoint);
    const unsubscribe = domainEvents.subscribe('phase10-failing-consumer', async () => {
      throw new Error('synthetic-private-consumer-failure');
    });
    try {
      const response = await request('POST', '/api/mail/send', a.identity, { to: 'synthetic-private-recipient@example.test', subject: 'synthetic-private-subject', html: '<p>synthetic-private-content</p>' });
      expect(response.status, JSON.stringify(response.body)).toBe(202);
      const result = await processDomainEventOutboxBatch(1);
      expect(result).toMatchObject({ claimed: 1, replayed: 0, failed: 1 });
      expect(provider.delivered.size).toBe(1);
      const queued = await db.domainEventOutbox.findFirstOrThrow({ where: { tenantId: a.tenant.id, name: 'mail.delivery.requested' } });
      expect(queued.status).toBe('FAILED');
      expect(queued.nextRetryAt).not.toBeNull();
      expect(await db.domainEventDelivery.count({ where: { outboxId: queued.id, consumer: 'phase10-failing-consumer' } })).toBe(0);
      for (let attempt = 0; attempt < 20; attempt++) {
        await flushTraces();
        if (traceExporterMetrics().axon_telemetry_queued_spans === 0) break;
      }
      const spans = collector.spans.filter(span => span.name === 'outbox.deliver');
      expect(spans).toHaveLength(1);
      expect(spans[0].status.code).toBe(2);
      expect(JSON.stringify(spans)).not.toContain('synthetic-private');
    } finally {
      unsubscribe();
      await flushTraces();
      vi.unstubAllEnvs();
    }
  }));
});

test('phase10.2: audit HTTP export hashes the exact body and records trusted actor/request context', async () => {
  await fixture();
  const [admin] = await admins();
  const app = new Hono();
  registerPreRoutingMiddleware(app, readRuntimeConfig());
  app.use('*', async (c, next) => { c.set('adminId', admin.id); await next(); });
  app.get('/export', AdminAuditController.export);
  const response = await app.request('/export?format=json', { headers: { 'x-request-id': 'invalid request id', 'x-correlation-id': 'phase10-safe-correlation' } });
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(response.headers.get('x-content-sha256')).toBe(createHash('sha256').update(body).digest('hex'));
  expect(response.headers.get('cache-control')).toBe('no-store');
  const requestId = response.headers.get('x-request-id');
  expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
  const audit = await db.platformAdminAuditLog.findFirstOrThrow({ where: { module: 'AUDIT', action: 'EXPORT' } });
  expect(audit.actorId).toBe(admin.id);
  expect(audit.requestId).toBe(requestId);
  expect(audit.correlationId).toBe('phase10-safe-correlation');
});

test('phase10.2: retention dry-run reports actual aged candidates and preserves retained business data', async () => {
  const { a } = await fixture();
  const old = await db.contact.update({ where: { id: a.contact.id }, data: { createdAt: new Date('2000-01-01T00:00:00Z') } });
  const preview = await buildDataRetentionPreview(db, a.tenant.id);
  expect(preview.items.find(item => item.module === 'contacts')?.candidateCount).toBe(1);
  await recordDataRetentionDryRun(db, a.tenant.id, preview);
  expect(await db.contact.findUniqueOrThrow({ where: { id: old.id } })).toEqual(old);
  expect(await db.tenantSetting.findUnique({ where: { tenantId_key: { tenantId: a.tenant.id, key: 'compliance.retention.last_run_at' } } })).not.toBeNull();
});
test('phase10.2: AI governance analytics persist metadata without prompt, draft, result or provider-error bodies by default', async () => {
  const { a } = await fixture();
  vi.stubEnv('AI_GOVERNANCE_CONTENT_LOGGING_ENABLED', 'false');
  try {
    await runWithTenantScope(a.tenant.id, () => recordAiRequestLog({ tenantId: a.tenant.id, userId: a.owner.id, requestType: 'PRIVATE_CHAT', promptVersion: 'phase10:test', model: 'synthetic-no-network', permissionCheckResult: 'ALLOWED', status: 'FAILED', policy: { enabled: true, dataSharingPolicy: 'BUSINESS_CONTEXT', logPrompts: true }, inputText: 'private-person-synthetic prompt', outputText: 'private-person-synthetic response', draft: { name: 'private-person-synthetic', amount: 234.56 }, result: { email: 'private-person-synthetic@example.test' }, entityContext: { name: 'private-person-synthetic' }, errorMessage: 'private-person-synthetic provider body' }));
    const row = await db.aiRequestLog.findFirstOrThrow({ where: { tenantId: a.tenant.id } });
    expect(JSON.stringify(row)).not.toContain('private-person-synthetic');
    expect(JSON.stringify(row)).not.toContain('234.56');
    expect(row.inputSummary).toBe('[REDACTED_BY_POLICY]');
    expect(row.draft).toBeNull();
    expect(row.entityContext).toBeNull();
    expect(row.errorMessage).toBe('AI_OPERATION_FAILED');
  }
  finally {
    vi.unstubAllEnvs();
  }
});
async function admins() {
  return Promise.all([1, 2].map(index => db.adminUser.create({ data: { email: `phase10-${index}@example.test`, name: 'Synthetic privacy operator', password: 'not-a-password' } })));
}
async function approvedRequest(tenantId: string, subjectEmail: string, type: 'EXPORT' | 'ANONYMIZATION', scope: string[]) {
  const [maker, approver] = await admins();
  const row = await createRequest({ tenantId, subjectEmail, type, scope, reason: 'Synthetic data governance verification', ticketId: 'PHASE10-TEST' }, maker.id);
  await verifyIdentity(row.id, maker.id);
  await expect(decideRequest(row.id, maker.id, true)).rejects.toThrow();
  await decideRequest(row.id, approver.id, true);
  return { row, maker, approver };
}
test('phase10: read-only independent SQL probe detects real stock and audit tampering then resolves', async () => {
  const { a } = await fixture();
  await createPlatformAudit({ actorId: null, action: 'UPDATE', module: 'TEST', targetType: 'synthetic', targetId: null, outcome: 'SUCCESS' });
  const before = await collectOperationalProbe(db);
  expect(before).toContain('axon_business_invariant_violations{invariant="negativeStock"} 0');
  expect(before).toContain('axon_audit_integrity_valid 1');
  const location = await db.location.create({ data: { tenantId: a.tenant.id, warehouseId: a.warehouse.id, code: 'PHASE10', name: 'Synthetic' } });
  const level = await db.stockLevel.create({ data: { tenantId: a.tenant.id, productId: a.product.id, warehouseId: a.warehouse.id, locationId: location.id, quantity: 1 } });
  await db.stockLevel.update({ where: { id: level.id }, data: { quantity: -1 } });
  const audit = await db.platformAdminAuditLog.findFirstOrThrow();
  await expect(db.platformAdminAuditLog.update({ where: { id: audit.id }, data: { module: 'TAMPERED' } })).rejects.toThrow(/append-only/);
  // Append-only enforcement stays enabled. Inject an invalid new chain entry
  // only inside a rolled-back fixture transaction; never rewrite audit history.
  await expect(db.$transaction(async (tx) => {
    await tx.tenantStorageUsage.create({ data: { tenantId: a.tenant.id, usedBytes: -1n } });
    await tx.platformAdminAuditLog.create({ data: { id: 'synthetic-corrupt-entry', action: 'UPDATE', module: 'TAMPERED', targetType: 'synthetic', outcome: 'SUCCESS', changedFields: [], retentionUntil: audit.retentionUntil, previousHash: audit.hash, hash: '0'.repeat(64), createdAt: new Date(audit.createdAt.getTime() + 1) } });
    const failed = await readOperationalSnapshot(tx);
    expect(failed).toContain('axon_business_invariant_violations{invariant="negativeStock"} 1');
    expect(failed).toContain('axon_audit_integrity_valid 0');
    expect(failed).toContain('axon_business_invariant_violations{invariant="invalidStorageAccounting"} 1');
    expect(failed).toContain('axon_storage_used_bytes{plan="ENTERPRISE"} -1');
    throw new Error('Synthetic corruption rolled back');
  })).rejects.toThrow('Synthetic corruption rolled back');
  await db.stockLevel.update({ where: { id: level.id }, data: { quantity: level.quantity } });
  expect(await collectOperationalProbe(db)).toContain('axon_audit_integrity_valid 1');
});
test('phase10.2: scoped one-use export is tenant bounded and has a verifiable digest', async () => {
  const { a, b } = await fixture();
  const { row, approver } = await approvedRequest(a.tenant.id, a.owner.email, 'EXPORT', ['MEMBERSHIP']);
  await executeRequest(row.id, approver.id);
  const grant = await createDownloadGrant(row.id, approver.id);
  const token = grant.url.split('/').at(-1);
  if (!token)
    throw new Error('Missing synthetic grant');
  const outcomes = await Promise.allSettled([consumeDownload(token), consumeDownload(token)]);
  expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
  const success = outcomes.find(outcome => outcome.status === 'fulfilled');
  if (!success || success.status !== 'fulfilled')
    throw new Error('Export failed');
  const { integrity, ...payload } = success.value;
  const manifest = z.object({ digest: z.string() }).parse(integrity);
  expect(createHash('sha256').update(JSON.stringify(payload)).digest('hex')).toBe(manifest.digest);
  expect(payload.subject).not.toHaveProperty('user');
  expect(JSON.stringify(payload)).not.toContain(a.owner.email);
  expect(JSON.stringify(payload)).not.toContain(b.tenant.id);
  await expect(consumeDownload(token)).rejects.toThrow(/kullanılmış/);
});
test('phase10.2: legal hold blocks anonymization without revoking access', async () => {
  const { a } = await fixture();
  const { row, approver } = await approvedRequest(a.tenant.id, a.owner.email, 'ANONYMIZATION', ['IDENTITY', 'MEMBERSHIP']);
  await createLegalHold({ tenantId: a.tenant.id, reason: 'Synthetic legal retention hold' }, approver.id);
  expect((await executeRequest(row.id, approver.id)).status).toBe('BLOCKED_LEGAL_HOLD');
  expect((await db.user.findUniqueOrThrow({ where: { id: a.owner.id } })).email).toBe(a.owner.email);
  expect((await request('GET', '/api/products', a.identity)).status).toBe(200);
});
test('phase10.2: anonymization revokes tenant sessions and API keys atomically and preserves business data', async () => {
  const { a, b } = await fixture();
  const session = await createSecuritySession(db, a.tenant.id, a.owner.id, { ipAddress: null, userAgent: 'Synthetic governance test' });
  const apiKey = await db.apiKey.create({ data: { tenantId: a.tenant.id, name: 'Synthetic', keyHash: 'synthetic-hash', keyPrefix: 'test', createdById: a.owner.id } });
  const productCount = await db.product.count({ where: { tenantId: a.tenant.id } });
  const { row, approver } = await approvedRequest(a.tenant.id, a.owner.email, 'ANONYMIZATION', ['IDENTITY', 'MEMBERSHIP']);
  expect((await runWithObservabilityContext({ requestId: 'phase10-privacy-executor', correlationId: 'phase10-privacy-correlation' }, () => executeRequest(row.id, approver.id))).status).toBe('COMPLETED');
  const sessions = await listSecuritySessions(db, a.tenant.id);
  expect(sessions.find(item => item.id === session.id)?.status).toBe('REVOKED');
  expect((await db.apiKey.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: apiKey.id } })).isActive).toBe(false);
  expect(await db.product.count({ where: { tenantId: a.tenant.id } })).toBe(productCount);
  expect((await request('GET', '/api/products', a.identity)).status).toBe(403);
  expect((await request('GET', '/api/products', b.identity)).status).toBe(200);
  expect(await runWithTenantIsolationBypass('admin-console', () => db.auditLog.count({ where: { tenantId: a.tenant.id, module: 'PRIVACY', entityId: row.id } }))).toBe(1);
  const audit = await db.auditLog.findFirstOrThrow({ where: { tenantId: a.tenant.id, module: 'PRIVACY', entityId: row.id } });
  expect(audit.adminId).toBe(approver.id);
  expect(audit.requestId).toBe('phase10-privacy-executor');
});
test('phase10.2: shared identity cannot be marked anonymized or changed in another tenant', async () => {
  const { a, b } = await fixture();
  await db.tenantUser.create({ data: { tenantId: b.tenant.id, userId: a.owner.id } });
  const { row, approver } = await approvedRequest(a.tenant.id, a.owner.email, 'ANONYMIZATION', ['IDENTITY', 'MEMBERSHIP']);
  await expect(executeRequest(row.id, approver.id)).rejects.toThrow(/Ortak kimlik/);
  expect((await db.dataSubjectRequest.findFirstOrThrow({ where: { tenantId: a.tenant.id, id: row.id } })).status).toBe('APPROVED');
  expect((await db.user.findUniqueOrThrow({ where: { id: a.owner.id } })).email).toBe(a.owner.email);
  expect((await db.tenantUser.findUniqueOrThrow({ where: { tenantId_userId: { tenantId: a.tenant.id, userId: a.owner.id } } })).isActive).toBe(true);
});
test('phase10.2: a concurrent foreign membership cannot slip between the identity check and anonymization', async () => {
  const { a, b } = await fixture();
  const { row, approver } = await approvedRequest(a.tenant.id, a.owner.email, 'ANONYMIZATION', ['IDENTITY', 'MEMBERSHIP']);
  let locked: () => void = () => undefined, release: () => void = () => undefined;
  const ready = new Promise<void>(resolve => { locked = resolve; }), proceed = new Promise<void>(resolve => { release = resolve; });
  const adding = db.$transaction(async (tx) => { await tx.$queryRaw`SELECT id FROM users WHERE id=${a.owner.id} FOR UPDATE`; locked(); await proceed; await tx.tenantUser.create({ data: { tenantId: b.tenant.id, userId: a.owner.id } }); });
  await ready;
  const execution = executeRequest(row.id, approver.id).then(() => ({ success: true, error: undefined }), (error: unknown) => ({ success: false, error }));
  try {
    await expect.poll(async () => {
      const [probe] = await db.$queryRaw<Array<{
        waiting: bigint;
      }>> `SELECT count(*) AS waiting FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM users%'`; return Number(probe?.waiting ?? 0);
    }, { timeout: 800, interval: 20 }).toBeGreaterThan(0);
  }
  finally {
    release();
    await adding;
  }
  const result = await execution;
  expect(result.success).toBe(false);
  expect(result.error).toBeInstanceOf(Error);
  expect((await db.user.findUniqueOrThrow({ where: { id: a.owner.id } })).email).toBe(a.owner.email);
  expect((await db.tenantUser.findUniqueOrThrow({ where: { tenantId_userId: { tenantId: a.tenant.id, userId: a.owner.id } } })).isActive).toBe(true);
  expect(await db.tenantUser.count({ where: { userId: a.owner.id } })).toBe(2);
});
test('phase10.2: oversized subject export rolls back its one-use claim instead of truncating data', async () => {
  const { a } = await fixture();
  const { row, approver } = await approvedRequest(a.tenant.id, a.owner.email, 'EXPORT', ['AUDIT']);
  await executeRequest(row.id, approver.id);
  await db.auditLog.createMany({ data: Array.from({ length: 1001 }, (_, index) => ({ tenantId: a.tenant.id, userId: a.owner.id, module: 'SYNTHETIC', entityType: 'OTHER', entityId: `subject-export-${index}`, action: 'UPDATE' })) });
  const grant = await createDownloadGrant(row.id, approver.id);
  const token = grant.url.split('/').at(-1);
  if (!token)
    throw new Error('Missing grant');
  await expect(consumeDownload(token)).rejects.toThrow(/sınırı/);
  expect((await db.privacyDownloadGrant.findUniqueOrThrow({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } })).consumedAt).toBeNull();
});
test('phase10.2: real API-key rotation invalidates the predecessor immediately and preserves scopes and tenant boundary', async () => {
  const { a, b } = await fixture();
  const schema = z.object({ id: z.string(), rawKey: z.string() });
  const original = data(await request('POST', '/api/api-keys', a.identity, { name: 'Synthetic rotation', scopes: ['products:read'] }), 201, schema);
  expect((await request('GET', '/api/external/products', null, undefined, original.rawKey)).status).toBe(200);
  expect((await request('POST', `/api/api-keys/${original.id}/rotate`, b.identity, {})).status).toBe(404);
  const rotated = data(await request('POST', `/api/api-keys/${original.id}/rotate`, a.identity, {}), 201, schema);
  expect(rotated.id).not.toBe(original.id);
  expect((await request('GET', '/api/external/products', null, undefined, original.rawKey)).status).toBe(401);
  expect((await request('GET', '/api/external/products', null, undefined, rotated.rawKey)).status).toBe(200);
  expect((await request('GET', '/api/external/contacts', null, undefined, rotated.rawKey)).status).toBe(403);
  expect((await request('POST', `/api/api-keys/${original.id}/rotate`, a.identity, {})).status).toBe(400);
  expect(await db.apiKey.count({ where: { tenantId: a.tenant.id, isActive: true } })).toBe(1);
  await request('POST', `/api/api-keys/${rotated.id}/revoke`, a.identity, {});
  expect((await request('GET', '/api/external/products', null, undefined, rotated.rawKey)).status).toBe(401);
});
test('phase10.2: database-stored provider credential survives staged rewrap, failed recovery and escrow recovery', async () => {
  const { a } = await fixture();
  const legacy = 'synthetic-only-legacy-material-32-characters', active = 'synthetic-only-active-material-32-characters';
  try {
    vi.stubEnv('ENCRYPTION_KEY', legacy);
    vi.stubEnv('ENCRYPTION_KEY_ID', '');
    vi.stubEnv('ENCRYPTION_PREVIOUS_KEYS', '{}');
    const row = await db.marketplaceIntegration.create({ data: { tenantId: a.tenant.id, channel: 'OTHER', name: 'Synthetic rotation', apiSecret: encrypt('synthetic-provider-secret') } });
    const read = async () => {
      const value = (await db.marketplaceIntegration.findUniqueOrThrow({ where: { id: row.id } })).apiSecret; if (!value)
        throw new Error('Missing synthetic ciphertext'); return value;
    };
    const original = await read();
    expect(original).toMatch(/^enc:v1:/);
    vi.stubEnv('ENCRYPTION_KEY', active);
    vi.stubEnv('ENCRYPTION_KEY_ID', 'current');
    vi.stubEnv('ENCRYPTION_PREVIOUS_KEYS', JSON.stringify({ legacy }));
    await db.$transaction(async (tx) => {
      const cipher = (await tx.marketplaceIntegration.findUniqueOrThrow({ where: { id: row.id } })).apiSecret; if (!cipher)
        throw new Error('Missing credential'); await tx.marketplaceIntegration.update({ where: { id: row.id }, data: { apiSecret: encrypt(decrypt(cipher)) } });
    });
    const rewrapped = await read();
    expect(rewrapped).toMatch(/^enc:v2:current:/);
    expect(decrypt(rewrapped)).toBe('synthetic-provider-secret');
    vi.stubEnv('ENCRYPTION_KEY', 'synthetic-incorrect-recovery-material-at-least-32');
    expect(() => decrypt(rewrapped)).toThrow();
    expect(await read()).toBe(rewrapped);
    vi.stubEnv('ENCRYPTION_KEY', active);
    expect(decrypt(await read())).toBe('synthetic-provider-secret');
    vi.stubEnv('ENCRYPTION_PREVIOUS_KEYS', '{}');
    expect(() => decrypt(original)).toThrow();
    vi.stubEnv('ENCRYPTION_PREVIOUS_KEYS', JSON.stringify({ legacy }));
    expect(decrypt(original)).toBe('synthetic-provider-secret');
  }
  finally {
    vi.unstubAllEnvs();
  }
});
test('phase10.2: portable tenant export contains real invoice lines, allocations and accounts with a verifiable digest', async () => {
  const { a, b } = await fixture();
  const [maker] = await admins();
  const invoiceId = await create('/api/invoices', a.identity, { contactId: a.contact.id, type: 'SALES', date: '2026-11-01', lines: [{ productId: a.product.id, description: 'Synthetic portable export', quantity: 1, unitPrice: 100, taxRateId: a.tax.id }] });
  expect((await request('POST', `/api/invoices/${invoiceId}/approve`, a.identity, { idempotencyKey: 'phase10-export-posting' })).status).toBe(200);
  await create('/api/payments', a.identity, { contactId: a.contact.id, cashAccountId: a.cash.id, date: '2026-11-01', amount: 120, direction: 'RECEIVE', method: 'CASH', idempotencyKey: 'phase10-export-payment', allocations: [{ invoiceId, amount: 120 }] });
  const exported = await createLifecycleExport(a.tenant.id, maker.id);
  expect(createHash('sha256').update(JSON.stringify(exported.data)).digest('hex')).toBe(exported.digest);
  const tables = z.object({ tables: z.object({ InvoiceLine: z.array(z.object({ invoiceId: z.string() })), PaymentAllocation: z.array(z.object({ invoiceId: z.string() })), LedgerAccount: z.array(z.object({ code: z.string() })) }) }).parse(exported.data).tables;
  expect(tables.InvoiceLine.map(row => row.invoiceId)).toEqual([invoiceId]);
  expect(tables.PaymentAllocation.map(row => row.invoiceId)).toEqual([invoiceId]);
  expect(tables.LedgerAccount.length).toBeGreaterThan(0);
  expect(JSON.stringify(exported.data)).not.toContain(b.tenant.id);
  expect(await db.auditLog.count({ where: { tenantId: a.tenant.id, module: 'TENANT_LIFECYCLE', entityId: exported.id } })).toBe(1);
});
test('phase10.2: fresh real HTTP processes enforce separate JWT/admin secret rotation and escrow rollback', async () => {
  const { a } = await fixture();
  const admin = await db.adminUser.create({ data: { email: 'rotation@example.test', name: 'Synthetic rotation admin', password: 'not-a-login-password', mfaEnabled: true } });
  const now = new Date();
  const session = await db.adminSession.create({ data: { adminUserId: admin.id, refreshTokenHash: 'synthetic-rotation-refresh-hash', deviceName: 'Synthetic rotation', mfaVerifiedAt: now, expiresAt: new Date(now.getTime() + 3600000) } });
  const oldJwt = process.env.JWT_SECRET, oldAdmin = process.env.ADMIN_JWT_SECRET;
  if (!oldJwt || !oldAdmin)
    throw new Error('Missing isolated signing keys');
  const nextJwt = ['synthetic', 'rotated', 'tenant', 'signing', 'secret', '32', 'characters'].join('-'), nextAdmin = ['synthetic', 'rotated', 'admin', 'signing', 'secret', '32', 'characters'].join('-');
  const payload = { adminId: admin.id, email: admin.email, role: 'admin', sessionId: session.id, tokenVersion: 0, mfaVerifiedAt: now.toISOString() };
  const tenantNext = jwt.sign({ userId: a.owner.id, tenantId: a.tenant.id }, nextJwt, { expiresIn: '1h' }), adminOld = jwt.sign(payload, oldAdmin, { expiresIn: '1h' }), adminNext = jwt.sign(payload, nextAdmin, { expiresIn: '1h' });
  await verifyRotatedHttpProcess(nextJwt, nextAdmin, [{ label: 'old-tenant-rejected', path: '/api/products', token: a.identity.token, expectedStatus: 401 }, { label: 'new-tenant-accepted', path: '/api/products', token: tenantNext, expectedStatus: 200 }, { label: 'old-admin-rejected', path: '/api/admin/auth/me', token: adminOld, expectedStatus: 401 }, { label: 'new-admin-accepted', path: '/api/admin/auth/me', token: adminNext, expectedStatus: 200 }, { label: 'tenant-key-cannot-sign-admin', path: '/api/admin/auth/me', token: jwt.sign(payload, nextJwt), expectedStatus: 401 }]);
  await verifyRotatedHttpProcess(oldJwt, oldAdmin, [{ label: 'escrow-tenant-restored', path: '/api/products', token: a.identity.token, expectedStatus: 200 }, { label: 'new-tenant-rejected-after-rollback', path: '/api/products', token: tenantNext, expectedStatus: 401 }, { label: 'escrow-admin-restored', path: '/api/admin/auth/me', token: adminOld, expectedStatus: 200 }, { label: 'new-admin-rejected-after-rollback', path: '/api/admin/auth/me', token: adminNext, expectedStatus: 401 }]);
});
