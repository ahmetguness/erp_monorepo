import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { StorageReservationService } from '../../src/modules/storage-accounting/application/storage-reservation.service.js';
import { ConflictError } from '../../src/errors/index.js';

export async function verifyPlanQuotas(db: PrismaClient) {
  const results: Array<{ plan: string; accepted: number; raceAccepted: number; rejected: number; contention: number; sharedSources: string[]; limitEnforced: boolean; passed: boolean }> = [];
  for (const plan of ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const) {
    const tenant = await db.tenant.create({ data: { slug: `phase8-${randomUUID()}-quota`, companyName: 'Synthetic quota race', email: 'quota@example.test', plan, status: 'ACTIVE' } });
    await db.tenantFeatureOverride.create({ data: { tenantId: tenant.id, featureKey: 'STORAGE_LIMIT_BYTES', value: '10240' } });
    const service = new StorageReservationService(db);
    const attempts = await Promise.allSettled(Array.from({ length: 25 }, (_, index) => service.reserve({ tenantId: tenant.id,
      source: index % 2 === 0 ? 'ERP_ATTACHMENT' : 'CHAT_ATTACHMENT', objectKey: `${tenant.id}/${index}`, originalName: 'quota.txt', contentType: 'text/plain', createdById: 'synthetic-quota-actor', expectedBytes: 1024 })));
    const accepted = attempts.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
    const raceAccepted = accepted.length;
    let rejected = 0; let contention = 0;
    for (const result of attempts) if (result.status === 'rejected') {
      const error: unknown = result.reason;
      if (error instanceof ConflictError) rejected++;
      else if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || (error.code === 'P2010' && error.meta?.code === '40001'))) contention++;
      else throw new Error('Unexpected failure in shared quota race.');
    }
    while (accepted.length < 10) accepted.push(await service.reserve({ tenantId: tenant.id, source: 'ERP_ATTACHMENT', objectKey: `${tenant.id}/fill-${accepted.length}`, originalName: 'quota.txt', contentType: 'text/plain', createdById: 'synthetic-quota-actor', expectedBytes: 1024 }));
    let limitEnforced = false;
    try { await service.reserve({ tenantId: tenant.id, source: 'ERP_ATTACHMENT', objectKey: `${tenant.id}/overflow`, originalName: 'overflow.txt', contentType: 'text/plain', createdById: 'synthetic-quota-actor', expectedBytes: 1 }); }
    catch (error) { if (error instanceof ConflictError) limitEnforced = true; else throw error; }
    const usage = await db.tenantStorageUsage.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    const sharedSources = [...new Set(attempts.flatMap((result, index) => result.status === 'fulfilled' ? [index % 2 === 0 ? 'ERP_ATTACHMENT' : 'CHAT_ATTACHMENT'] : []))];
    let passed = sharedSources.length === 2 && accepted.length === 10 && limitEnforced && usage.reservedBytes === BigInt(accepted.length * 1024) && usage.usedBytes === 0n;
    for (const reservation of accepted) await service.release(tenant.id, reservation.id, 'CANCELLED');
    passed &&= (await db.tenantStorageUsage.findUniqueOrThrow({ where: { tenantId: tenant.id } })).reservedBytes === 0n;
    results.push({ plan, accepted: accepted.length, raceAccepted, rejected, contention, sharedSources, limitEnforced, passed });
    await db.tenant.delete({ where: { id: tenant.id } });
  }
  return { passed: results.every((row) => row.passed), results };
}
