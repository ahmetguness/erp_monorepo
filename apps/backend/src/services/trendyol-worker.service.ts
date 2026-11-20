import { toDomainEventJson } from '../domain-events/outbox.js';
import { z } from 'zod';
import { runWithProviderDeadline, providerRequestSignal } from '../infrastructure/providers/request-context.js';
import { PermanentDeliveryError } from '../domain-events/delivery/retry-policy.js';
import { upsertMarketplaceOrder } from '../modules/marketplace/infrastructure/index.js';
import { TrendyolApiError } from './trendyol/transport.js';
/**
 * Trendyol Sync Worker
 *
 * In-process job queue -- persisted in marketplace_sync_jobs table.
 *
 * Concurrency note:
 *   claimNextJob() uses an atomic UPDATE ... RETURNING with row locking so
 *   multiple API instances can safely run the worker without double-processing.
 */

import { prisma } from '../lib/prisma';
import { logger, diagnosticErrorFields } from '../lib/logger';
import {
  TrendyolService,
  buildTrendyolCredentials,
  mapTrendyolOrderStatus,
} from './trendyol.service';
import { Prisma, SyncJobType, SyncJobStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { nextRetryDate, WorkerLoop } from '../modules/shared/index.js';
import { runWithTenantIsolationBypass, runWithTenantScope } from '../lib/tenant-isolation-context.js';

// ---------------------------------------------
// Config
// ---------------------------------------------

const POLL_INTERVAL_MS = 5_000;
const JOB_TIMEOUT_MS = 5 * 60_000;
const FIFTEEN_MIN_MS = 15 * 60_000;

// ---------------------------------------------
// Job param types
// ---------------------------------------------

// Re-export for backwards compatibility
export type { SyncJobType as JobType };

export interface SyncOrdersParams {
  hoursBack?: number;
  status?: string;
}

export interface SyncStockParams {
  force?: boolean;
}

export interface JobParams extends SyncOrdersParams, SyncStockParams { }

// ---------------------------------------------
// Worker
// ---------------------------------------------

let workerLoop: WorkerLoop | null = null;

export const TrendyolWorker = {

  start() {
    if (workerLoop) return;
    workerLoop = new WorkerLoop('TrendyolWorker', POLL_INTERVAL_MS, processPendingJobs);
    workerLoop.start();
  },

  async stop(): Promise<void> {
    const loop = workerLoop;
    workerLoop = null;
    await loop?.stop();
  },

  async enqueue(
    tenantId: string,
    integrationId: string,
    jobType: SyncJobType,
    params: JobParams = {},
  ): Promise<string> {
    const job = await prisma.marketplaceSyncJob.create({
      data: {
        tenantId, integrationId, jobType,
        params: params as Prisma.InputJsonValue,
        status: SyncJobStatus.PENDING,
      },
    });
    logger.info(`[TrendyolWorker] Enqueued ${jobType} job ${job.id}`);
    return job.id;
  },

  async getJob(jobId: string, tenantId: string) {
    return prisma.marketplaceSyncJob.findFirst({ where: { id: jobId, tenantId } });
  },
};

// ---------------------------------------------
// Atomic job claim
// ---------------------------------------------

/**
 * Atomically claim the next PENDING job using a raw UPDATE...RETURNING.
 * Safe for multi-process/pod deployments because the row is locked and status
 * is changed to RUNNING in a single statement.
 */
async function claimNextJob(tenantId?: string) {
  return runWithTenantIsolationBypass('marketplace-worker-atomic-claim', async () => {
    const leaseExpiresAt = new Date(Date.now() + JOB_TIMEOUT_MS + 30_000);
    const leaseOwner = randomUUID();
    await prisma.marketplaceSyncJob.updateMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: SyncJobStatus.RUNNING,
        leaseExpiresAt: { lte: new Date() },
      },
      data: {
        status: SyncJobStatus.FAILED,
        errorMessage: 'Worker lease expired; job returned for retry.',
        nextRetryAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    await prisma.marketplaceSyncJob.updateMany({
      where: { ...(tenantId ? { tenantId } : {}), status: SyncJobStatus.FAILED, attempts: { gte: prisma.marketplaceSyncJob.fields.maxAttempts } },
      data: { status: SyncJobStatus.DEAD_LETTER, nextRetryAt: null, leaseOwner: null, leaseExpiresAt: null },
    });
    const rows = await prisma.$queryRaw<Array<{ id: string; tenantId: string }>>`
      UPDATE marketplace_sync_jobs
      SET    status = 'RUNNING',
             "startedAt" = NOW(),
             "finishedAt" = NULL,
             attempts = attempts + 1,
             "leaseOwner" = ${leaseOwner},
             "leaseExpiresAt" = ${leaseExpiresAt},
             "updatedAt" = NOW()
      WHERE  id = (
        SELECT id FROM marketplace_sync_jobs
        WHERE  status IN ('PENDING', 'FAILED')
          AND (${tenantId ?? null}::text IS NULL OR "tenantId" = ${tenantId ?? null})
          AND attempts < "maxAttempts"
          AND "quarantinedAt" IS NULL AND "resolvedAt" IS NULL
          AND ("nextRetryAt" IS NULL OR "nextRetryAt" <= NOW())
        ORDER  BY "createdAt" ASC
        LIMIT  1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, "tenantId"
    `;
    const claimed = rows[0];
    if (!claimed) return null;
    return prisma.marketplaceSyncJob.findFirst({ where: { id: claimed.id, tenantId: claimed.tenantId } });
  });
}

// ---------------------------------------------
// Poll loop
// ---------------------------------------------

export async function processPendingJobs(tenantId?: string): Promise<void> {
  let job: Awaited<ReturnType<typeof claimNextJob>>;
  try {
    job = await claimNextJob(tenantId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('does not exist') || msg.includes('P2021')) return;
    throw err;
  }
  if (!job) return;

  await runWithTenantScope(job.tenantId, () => processClaimedJob(job));
}

async function processClaimedJob(job: NonNullable<Awaited<ReturnType<typeof claimNextJob>>>): Promise<void> {

  logger.info(`[TrendyolWorker] Running job ${job.id} (${job.jobType})`);

  try {
    const params = z.object({ hoursBack: z.number().positive().optional(), status: z.string().optional(), force: z.boolean().optional() }).safeParse(job.params ?? {});
    if (!params.success) throw new PermanentDeliveryError('Invalid marketplace job parameters.');
    const result = await runWithProviderDeadline(JOB_TIMEOUT_MS, () => runJob(job.tenantId, job.integrationId, job.jobType, params.data));
    if (result.errorCount > 0) throw new Error(`Marketplace job has ${result.errorCount} unsuccessful items.`);

    const apiLimits = TrendyolService.getApiLimitRemaining();
    const finalResult = {
      ...(result || {}),
      apiLimitRemaining: apiLimits.remaining,
      apiLimitResetAt: apiLimits.resetAt,
    };

    await prisma.marketplaceSyncJob.updateMany({
      where: { id: job.id, tenantId: job.tenantId, status: SyncJobStatus.RUNNING, leaseOwner: job.leaseOwner },
      data: {
        status: SyncJobStatus.DONE,
        finishedAt: new Date(),
        processedCount: result.processedCount,
        errorCount: result.errorCount,
        result: toDomainEventJson(finalResult) ?? Prisma.JsonNull,
        nextRetryAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    logger.info(`[TrendyolWorker] Job ${job.id} done: ${JSON.stringify(finalResult)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Marketplace job failed', { operation: 'marketplace.sync', ...diagnosticErrorFields(err) });
    const exhausted = job.attempts >= job.maxAttempts || err instanceof PermanentDeliveryError || (err instanceof TrendyolApiError && !err.isRetryable);
    const failed = await prisma.marketplaceSyncJob.updateMany({
      where: { id: job.id, tenantId: job.tenantId, status: SyncJobStatus.RUNNING, leaseOwner: job.leaseOwner },
      data: {
        status: exhausted ? SyncJobStatus.DEAD_LETTER : SyncJobStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: msg.slice(0, 2000),
        errorCount: 1,
        nextRetryAt: exhausted ? null : nextRetryDate(job.attempts, new Date()),
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (failed.count) await prisma.marketplaceIntegration.updateMany({
      where: { id: job.integrationId, tenantId: job.tenantId },
      data: { syncErrors: { increment: 1 } },
    }).catch(() => {});
  }
}

interface JobResult {
  processedCount: number;
  errorCount: number;
  [key: string]: unknown;
}

async function runJob(
  tenantId: string,
  integrationId: string,
  jobType: SyncJobType,
  params: JobParams,
): Promise<JobResult> {
  const integration = await prisma.marketplaceIntegration.findFirst({
    where: { id: integrationId, tenantId },
  });
  if (!integration || !integration.isActive) throw new PermanentDeliveryError('Marketplace integration is unavailable.');
  const creds = buildTrendyolCredentials(integration);

  switch (jobType) {
    case SyncJobType.SYNC_ORDERS: return runSyncOrders(tenantId, integrationId, creds, params);
    case SyncJobType.SYNC_STOCK: return runSyncStock(tenantId, integrationId, creds, params);
    default: throw new Error(`Unknown job type: ${jobType}`);
  }
}

// ---------------------------------------------

async function runSyncOrders(
  tenantId: string,
  integrationId: string,
  creds: ReturnType<typeof buildTrendyolCredentials>,
  params: SyncOrdersParams,
): Promise<JobResult> {
  const hoursBack = Math.min(params.hoursBack ?? 24, 336);
  const end = Date.now();
  const start = end - hoursBack * 3_600_000;

  let created = 0, updated = 0, skipped = 0, errors = 0;

  const { totalFetched } = await TrendyolService.paginateOrders(
    creds,
    { startDate: start, endDate: end, status: params.status, pageSize: 200 },
    async (orders) => {
      for (const order of orders) {
        try {
          const externalId = String(order.shipmentPackageId);
          const mappedStatus = mapTrendyolOrderStatus(order.status);
          const customerName = [order.customerFirstName, order.customerLastName]
            .filter(Boolean).join(' ').trim() || null;

          providerRequestSignal()?.throwIfAborted();
          const existing = await prisma.marketplaceOrder.findFirst({ where: { tenantId, integrationId, externalId }, select: { id: true, status: true } });
          await upsertMarketplaceOrder(prisma, tenantId, integrationId, {
            packageId: externalId, status: mappedStatus, customerName, customerEmail: order.customerEmail ?? null,
            customerPhone: order.shipmentAddress?.phone ?? null, shippingAddress: order.shipmentAddress?.fullAddress ?? null,
            totalAmount: order.packageGrossAmount, orderDate: new Date(order.orderDate), lastModifiedDate: String(order.lastModifiedDate),
            lines: order.lines.map((line) => ({
              contentId: String(line.contentId), productName: line.productName,
              quantity: line.quantity, unitPrice: line.lineUnitPrice, lineTotal: line.lineGrossAmount
            })),
          });
          if (!existing) created++;
          else if (existing.status !== mappedStatus) updated++;
          else skipped++;
        } catch (err) {
          errors++;
          logger.error('Marketplace order synchronization failed', { operation: 'marketplace.orders', ...diagnosticErrorFields(err) });
        }
      }
    },
  );

  await prisma.marketplaceIntegration.updateMany({
    where: { id: integrationId, tenantId },
    data: { lastSyncAt: new Date(), syncErrors: errors > 0 ? { increment: errors } : 0 },
  });

  return { processedCount: totalFetched, errorCount: errors, created, updated, skipped };
}

// ---------------------------------------------

async function runSyncStock(
  tenantId: string,
  integrationId: string,
  creds: ReturnType<typeof buildTrendyolCredentials>,
  params: SyncStockParams,
): Promise<JobResult> {
  const listings = await prisma.marketplaceListing.findMany({
    where: { tenantId, integrationId, isActive: true },
    include: {
      product: { select: { salesPrice: true, stockLevels: { select: { quantity: true } } } },
      snapshot: true,
    },
  });

  if (listings.length === 0) {
    return { processedCount: 0, errorCount: 0, message: 'No active listings' };
  }

  const now = Date.now();
  const itemsToSend: Array<{
    barcode: string; quantity: number; salePrice: number; listPrice: number; listingId: string;
  }> = [];

  for (const listing of listings) {
    const totalStock = listing.product.stockLevels.reduce((s, sl) => s + Number(sl.quantity), 0);
    const salePrice = Math.round(Number(listing.price) * 100) / 100;
    const listPrice = Math.round(Math.max(salePrice, salePrice * 1.05) * 100) / 100;
    const qty = Math.floor(totalStock);
    const snap = listing.snapshot;

    if (!params.force && snap) {
      const sameValues =
        Number(snap.lastSentQty) === qty &&
        Number(snap.lastSentSalePrice) === salePrice &&
        Number(snap.lastSentListPrice) === listPrice;
      const withinWindow = now - snap.lastSentAt.getTime() < FIFTEEN_MIN_MS;
      if (sameValues && withinWindow) continue;
    }

    itemsToSend.push({ barcode: listing.externalId, quantity: qty, salePrice, listPrice, listingId: listing.id });
  }

  if (itemsToSend.length === 0) {
    return { processedCount: 0, errorCount: 0, message: 'No changes to send' };
  }

  const batchIds: string[] = [];
  let errors = 0;
  let batchFailed = 0;

  for (let i = 0; i < itemsToSend.length; i += 1000) {
    providerRequestSignal()?.throwIfAborted();
    const chunk = itemsToSend.slice(i, i + 1000);
    try {
      const res = await TrendyolService.updatePriceAndInventory(creds, chunk);
      batchIds.push(res.batchRequestId);

      // Wait for batch result and check item-level failures
      const summary = await TrendyolService.waitForBatch(creds, res.batchRequestId, {
        pollIntervalMs: 3_000,
        maxWaitMs: 60_000,
      });

      if (summary.failed > 0) {
        batchFailed += summary.failed;
        logger.error(
          `[TrendyolWorker] Batch ${res.batchRequestId} failed items (${summary.failed}/${summary.total}): ` +
          JSON.stringify(summary.failures),
        );
      }

      // Update snapshots only for items that succeeded
      const failedBarcodes = new Set(summary.failures.map((f) => f.barcode));
      for (const item of chunk) {
        if (failedBarcodes.has(item.barcode)) continue; // don't snapshot failed items
        providerRequestSignal()?.throwIfAborted();
        await prisma.marketplaceListingSnapshot.upsert({
          where: { listingId: item.listingId },
          create: {
            tenantId, listingId: item.listingId,
            lastSentQty: item.quantity,
            lastSentSalePrice: item.salePrice,
            lastSentListPrice: item.listPrice,
            lastSentAt: new Date(),
            batchRequestId: res.batchRequestId,
          },
          update: {
            lastSentQty: item.quantity,
            lastSentSalePrice: item.salePrice,
            lastSentListPrice: item.listPrice,
            lastSentAt: new Date(),
            batchRequestId: res.batchRequestId,
          },
        });
      }
    } catch (err) {
      if (providerRequestSignal()?.aborted || (err instanceof TrendyolApiError && !err.isRetryable)) throw err;
      errors++;
      logger.error('Marketplace stock batch failed', { operation: 'marketplace.stock', ...diagnosticErrorFields(err) });
    }
  }

  const totalErrors = errors + batchFailed;
  await prisma.marketplaceIntegration.updateMany({
    where: { id: integrationId, tenantId },
    data: { lastSyncAt: new Date(), syncErrors: totalErrors > 0 ? { increment: totalErrors } : 0 },
  });

  return {
    processedCount: itemsToSend.length,
    errorCount: totalErrors,
    sent: itemsToSend.length,
    skipped: listings.length - itemsToSend.length,
    batchFailed,
    batchRequestIds: batchIds,
  };
}


// ---------------------------------------------
