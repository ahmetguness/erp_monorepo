import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { PerformanceActor } from '../../packages/types/src/performance.js';
import type { DrillCluster } from '../disaster-recovery/cluster.js';
import type { RecoveryOperations } from '../disaster-recovery/operations.js';
import { docker } from '../disaster-recovery/process.js';
import { notificationSchema, until } from './evidence.js';
import { realBackupAttempt } from './dr-probe-evidence.js';
import { proveTraceGraph } from './trace-proof.js';
export interface IncidentContext {
  cluster: DrillCluster;
  operations: RecoveryOperations;
  actor: PerformanceActor;
  faultFile: string;
  query(url: string): Promise<unknown>;
  origin(): string;
  step(scenario: string): void;
  capture(scenario: string, response: Response): Promise<void>;
  captureOperation(scenario: string, operation: string, since: number, required: readonly string[]): Promise<void>;
  setBackupFailure(failed: boolean): void;
  recoverDatabase(time: string): Promise<void>;
}
const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
export async function exerciseIncidents(ctx: IncidentContext, scope: 'all' | 'integrity-recovery' = 'all'): Promise<void> {
  const { cluster, actor } = ctx;
  const sql = (query: string) => cluster.sql(cluster.source, query);
  const alerts = async () => notificationSchema.parse(await ctx.query(`http://${cluster.id}-ops-sink:9002/alerts`));
  const alert = (name: string, status: 'firing' | 'resolved', since: number, seconds = 150) => until(`${name} ${status} delivered`, async () => (await alerts()).some(row => row.name === name && row.status === status && Date.parse(row.at) >= since), seconds);
  const get = (path: string, init?: RequestInit) => { const headers = new Headers(init?.headers); headers.set('authorization', `Bearer ${actor.token}`); headers.set('origin', 'http://127.0.0.1:3100'); return fetch(ctx.origin() + path, { ...init, headers, signal: AbortSignal.timeout(25000) }); };
  const post = (path: string, body: unknown) => get(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const readyEvidence = async (name: string) => ctx.capture(name, await get('/ready'));
  const recoverRead = async (name: string) => {
    const response = await get('/api/products'); if (!response.ok)
      throw new Error(`${name} did not recover`); await ctx.capture(name, response);
  };
  if (scope === 'all') {
  for (const [component, rule] of [['redis', 'RedisUnavailable'], ['worker', 'WorkerUnavailable']] as const) {
    const since = Date.now(), container = cluster.id + '-' + component;
    await cluster.assertOwned('container', container);
    try {
      await docker(component === 'redis' ? ['pause', container] : ['kill', '--signal', 'KILL', container]);
      await readyEvidence(`${component}-failure`);
      await alert(rule, 'firing', since);
    }
    finally {
      await docker([component === 'redis' ? 'unpause' : 'start', container]);
    }
    await alert(rule, 'resolved', since);
    await recoverRead(`${component}-recovery`);
    ctx.step(`${component} actual outage, delivered firing/resolution and safe recovery`);
  }
  // A real durable event is made undeliverable only in this owned fixture.
  const deadSince = Date.now();
  await docker(['pause', cluster.id + '-worker']);
  let eventId: string;
  let mutationTrace: string | undefined;
  try {
    const response = await post('/api/invoices', { contactId: actor.contactId, type: 'SALES', date: new Date().toISOString().slice(0, 10), lines: [{ productId: actor.productId, description: 'Synthetic durable delivery', quantity: 1, unitPrice: 100, taxRateId: actor.taxRateId }] });
    if (response.status !== 201)
      throw new Error('Dead-letter fixture mutation failed');
    mutationTrace = response.headers.get('traceparent')?.split('-')[1];
    await ctx.capture('deadletter-source-mutation', response);
    eventId = await sql(`UPDATE domain_event_outbox SET status='DEAD_LETTER', attempts=5, "lastError"='Synthetic isolated delivery failure' WHERE id=(SELECT id FROM domain_event_outbox WHERE "tenantId"=${literal(actor.tenantId)} AND status='PENDING' ORDER BY "createdAt" DESC LIMIT 1) RETURNING id`);
    // psql may include the command tag on a separate line.
    eventId = eventId.split('\n')[0];
    if (!/^[a-zA-Z0-9-]+$/.test(eventId))
      throw new Error('No real durable event to quarantine');
    await alert('OutboxDeadLetter', 'firing', deadSince);
  }
  finally {
    await docker(['unpause', cluster.id + '-worker']);
  }
  const replay = await post(`/api/domain-events/${eventId}/replay`, {});
  if (!replay.ok)
    throw new Error('Authorized dead-letter replay failed');
  await ctx.capture('deadletter-replay', replay);
  await until('worker really processes replay', async () => (await sql(`SELECT status FROM domain_event_outbox WHERE id=${literal(eventId)}`)) === 'PROCESSED');
  const trace = mutationTrace;
  if (!trace)
    throw new Error('Durable mutation trace is missing');
  let durableTrace: unknown;
  await until('real HTTP to outbox to worker trace graph', async () => { durableTrace = await ctx.query(`http://tempo:3200/api/traces/${trace}`); proveTraceGraph(durableTrace, trace, ['http.request', 'database.operation', 'outbox.deliver']); return true; });
  await writeFile(resolve(cluster.directory, 'phase10-worker-trace.json'), JSON.stringify(durableTrace, null, 2));
  await alert('OutboxDeadLetter', 'resolved', deadSince);
  ctx.step('Dead-letter detected, authorized replay consumed by real worker, alert resolved');
  const providerSince = Date.now();
  try {
    for (const fault of ['429', '500', 'timeout']) {
      await writeFile(ctx.faultFile, fault);
      const form = new FormData();
      form.set('file', new Blob(['Synthetic diagnostic upload'], { type: 'text/plain' }), 'phase10.txt');
      form.set('entityType', 'PRODUCT');
      form.set('entityId', actor.productId);
      const response = await get('/api/attachments/upload', { method: 'POST', body: form });
      if (response.ok)
        throw new Error(`Provider ${fault} was incorrectly accepted`);
      await ctx.capture(`provider-${fault}`, response);
    }
    await alert('ProviderFailure', 'firing', providerSince);
  }
  finally {
    await writeFile(ctx.faultFile, 'healthy');
  }
  await alert('ProviderFailure', 'resolved', providerSince, 420);
  await recoverRead('provider-recovery');
  ctx.step('Actual TLS provider 429/500/15s timeout exported as failed spans; delivered alarm resolves');
  const wsSince = Date.now();
  const socket = new WebSocket(ctx.origin().replace('http:', 'ws:') + `/api/chat/ws?token=${encodeURIComponent(actor.token)}`);
  try {
    await new Promise<void>((resolveOpen, reject) => { const timer = setTimeout(() => reject(new Error('WS handshake failed')), 5000); socket.addEventListener('open', () => { clearTimeout(timer); resolveOpen(); }, { once: true }); socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WS error')); }, { once: true }); });
    socket.send(JSON.stringify({ type: 'telemetry.capabilities', version: 1, deliveryAck: true }));
    socket.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (typeof event.data !== 'string')
        return; try {
          const value = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/), tenantId: z.literal(actor.tenantId), version: z.literal(1) }).safeParse(JSON.parse(event.data));
          if (value.success)
            socket.send(JSON.stringify({ type: 'event.ack', id: value.data.id }));
        }
      catch { /* Control frames are not deliveries. */ }
    });
    const message = await post(`/api/chat/conversations/${actor.conversationId}/messages`, { clientMessageId: randomUUID(), content: 'Synthetic operational receipt' });
    if (message.status !== 201)
      throw new Error('Real chat telemetry mutation failed');
    await ctx.capture('chat-delivery', message);
    await until('Prometheus records an actual client delivery receipt', async () => z.object({ data: z.object({ result: z.array(z.unknown()).min(1) }) }).safeParse(await ctx.query('http://prometheus:9090/api/v1/query?query=axon_realtime_confirmed_deliveries_total%20%3E%200')).success);
    socket.close(4000, 'Synthetic heartbeat expiry');
    await alert('WebSocketFailure', 'firing', wsSince);
    await ctx.captureOperation('websocket-failure', 'websocket.disconnect', wsSince, ['http.request', 'websocket.disconnect']);
  }
  finally {
    socket.close();
  }
  await alert('WebSocketFailure', 'resolved', wsSince, 420);
  await recoverRead('websocket-recovery');
  ctx.step('WebSocket transport interruption observed, delivered alarm firing/resolution');
  const storageSince = Date.now();
  try {
    await docker(['pause', cluster.id + '-provider']);
    await readyEvidence('storage-failure');
    await alert('StorageUnavailable', 'firing', storageSince);
  }
  finally {
    await docker(['unpause', cluster.id + '-provider']);
  }
  await alert('StorageUnavailable', 'resolved', storageSince);
  await recoverRead('storage-recovery');
  ctx.step('Actual storage provider outage detected and recovered without loosening quota');
  const backupSince = Date.now();
  try {
    await docker(['exec', '-u', 'root', cluster.source, 'chmod', '000', '/var/lib/pgbackrest']);
    const failed = !await realBackupAttempt(cluster, 'denied');
    ctx.setBackupFailure(failed);
    if (!failed)
      throw new Error('Backup fault did not fail a real backup');
    await alert('BackupFailure', 'firing', backupSince, 240);
  }
  finally {
    await docker(['exec', '-u', 'root', cluster.source, 'chmod', '750', '/var/lib/pgbackrest']);
  }
  if (!await realBackupAttempt(cluster, 'recovered'))
    throw new Error('Actual backup recovery failed');
  ctx.setBackupFailure(false);
  await alert('BackupFailure', 'resolved', backupSince, 240);
  ctx.step('Actual repository denial fails backup; restored access and verified successful new backup resolve alarm');
  const walSince = Date.now();
  try {
    // The source's archive_command is a command-line GUC, so ALTER SYSTEM
    // cannot override it. Deny only this owned repository and force real WAL.
    await docker(['exec', '-u', 'root', cluster.source, 'chmod', '000', '/var/lib/pgbackrest']);
    await sql("SELECT pg_create_restore_point('axon_phase10_archive_fault'); SELECT pg_switch_wal();");
    await alert('WalArchiveStale', 'firing', walSince, 240);
    await until('actual WAL archive freshness exceeds unchanged 900s threshold', async () => {
      const value = await sql('SELECT extract(epoch FROM clock_timestamp()-last_archived_time)::float8 FROM pg_stat_archiver');
      return Number.isFinite(Number(value)) && Number(value) > 900;
    }, 1000);
    await writeFile(resolve(cluster.directory, 'phase10-wal-delay.json'), JSON.stringify({ localOnly: true, actualAgeSeconds: Number(await sql('SELECT extract(epoch FROM clock_timestamp()-last_archived_time)::float8 FROM pg_stat_archiver')), thresholdSeconds: 900, clockUnchanged: true }, null, 2));
  }
  finally {
    await docker(['exec', '-u', 'root', cluster.source, 'chmod', '750', '/var/lib/pgbackrest']);
  }
  await ctx.operations.backrest(cluster.source, ['check']);
  await alert('WalArchiveStale', 'resolved', walSince, 240);
  ctx.step('Actual WAL failure and >900s archive delay measured without clock changes; delivered alarm resolves after shipping resumes');
  }
  const stock = z.object({ id: z.string(), quantity: z.string() }).parse(JSON.parse(await sql(`SELECT json_build_object('id',id,'quantity',quantity::text) FROM stock_levels WHERE "tenantId"=${literal(actor.tenantId)} AND "productId"=${literal(actor.productId)} LIMIT 1`)));
  const invariantSince = Date.now();
  try {
    await sql(`UPDATE stock_levels SET quantity=-1 WHERE id=${literal(stock.id)}`);
    await alert('BusinessInvariantViolation', 'firing', invariantSince);
    await ctx.captureOperation('invariant-detected', 'operational.integrity', invariantSince, ['operational.probe', 'database.operation']);
  }
  finally {
    await sql(`UPDATE stock_levels SET quantity=${literal(stock.quantity)}::numeric WHERE id=${literal(stock.id)}`);
  }
  await alert('BusinessInvariantViolation', 'resolved', invariantSince);
  await recoverRead('invariant-recovery');
  ctx.step('Independent SQL detects a committed synthetic stock violation and verifies restoration');
  const recoveryTime = await sql(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);
  const auditSince = Date.now();
  await sql(`INSERT INTO platform_admin_audit_logs (id,action,module,"targetType",outcome,"changedFields","previousHash",hash,"retentionUntil","createdAt") SELECT 'synthetic-corrupt-entry','UPDATE','SYNTHETIC_CORRUPTION','synthetic','SUCCESS','[]'::jsonb,hash,repeat('0',64),"retentionUntil",clock_timestamp() FROM platform_admin_audit_logs ORDER BY "createdAt" DESC LIMIT 1`);
  await alert('AuditIntegrityFailure', 'firing', auditSince);
  await ctx.captureOperation('audit-detected', 'operational.integrity', auditSince, ['operational.probe', 'database.operation']);
  await sql('SELECT pg_switch_wal()');
  await ctx.operations.backrest(cluster.source, ['check']);
  await ctx.recoverDatabase(recoveryTime);
  await alert('AuditIntegrityFailure', 'resolved', auditSince, 240);
  await recoverRead('audit-pitr-recovery');
  ctx.step('Committed invalid audit entry detected; immutable history recovered through new-target physical PITR, never rewritten');
  await writeFile(resolve(cluster.directory, 'phase10-notifications.json'), JSON.stringify(await alerts(), null, 2));
}
