import { Prisma, PrismaClient, SyncJobStatus } from '@prisma/client';

type IntegrationWithSecrets = {
  apiKey: string | null;
  apiSecret: string | null;
};

type SanitizedIntegration<T extends IntegrationWithSecrets> = Omit<T, 'apiKey' | 'apiSecret'> & {
  apiKey: null;
  apiSecret: null;
  hasApiKey: boolean;
  hasApiSecret: boolean;
};

export interface MarketplaceIntegrationHealthSummary {
  integration: SanitizedIntegration<Prisma.MarketplaceIntegrationGetPayload<{
    include: { _count: { select: { listings: true; orders: true } } };
  }>>;
  lastSuccessfulSyncAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorMessage: string | null;
  errorRate: number;
  pendingJobCount: number;
  runningJobCount: number;
  failedJobCount: number;
  retryAvailableCount: number;
  webhookReplayCount: number;
  webhookFailureCount: number;
  apiLimit: {
    status: 'UNKNOWN' | 'OK' | 'WARNING' | 'LIMITED';
    remaining: number | null;
    resetAt: string | null;
  };
}

export interface MarketplaceMonitoringHealth {
  totals: {
    integrations: number;
    pendingJobs: number;
    runningJobs: number;
    failedJobs: number;
    retryAvailable: number;
    webhookReplayAvailable: number;
    webhookFailures: number;
  };
  items: MarketplaceIntegrationHealthSummary[];
}

function hideIntegrationSecrets<T extends IntegrationWithSecrets>(integration: T): SanitizedIntegration<T> {
  const { apiKey, apiSecret, ...rest } = integration;
  return {
    ...rest,
    apiKey: null,
    apiSecret: null,
    hasApiKey: Boolean(apiKey),
    hasApiSecret: Boolean(apiSecret),
  };
}

function isJsonObject(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJsonNumber(value: Prisma.JsonValue | null, keys: string[]): number | null {
  if (!isJsonObject(value)) return null;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === 'string') {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function readJsonString(value: Prisma.JsonValue | null, keys: string[]): string | null {
  if (!isJsonObject(value)) return null;
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;
  }
  return null;
}

function getApiLimitStatus(remaining: number | null): 'UNKNOWN' | 'OK' | 'WARNING' | 'LIMITED' {
  if (remaining === null) return 'UNKNOWN';
  if (remaining <= 0) return 'LIMITED';
  if (remaining <= 20) return 'WARNING';
  return 'OK';
}

function calculateErrorRate(total: number, failed: number): number {
  if (total <= 0) return 0;
  return Math.round((failed / total) * 1000) / 10;
}

export class MarketplaceMonitoringService {
  constructor(private readonly db: PrismaClient) {}

  async health(tenantId: string): Promise<MarketplaceMonitoringHealth> {
    const integrations = await this.db.marketplaceIntegration.findMany({
      where: { tenantId },
      include: { _count: { select: { listings: true, orders: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const items: MarketplaceIntegrationHealthSummary[] = await Promise.all(
      integrations.map(async (integration) => {
        const [
          totalJobCount,
          failedJobCount,
          pendingJobCount,
          runningJobCount,
          lastDoneJob,
          lastFailedJob,
          webhookFailureCount,
          webhookReplayCount,
          latestJobWithResult,
        ] = await this.db.$transaction([
          this.db.marketplaceSyncJob.count({ where: { tenantId, integrationId: integration.id } }),
          this.db.marketplaceSyncJob.count({ where: { tenantId, integrationId: integration.id, status: SyncJobStatus.FAILED } }),
          this.db.marketplaceSyncJob.count({ where: { tenantId, integrationId: integration.id, status: SyncJobStatus.PENDING } }),
          this.db.marketplaceSyncJob.count({ where: { tenantId, integrationId: integration.id, status: SyncJobStatus.RUNNING } }),
          this.db.marketplaceSyncJob.findFirst({
            where: { tenantId, integrationId: integration.id, status: SyncJobStatus.DONE },
            orderBy: { finishedAt: 'desc' },
            select: { finishedAt: true },
          }),
          this.db.marketplaceSyncJob.findFirst({
            where: { tenantId, integrationId: integration.id, status: SyncJobStatus.FAILED },
            orderBy: { finishedAt: 'desc' },
            select: { finishedAt: true, updatedAt: true, errorMessage: true },
          }),
          this.db.marketplaceWebhookEvent.count({
            where: { tenantId, integrationId: integration.id, errorMessage: { not: null } },
          }),
          this.db.marketplaceWebhookEvent.count({
            where: {
              tenantId,
              integrationId: integration.id,
              OR: [{ processedAt: null }, { errorMessage: { not: null } }],
            },
          }),
          this.db.marketplaceSyncJob.findFirst({
            where: { tenantId, integrationId: integration.id, result: { not: Prisma.JsonNull } },
            orderBy: { updatedAt: 'desc' },
            select: { result: true },
          }),
        ]);

        const apiLimitRemaining = readJsonNumber(latestJobWithResult?.result ?? null, [
          'apiLimitRemaining',
          'rateLimitRemaining',
          'remainingRequests',
        ]);
        const apiLimitResetAt = readJsonString(latestJobWithResult?.result ?? null, [
          'apiLimitResetAt',
          'rateLimitResetAt',
          'resetAt',
        ]);

        return {
          integration: hideIntegrationSecrets(integration),
          lastSuccessfulSyncAt: integration.lastSyncAt ?? lastDoneJob?.finishedAt ?? null,
          lastErrorAt: lastFailedJob?.finishedAt ?? lastFailedJob?.updatedAt ?? null,
          lastErrorMessage: lastFailedJob?.errorMessage ?? null,
          errorRate: calculateErrorRate(totalJobCount, failedJobCount),
          pendingJobCount,
          runningJobCount,
          failedJobCount,
          retryAvailableCount: failedJobCount,
          webhookReplayCount,
          webhookFailureCount,
          apiLimit: {
            status: getApiLimitStatus(apiLimitRemaining),
            remaining: apiLimitRemaining,
            resetAt: apiLimitResetAt,
          },
        };
      }),
    );

    const totals = items.reduce(
      (acc, item) => ({
        integrations: acc.integrations + 1,
        pendingJobs: acc.pendingJobs + item.pendingJobCount,
        runningJobs: acc.runningJobs + item.runningJobCount,
        failedJobs: acc.failedJobs + item.failedJobCount,
        retryAvailable: acc.retryAvailable + item.retryAvailableCount,
        webhookReplayAvailable: acc.webhookReplayAvailable + item.webhookReplayCount,
        webhookFailures: acc.webhookFailures + item.webhookFailureCount,
      }),
      {
        integrations: 0,
        pendingJobs: 0,
        runningJobs: 0,
        failedJobs: 0,
        retryAvailable: 0,
        webhookReplayAvailable: 0,
        webhookFailures: 0,
      },
    );

    return { totals, items };
  }
}
