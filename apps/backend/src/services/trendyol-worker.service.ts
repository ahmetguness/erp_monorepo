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
import { logger } from '../lib/logger';
import {
  TrendyolService,
  buildTrendyolCredentials,
  mapTrendyolOrderStatus,
} from './trendyol.service';
import { MarketplaceOrderStatus, Prisma, SyncJobType, SyncJobStatus } from '@prisma/client';

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

export type JobParams = SyncOrdersParams | SyncStockParams;

// ---------------------------------------------
// Worker
// ---------------------------------------------

let running = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;

export const TrendyolWorker = {

  start() {
    if (running) return;
    running = true;
    logger.info('[TrendyolWorker] Started');
    schedulePoll();
  },

  stop() {
    running = false;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    logger.info('[TrendyolWorker] Stopped');
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

  async getJob(jobId: string) {
    return prisma.marketplaceSyncJob.findUnique({ where: { id: jobId } });
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
async function claimNextJob() {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE marketplace_sync_jobs
    SET    status = 'RUNNING', "startedAt" = NOW(), "updatedAt" = NOW()
    WHERE  id = (
      SELECT id FROM marketplace_sync_jobs
      WHERE  status = 'PENDING'
      ORDER  BY "createdAt" ASC
      LIMIT  1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;
  if (!rows.length) return null;
  return prisma.marketplaceSyncJob.findUnique({ where: { id: rows[0].id } });
}

// ---------------------------------------------
// Poll loop
// ---------------------------------------------

function schedulePoll() {
  if (!running) return;
  pollTimer = setTimeout(async () => {
    try { await processPendingJobs(); } catch (err) {
      logger.error(`[TrendyolWorker] Poll error: ${(err as Error).message}`);
    }
    schedulePoll();
  }, POLL_INTERVAL_MS);
}

async function processPendingJobs() {
  let job: Awaited<ReturnType<typeof claimNextJob>>;
  try {
    job = await claimNextJob();
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('does not exist') || msg.includes('P2021')) return;
    throw err;
  }
  if (!job) return;

  logger.info(`[TrendyolWorker] Running job ${job.id} (${job.jobType})`);

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Job timeout')), JOB_TIMEOUT_MS),
  );

  try {
    const result = await Promise.race([
      runJob(job.tenantId, job.integrationId, job.jobType, (job.params ?? {}) as JobParams),
      timeout,
    ]);

    const apiLimits = TrendyolService.getApiLimitRemaining();
    const finalResult = {
      ...(result || {}),
      apiLimitRemaining: apiLimits.remaining,
      apiLimitResetAt: apiLimits.resetAt,
    };

    await prisma.marketplaceSyncJob.updateMany({
      where: { id: job.id, tenantId: job.tenantId },
      data: {
        status: SyncJobStatus.DONE,
        finishedAt: new Date(),
        processedCount: result.processedCount,
        errorCount: result.errorCount,
        result: finalResult as Prisma.InputJsonValue,
      },
    });
    logger.info(`[TrendyolWorker] Job ${job.id} done: ${JSON.stringify(finalResult)}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[TrendyolWorker] Job ${job.id} failed: ${msg}`);
    await prisma.marketplaceSyncJob.updateMany({
      where: { id: job.id, tenantId: job.tenantId },
      data: { status: SyncJobStatus.FAILED, finishedAt: new Date(), errorMessage: msg, errorCount: 1 },
    });
    await prisma.marketplaceIntegration.updateMany({
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
  if (!integration) throw new Error(`Integration ${integrationId} not found`);
  const creds = buildTrendyolCredentials(integration);

  switch (jobType) {
    case SyncJobType.SYNC_ORDERS: return runSyncOrders(tenantId, integrationId, creds, params as SyncOrdersParams);
    case SyncJobType.SYNC_STOCK:  return runSyncStock(tenantId, integrationId, creds, params as SyncStockParams);
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
          const mappedStatus = mapTrendyolOrderStatus(order.status) as MarketplaceOrderStatus;
          const customerName = [order.customerFirstName, order.customerLastName]
            .filter(Boolean).join(' ').trim() || null;

          const existing = await prisma.marketplaceOrder.findFirst({
            where: { tenantId, integrationId, externalId },
          });

          if (existing) {
            if (existing.status !== mappedStatus) {
              await prisma.marketplaceOrder.update({
                where: { id: existing.id },
                data: { status: mappedStatus, updatedAt: new Date() },
              });
              updated++;
            } else {
              skipped++;
            }
            continue;
          }

          await prisma.marketplaceOrder.create({
            data: {
              tenantId, integrationId, externalId,
              channel: 'TRENDYOL',
              status: mappedStatus,
              customerName,
              customerEmail: order.customerEmail ?? null,
              customerPhone: order.shipmentAddress?.phone ?? null,
              shippingAddress: order.shipmentAddress?.fullAddress ?? null,
              totalAmount: order.packageGrossAmount,
              orderDate: new Date(order.orderDate),
              syncedAt: new Date(),
              items: {
                create: order.lines.map((line) => ({
                  tenantId,
                  externalProductId: String(line.contentId),
                  name: line.productName,
                  quantity: line.quantity,
                  unitPrice: line.lineUnitPrice,
                  lineTotal: line.lineGrossAmount,
                })),
              },
            },
          });
          created++;
        } catch (err) {
          errors++;
          logger.error(`[TrendyolWorker] Order sync error for ${order.shipmentPackageId}: ${(err as Error).message}`);
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
      errors++;
      logger.error(`[TrendyolWorker] Stock batch error: ${(err as Error).message}`);
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
