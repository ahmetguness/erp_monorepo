import { Prisma } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { runWithTenantIsolationBypass, runWithTenantScope } from '../../../lib/tenant-isolation-context.js';
import { storageService } from '../../../services/storage.service.js';
import { WorkerLoop } from '../../shared/index.js';
import { StoragePlanResolver } from '../domain/storage-plan.js';

const plans = new StoragePlanResolver(prisma);
const loop = new WorkerLoop('ChatRetentionWorker', 60 * 60 * 1_000, async () => { await processRetentionBatch(); });

async function tenantCandidates(): Promise<Array<{ id: string; legalHold: boolean }>> {
  return runWithTenantIsolationBypass('chat-retention-worker-tenants', async () => {
    return await prisma.tenant.findMany({
      where: { deletedAt: null }, select: { id: true, legalHold: true }, take: 1000,
    });
  });
}

async function retainTenant(tenantId: string, legalHold: boolean, deadline: number): Promise<number> {
  if (legalHold) return 0;
  return runWithTenantScope(tenantId, async () => {
    const limits = await plans.resolve(tenantId);
    if (limits.chatRetentionDays === null) return 0;
    const cutoff = new Date(Date.now() - limits.chatRetentionDays * 86_400_000);
    const messages = await prisma.chatMessage.findMany({
      where: {
        tenantId,
        createdAt: { lt: cutoff },
        OR: [{ deletedAt: null }, { attachments: { some: { deletedAt: null } } }],
      },
      select: { id: true, attachments: { where: { deletedAt: null }, select: { id: true, storageKey: true, sizeBytes: true } } },
      orderBy: { createdAt: 'asc' }, take: 100,
    });
    if (messages.length === 0) return 0;
    const attachments = messages.flatMap((message) => message.attachments);
    const deletedAttachments: typeof attachments = [];
    for (const attachment of attachments) {
      if (loop.isStopping || Date.now() >= deadline || deletedAttachments.length >= 20) break;
      try {
        await storageService.delete(attachment.storageKey);
        deletedAttachments.push(attachment);
      } catch {
        // Preserve metadata and accounting so a later run can retry deletion.
      }
    }
    await prisma.$transaction(async (tx) => {
      await tx.chatMessage.updateMany({
        where: { tenantId, id: { in: messages.map((message) => message.id) } },
        data: { content: null, deletedAt: new Date(), deleteReason: 'RETENTION_EXPIRED' },
      });
      let releasedBytes = 0n;
      for (const attachment of deletedAttachments.sort((left, right) => left.id.localeCompare(right.id))) {
        const completed = await tx.chatAttachment.updateMany({
          where: { tenantId, id: attachment.id, deletedAt: null },
          data: { status: 'DELETED', deletedAt: new Date() },
        });
        if (completed.count === 1) releasedBytes += BigInt(attachment.sizeBytes);
      }
      if (releasedBytes > 0n) await tx.$executeRaw(Prisma.sql`
        UPDATE "tenant_storage_usage"
        SET "usedBytes" = GREATEST(0, "usedBytes" - ${releasedBytes}),
            "version" = "version" + 1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "tenantId" = ${tenantId}
      `);
    });
    return messages.length;
  });
}

export async function processRetentionBatch(): Promise<number> {
  let processed = 0;
  const deadline = Date.now() + 240_000;
  for (const tenant of await tenantCandidates()) {
    if (loop.isStopping || Date.now() >= deadline) break;
    processed += await retainTenant(tenant.id, tenant.legalHold, deadline);
  }
  return processed;
}

export const ChatRetentionWorker = {
  start(): void { loop.start(); },
  stop(): Promise<void> { return loop.stop(); },
  processBatch: processRetentionBatch,
};
