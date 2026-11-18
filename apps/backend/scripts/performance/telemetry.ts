import type { PrismaClient } from '@prisma/client';

export async function databaseTelemetry(db: PrismaClient) {
  const [database] = await db.$queryRaw<Array<{ connections: number; active: number; lockWaiters: number; idleTransactions: number; oldestTransactionSeconds: number; deadlocks: number; databaseBytes: number; transactions: number; tempBytes: number }>>`
    SELECT (SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database()) AS connections,
      (SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database() AND state='active') AS active,
      (SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock') AS "lockWaiters",
      (SELECT count(*)::int FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction') AS "idleTransactions",
      (SELECT coalesce(max(EXTRACT(EPOCH FROM now()-xact_start)),0)::float8 FROM pg_stat_activity WHERE datname=current_database()) AS "oldestTransactionSeconds",
      deadlocks::int, pg_database_size(datid)::float8 AS "databaseBytes", (xact_commit+xact_rollback)::float8 AS transactions,
      temp_bytes::float8 AS "tempBytes" FROM pg_stat_database WHERE datname=current_database()
  `;
  const [queue] = await db.$queryRaw<Array<{ pending: number; processing: number; failed: number; deadLetter: number; processed: number; oldestSeconds: number; processingP95Seconds: number }>>`
    SELECT count(*) FILTER(WHERE status='PENDING')::int AS pending,
      count(*) FILTER(WHERE status='PROCESSING')::int AS processing,
      count(*) FILTER(WHERE status='FAILED')::int AS failed,
      count(*) FILTER(WHERE status='DEAD_LETTER')::int AS "deadLetter",
      count(*) FILTER(WHERE status='PROCESSED')::int AS processed,
      coalesce(EXTRACT(EPOCH FROM now()-min("createdAt") FILTER(WHERE status IN ('PENDING','PROCESSING','FAILED'))),0)::float8 AS "oldestSeconds",
      coalesce(percentile_cont(0.95) WITHIN GROUP(ORDER BY EXTRACT(EPOCH FROM "processedAt"-"createdAt")) FILTER(WHERE status='PROCESSED'),0)::float8 AS "processingP95Seconds"
    FROM domain_event_outbox
  `;
  const tenants = await db.$queryRaw<Array<{ tenantId: string; plan: string; storageBytes: number; reservedBytes: number; uploadedBytes: number; downloadedBytes: number; inputTokens: number; outputTokens: number; invoices: number; payments: number; messages: number }>>`
    SELECT t.id AS "tenantId", t.plan::text, coalesce(u."usedBytes",0)::float8 AS "storageBytes", coalesce(u."reservedBytes",0)::float8 AS "reservedBytes",
      coalesce((SELECT sum("uploadedBytes") FROM storage_traffic_daily WHERE "tenantId"=t.id),0)::float8 AS "uploadedBytes",
      coalesce((SELECT sum("downloadedBytes") FROM storage_traffic_daily WHERE "tenantId"=t.id),0)::float8 AS "downloadedBytes",
      coalesce((SELECT sum("tokenPrompt") FROM ai_request_logs WHERE "tenantId"=t.id),0)::float8 AS "inputTokens",
      coalesce((SELECT sum("tokenCompletion") FROM ai_request_logs WHERE "tenantId"=t.id),0)::float8 AS "outputTokens",
      (SELECT count(*)::int FROM invoices WHERE "tenantId"=t.id) AS invoices,
      (SELECT count(*)::int FROM payments WHERE "tenantId"=t.id) AS payments,
      (SELECT count(*)::int FROM chat_messages WHERE "tenantId"=t.id) AS messages
    FROM tenants t LEFT JOIN tenant_storage_usage u ON u."tenantId"=t.id WHERE t.slug LIKE 'phase8-%' AND t.slug NOT LIKE '%-quota'
  `;
  let queries: Array<{ queryId: string; calls: number; meanMs: number; maxMs: number; totalMs: number }> | null = null;
  const [extension] = await db.$queryRaw<Array<{ available: boolean }>>`SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_stat_statements') AS available`;
  if (extension?.available) queries = await db.$queryRaw`
    SELECT queryid::text AS "queryId", calls::float8, mean_exec_time::float8 AS "meanMs", max_exec_time::float8 AS "maxMs", total_exec_time::float8 AS "totalMs"
    FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database()) ORDER BY total_exec_time DESC LIMIT 10
  `;
  const failures = await db.domainEventOutbox.findMany({ where: { status: { in: ['FAILED', 'DEAD_LETTER'] } }, select: { name: true, lastError: true }, take: 5 });
  return { at: new Date().toISOString(), database, queue, tenants, queries, failures };
}
