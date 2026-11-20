import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { checkBusinessInvariants } from './business-invariants.js';
import { verifyPlatformAuditIntegrity } from '../../platform-audit/platform-audit.service.js';
import { withinProbeDeadline } from '../../../../lib/probe-deadline.js';
import { withSpan } from '../../../../lib/telemetry/tracing.js';
import { logger, diagnosticErrorFields } from '../../../../lib/logger.js';
import { IntegrityTransitions } from './integrity-transitions.js';
const numbers = z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), z.number().finite().nonnegative());
// Corrupt negative accounting must remain observable so the invariant alarm
// fires; rejecting it here would replace evidence with an unknown probe state.
const planSchema = z.array(z.object({ plan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']), used: z.number().finite(), reserved: z.number().finite() }));
const integrityTransitions = new IntegrityTransitions();
export async function collectOperationalProbe(db: PrismaClient): Promise<string> {
  const attributes: Record<string, string> = { 'operation.name': 'operational.probe' };
  return withSpan('operational.probe', 1, attributes, async () => {
    try {
      const snapshot = await db.$transaction(async (tx) => {
        // Fail closed and bound independent scans. Never acquire business-row locks.
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`;
        await tx.$executeRaw`SET LOCAL lock_timeout = '100ms'`;
        return readOperationalSnapshot(tx);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 1000, timeout: 3000 });
      const { failed, changed, causes } = integrityTransitions.update(snapshot);
      if (failed)
        attributes['error.type'] = 'IntegrityViolation';
      if (changed) {
        const fields = { operation: 'operational.integrity', result: failed ? 'failure' : 'recovered', errorCode: failed ? 'INTEGRITY_VIOLATION' : 'NONE', integrityCauses: causes };
        if (failed)
          logger.error('Independent integrity check failed', fields);
        else
          logger.info('Independent integrity check recovered', fields);
      }
      return snapshot;
    }
    catch (error) {
      logger.warn('Independent operational probe failed', { operation: 'operational.probe', result: 'failure', ...diagnosticErrorFields(error) });
      throw error;
    }
  });
}
export async function readOperationalSnapshot(tx: Prisma.TransactionClient): Promise<string> {
  // A commit after transaction start can enter its first data snapshot while
  // now() still precedes the row. Only elapsed ages have a zero floor; signed
  // accounting and all independent business invariant checks remain unchanged.
  const observations: unknown = await tx.$queryRaw`
      SELECT
        (SELECT count(*)::float8 FROM pg_stat_activity WHERE datname=current_database()) AS axon_postgres_connections,
        (SELECT count(*)::float8 FROM pg_stat_activity WHERE datname=current_database() AND state='active') AS axon_postgres_active_connections,
        (SELECT count(*)::float8 FROM pg_stat_activity WHERE datname=current_database() AND state='idle') AS axon_postgres_idle_connections,
        (SELECT xact_commit::float8 FROM pg_stat_database WHERE datname=current_database()) AS axon_postgres_commits_total,
        (SELECT xact_rollback::float8 FROM pg_stat_database WHERE datname=current_database()) AS axon_postgres_rollbacks_total,
        (SELECT temp_bytes::float8 FROM pg_stat_database WHERE datname=current_database()) AS axon_postgres_temporary_bytes_total,
        (SELECT blks_read::float8 FROM pg_stat_database WHERE datname=current_database()) AS axon_postgres_blocks_read_total,
        (SELECT blks_hit::float8 FROM pg_stat_database WHERE datname=current_database()) AS axon_postgres_buffer_hits_total,
        (SELECT count(*)::float8 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock') AS axon_postgres_lock_waiters,
        (SELECT greatest(0,coalesce(max(extract(epoch FROM now()-xact_start)),0))::float8 FROM pg_stat_activity WHERE datname=current_database()) AS axon_postgres_oldest_transaction_seconds,
        (SELECT deadlocks::float8 FROM pg_stat_database WHERE datname=current_database()) AS axon_postgres_deadlocks_total,
        (SELECT count(*)::float8 FROM domain_event_outbox WHERE status='PENDING') AS axon_outbox_pending,
        (SELECT count(*)::float8 FROM domain_event_outbox WHERE status='PROCESSING') AS axon_outbox_processing,
        (SELECT count(*)::float8 FROM domain_event_outbox WHERE status='FAILED') AS axon_outbox_failed,
        (SELECT count(*)::float8 FROM domain_event_outbox WHERE status='DEAD_LETTER') AS axon_outbox_dead_letter,
        (SELECT greatest(0,coalesce(extract(epoch FROM (now() at time zone 'utc')-min("createdAt")),0))::float8 FROM domain_event_outbox WHERE status IN ('PENDING','PROCESSING','FAILED')) AS axon_outbox_oldest_seconds,
        (SELECT count(*)::float8 FROM domain_event_outbox WHERE status='PROCESSING' AND "leaseExpiresAt"<now()) AS axon_outbox_expired_leases,
        (SELECT coalesce(sum(attempts),0)::float8 FROM domain_event_outbox) AS axon_outbox_attempts,
        (SELECT count(*)::float8 FROM marketplace_sync_jobs WHERE status='DEAD_LETTER') AS axon_worker_dead_letter,
        (SELECT count(*)::float8 FROM e_documents WHERE status IN ('PENDING','PROCESSING','ERROR')) AS axon_edocument_queued,
        (SELECT greatest(0,coalesce(extract(epoch FROM (now() at time zone 'utc')-min("createdAt")),0))::float8 FROM e_documents WHERE status IN ('PENDING','PROCESSING','ERROR')) AS axon_edocument_oldest_seconds,
        (SELECT count(*)::float8 FROM storage_reservations WHERE "cleanupAfter" IS NOT NULL AND "cleanupAttempts">=5) AS axon_storage_cleanup_exhausted,
        (SELECT count(*)::float8 FROM storage_reservations WHERE "cleanupAfter" IS NOT NULL AND "cleanupAttempts"<5) AS axon_storage_cleanup_pending,
        (SELECT count(*)::float8 FROM storage_reservations WHERE "cleanupCompletedAt" IS NOT NULL) AS axon_storage_cleanup_completed,
        (SELECT extract(epoch FROM now())::float8) AS axon_database_time_seconds
    `;
  const values = z.array(numbers).length(1).parse(observations)[0];
  values.axon_database_clock_offset_seconds = Math.abs(values.axon_database_time_seconds - Date.now() / 1000);
  const plans: unknown = await tx.$queryRaw`
      SELECT t.plan::text, coalesce(sum(u."usedBytes"),0)::float8 AS used, coalesce(sum(u."reservedBytes"),0)::float8 AS reserved
      FROM tenants t LEFT JOIN tenant_storage_usage u ON u."tenantId"=t.id GROUP BY t.plan
    `;
  const invariants = await checkBusinessInvariants(tx);
  const reconciliation: unknown = await tx.$queryRaw`
      WITH objects AS (
        SELECT "tenantId", "fileSize"::bigint AS bytes FROM attachments
        UNION ALL SELECT "tenantId", "sizeBytes"::bigint FROM chat_attachments WHERE status='READY' AND "deletedAt" IS NULL
      ), totals AS (SELECT "tenantId", sum(bytes) AS bytes FROM objects GROUP BY "tenantId")
      SELECT count(*)::float8 AS axon_storage_metadata_mismatches
      FROM tenant_storage_usage u FULL JOIN totals o ON o."tenantId"=u."tenantId"
      WHERE coalesce(u."usedBytes",0) <> coalesce(o.bytes,0)
    `;
  Object.assign(values, z.array(numbers).length(1).parse(reconciliation)[0]);
  const audit = await verifyPlatformAuditIntegrity(tx, 5000);
  const lines = Object.entries(values).map(([name, value]) => `# TYPE ${name} ${name.endsWith('_total') ? 'counter' : 'gauge'}\n${name} ${value}`);
  lines.push('# TYPE axon_business_invariant_violations gauge');
  for (const [invariant, value] of Object.entries(invariants.counts))
    lines.push(`axon_business_invariant_violations{invariant="${invariant}"} ${value}`);
  lines.push('# TYPE axon_storage_used_bytes gauge', '# TYPE axon_storage_reserved_bytes gauge');
  for (const row of planSchema.parse(plans))
    lines.push(`axon_storage_used_bytes{plan="${row.plan}"} ${row.used}`, `axon_storage_reserved_bytes{plan="${row.plan}"} ${row.reserved}`);
  lines.push(`# TYPE axon_audit_integrity_valid gauge\naxon_audit_integrity_valid ${audit.valid ? 1 : 0}`, `# TYPE axon_operational_probe_last_success_seconds gauge\naxon_operational_probe_last_success_seconds ${Date.now() / 1000}`);
  return lines.join('\n') + '\n';
}
let cached = '', at = 0, healthy = false;
let pending: Promise<void> | undefined;
/** A single bounded scan per process per 30s. Failed scans never report healthy zeros. */
export async function operationalMetrics(db: PrismaClient): Promise<string> {
  if (!pending && Date.now() - at >= 30000) {
    at = Date.now();
    const started = Date.now();
    pending = collectOperationalProbe(db).then(value => {
      if (Date.now() - started <= 3000) {
        cached = value;
        healthy = true;
      }
      else
        healthy = false;
    }, () => { healthy = false; }).finally(() => { pending = undefined; });
  }
  if (pending)
    await withinProbeDeadline(pending).catch(() => { healthy = false; });
  return `${healthy ? cached : ''}# TYPE axon_operational_probe_up gauge\naxon_operational_probe_up ${healthy ? 1 : 0}\n`;
}
