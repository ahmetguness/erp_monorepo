import { performanceSQL } from './diagnostics.js';
import { number,object } from './validation.js';

/** Aggregate fixture reconciliation; exact object identity/cleanup is covered by recovery integration tests. */
export async function reconcileStorage(owner:string,providerValue:unknown) {
  const database=object(JSON.parse(await performanceSQL(owner,`WITH objects AS (
    SELECT "tenantId","fileSize"::bigint AS bytes FROM attachments
    UNION ALL SELECT "tenantId","sizeBytes"::bigint FROM chat_attachments WHERE status='READY' AND "deletedAt" IS NULL
  ) SELECT json_build_object(
    'objects',(SELECT count(*)::int FROM objects),
    'bytes',(SELECT coalesce(sum(bytes),0)::float8 FROM objects),
    'activeReservations',(SELECT count(*)::int FROM storage_reservations WHERE status IN ('RESERVED','UPLOADED','SCANNING')),
    'usageMismatches',(SELECT count(*)::int FROM tenant_storage_usage u WHERE u."usedBytes"<>coalesce((SELECT sum(bytes) FROM objects o WHERE o."tenantId"=u."tenantId"),0)),
    'cleanupExhausted',(SELECT count(*)::int FROM storage_reservations WHERE "cleanupAfter" IS NOT NULL AND "cleanupAttempts">=5))`)) as unknown);
  const provider=object(providerValue);
  const passed=number(database.objects)===number(provider.objects)&&number(database.bytes)===number(provider.storedBytes)&&number(database.activeReservations)===0&&number(database.usageMismatches)===0&&number(database.cleanupExhausted)===0;
  return {qualification:'Count/byte reconciliation of the isolated fixture; not cryptographic identity proof.',passed,database,provider:{objects:number(provider.objects),storedBytes:number(provider.storedBytes)}};
}
