import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { docker } from './docker.js';
import type { PerformanceFixture } from '../../packages/types/src/performance.js';

/** Only the postgres container created and labelled by this disposable local run. */
export async function performanceSQL(owner: string, sql: string): Promise<string> {
  if (!/^axon-perf-[a-f0-9]{8}$/.test(owner)) throw new Error('Invalid diagnostic owner.');
  const container = `${owner}-postgres`;
  const actual = await docker(['inspect', '--format', '{{index .Config.Labels "com.axon.performance"}}', container]);
  if (actual !== owner) throw new Error('Diagnostic database ownership mismatch.');
  return docker(['exec', container, 'psql', '-U', 'phase8', '-d', 'phase8_local_ci', '-v', 'ON_ERROR_STOP=1', '-Atc', sql]);
}

export async function captureSQL(owner: string, output: string, label: string): Promise<void> {
  const result = await performanceSQL(owner, `SELECT json_build_object(
    'queries',(SELECT coalesce(json_agg(q),'[]') FROM (
      SELECT queryid::text AS "queryId",query,calls,rows,mean_exec_time AS "meanMs",max_exec_time AS "maxMs",total_exec_time AS "totalMs",
        shared_blks_hit AS "blocksHit",shared_blks_read AS "blocksRead",temp_blks_written AS "tempBlocksWritten"
      FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())
      ORDER BY total_exec_time DESC LIMIT 30) q),
    'activity',(SELECT coalesce(json_agg(a),'[]') FROM (
      SELECT state,wait_event_type,wait_event,EXTRACT(EPOCH FROM now()-xact_start)::float8 AS "transactionSeconds"
      FROM pg_stat_activity WHERE datname=current_database()) a))`);
  await writeFile(join(output, `${label}-sql.json`), JSON.stringify(JSON.parse(result) as unknown, null, 2));
}

export async function capturePlans(owner: string, output: string, fixture: PerformanceFixture): Promise<void> {
  const actor = fixture.actors[0];
  for (const id of [actor.tenantId, actor.userId, actor.conversationId]) if (!/^[a-z0-9-]{20,40}$/i.test(id)) throw new Error('Expected synthetic diagnostic identities.');
  const cases = {
    membership: `SELECT tu.id,tu."roleId",tu."isOwner" FROM tenant_users tu JOIN users u ON u.id=tu."userId" JOIN tenants t ON t.id=tu."tenantId" WHERE tu."tenantId"='${actor.tenantId}' AND tu."userId"='${actor.userId}' AND tu."isActive" AND u."isActive" AND t."deletedAt" IS NULL LIMIT 1`,
    features: `SELECT "featureKey",value,"isEnabled",type FROM plan_features WHERE plan='STARTER' AND "featureKey" IS NOT NULL`,
    products: `SELECT * FROM products WHERE "tenantId"='${actor.tenantId}' AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 20`,
    chatMessages: `SELECT * FROM chat_messages WHERE "tenantId"='${actor.tenantId}' AND "conversationId"='${actor.conversationId}' ORDER BY "createdAt" DESC,id DESC LIMIT 21`,
    realtime: `SELECT e.id,e."tenantId",e."conversationId",e.type,e.payload,e."createdAt",a.users AS "recipientIds" FROM chat_realtime_outbox e CROSS JOIN LATERAL (SELECT array_agg(m."userId") AS users FROM chat_conversation_members m WHERE m."tenantId"=e."tenantId" AND m."conversationId"=e."conversationId" AND m."leftAt" IS NULL AND (e.type LIKE 'conversation.%' OR e.type='sync.required' OR e."createdAt">=greatest(m."visibleFrom",m."clearedAt")) AND m."userId"='${actor.userId}') a WHERE e."tenantId"='${actor.tenantId}' AND e."createdAt">now()-interval '60 seconds' AND a.users IS NOT NULL ORDER BY e."createdAt",e.id LIMIT 500`,
  };
  for (const [label, sql] of Object.entries(cases)) {
    const text = await performanceSQL(owner, `BEGIN READ ONLY; SET LOCAL statement_timeout='5s'; EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}; ROLLBACK;`);
    const start = text.indexOf('['); const end = text.lastIndexOf(']');
    await writeFile(join(output, `explain-${label}.json`), JSON.stringify({ qualification: 'Representative read query with synthetic fixture parameters; not a production plan.', sql, plan: JSON.parse(text.slice(start, end + 1)) as unknown }, null, 2));
  }
  const indexes = await performanceSQL(owner, `SELECT coalesce(json_agg(i),'[]') FROM (SELECT relname,indexrelname,idx_scan,idx_tup_read,idx_tup_fetch,pg_get_indexdef(indexrelid) AS definition,pg_relation_size(indexrelid) AS bytes FROM pg_stat_user_indexes WHERE schemaname='public' ORDER BY pg_relation_size(indexrelid) DESC LIMIT 2000) i`);
  await writeFile(join(output, 'index-usage.json'), JSON.stringify(JSON.parse(indexes) as unknown, null, 2));
}

export async function captureIndexProbe(owner: string, output: string): Promise<void> {
  const query = `SELECT * FROM perf_poll_probe WHERE "tenantId"='synthetic-tenant' AND "createdAt">=timestamp '2026-11-01' + interval '49990 seconds' ORDER BY "createdAt",id LIMIT 500`;
  const text = await performanceSQL(owner, `BEGIN;
    SET LOCAL statement_timeout='15s';
    CREATE TEMP TABLE perf_poll_probe AS SELECT 'synthetic-tenant'::text AS "tenantId",'room-'||(i%50)::text AS "conversationId",
      'event-'||i::text AS id,timestamp '2026-11-01'+i*interval '1 second' AS "createdAt",'{}'::jsonb AS payload FROM generate_series(1,50000) i;
    CREATE INDEX perf_poll_legacy_idx ON perf_poll_probe("tenantId","conversationId","createdAt"); ANALYZE perf_poll_probe;
    SELECT 'PLAN_BEFORE'; EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query};
    CREATE INDEX perf_poll_time_idx ON perf_poll_probe("tenantId","createdAt",id); ANALYZE perf_poll_probe;
    SELECT 'PLAN_AFTER'; EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${query}; ROLLBACK;`);
  const before = text.split('PLAN_BEFORE')[1]?.split('PLAN_AFTER')[0]; const after = text.split('PLAN_AFTER')[1];
  const parse = (value: string | undefined): unknown => { if (!value) throw new Error('Missing diagnostic plan.'); return JSON.parse(value.slice(value.indexOf('['), value.lastIndexOf(']') + 1)) as unknown; };
  await writeFile(join(output, 'explain-index-control.json'), JSON.stringify({ qualification: 'Temporary 50k-row/50-room range-scan control; not production data or a claim of full endpoint speedup.', sql: query, rows: 50_000, before: parse(before), after: parse(after) }, null, 2));
}
