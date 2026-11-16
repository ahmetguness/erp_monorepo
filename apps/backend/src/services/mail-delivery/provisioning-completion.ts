import type { Prisma } from '@prisma/client';
import { createAuditLog } from '../../utils/audit.js';
import { prisma } from '../../lib/prisma.js';
import { runWithTenantIsolationBypass, runWithTenantScope } from '../../lib/tenant-isolation-context.js';

export interface ProvisioningMailCompletion { jobId: string; attempt: number; }

/** A late email result may only finish the matching provisioning attempt and tenant. */
export async function completeProvisioningMail(tx: Prisma.TransactionClient, tenantId: string, completion: ProvisioningMailCompletion | undefined, success: boolean, error?: string): Promise<void> {
  if (!completion) return;
  const job = await tx.tenantProvisioningJob.findFirst({ where: { id: completion.jobId, provisionedTenantId: tenantId } });
  if (!job) return;
  const step = await tx.tenantProvisioningStep.updateMany({
    where: { jobId: job.id, key: 'EMAIL_SENT', attempts: completion.attempt, status: { in: success ? ['RUNNING', 'FAILED'] : ['RUNNING'] } },
    data: { status: success ? 'SUCCEEDED' : 'FAILED', error: success ? null : error ?? 'Mail delivery failed.' },
  });
  if (!step.count) return;
  await tx.tenantProvisioningJob.updateMany({ where: { id: job.id, provisionedTenantId: tenantId }, data: { status: success ? 'SUCCEEDED' : 'FAILED', error: success ? null : error ?? 'Mail delivery failed.' } });
  await createAuditLog(tx, {
    tenantId, adminId: job.createdById, module: 'TENANT_PROVISIONING', entityType: 'OTHER', entityId: job.id,
    action: 'UPDATE', newValues: { emailDelivered: success }
  }, { required: true });
}

/** A final process crash can exhaust the lease without returning through the provider error handler. */
export async function reconcileProvisioningMailFailures(): Promise<void> {
  const failures = await runWithTenantIsolationBypass('domain-event-outbox-worker-stale-processing', () =>
    prisma.$queryRaw<Array<{ tenantId: string; jobId: string; attempt: number; message: string | null; }>>`
      SELECT event."tenantId", job.id AS "jobId", step.attempts AS attempt, event."lastError" AS message
      FROM domain_event_outbox AS event
      JOIN tenant_provisioning_jobs AS job ON job.id = event.payload->'provisioning'->>'jobId' AND job."tenantId" = event."tenantId"
      JOIN tenant_provisioning_steps AS step ON step."jobId" = job.id AND step.key = 'EMAIL_SENT'
      WHERE event.name = 'mail.delivery.requested' AND event.status = 'DEAD_LETTER'
        AND step.status = 'RUNNING' AND job.status = 'RUNNING'
        AND step.attempts::text = event.payload->'provisioning'->>'attempt'
      LIMIT 100
    `);
  for (const failure of failures) {
    await runWithTenantScope(failure.tenantId, () => prisma.$transaction((tx) =>
      completeProvisioningMail(tx, failure.tenantId, { jobId: failure.jobId, attempt: failure.attempt }, false, failure.message ?? 'Delivery attempts exhausted.')));
  }
}
