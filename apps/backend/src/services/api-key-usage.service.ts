import { EntityType, type Prisma, type PrismaClient } from '@prisma/client';

export interface ApiKeyUsageStats {
  requestCount: number;
  successfulRequestCount: number;
  errorCount: number;
  errorRate: number;
  rateLimitedCount: number;
  lastRequestAt: Date | null;
  lastIpAddress: string | null;
  lastStatus: number | null;
}

type AuditLogRow = Pick<Prisma.AuditLogGetPayload<{
  select: {
    entityId: true;
    newValues: true;
    ipAddress: true;
    createdAt: true;
  };
}>, 'entityId' | 'newValues' | 'ipAddress' | 'createdAt'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStatus(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const status = value.status;
  return typeof status === 'number' && Number.isFinite(status) ? status : null;
}

function readRateLimited(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return value.rateLimited === true;
}

function emptyStats(): ApiKeyUsageStats {
  return {
    requestCount: 0,
    successfulRequestCount: 0,
    errorCount: 0,
    errorRate: 0,
    rateLimitedCount: 0,
    lastRequestAt: null,
    lastIpAddress: null,
    lastStatus: null,
  };
}

function applyLog(stats: ApiKeyUsageStats, log: AuditLogRow): void {
  const status = readStatus(log.newValues);
  if (status === null) return;

  stats.requestCount += 1;
  if (status >= 400) stats.errorCount += 1;
  else stats.successfulRequestCount += 1;
  if (readRateLimited(log.newValues)) stats.rateLimitedCount += 1;

  if (stats.lastRequestAt === null || log.createdAt > stats.lastRequestAt) {
    stats.lastRequestAt = log.createdAt;
    stats.lastStatus = status;
    stats.lastIpAddress = log.ipAddress;
  }
}

function finalizeStats(stats: ApiKeyUsageStats): ApiKeyUsageStats {
  return {
    ...stats,
    errorRate: stats.requestCount > 0 ? Math.round((stats.errorCount / stats.requestCount) * 1000) / 10 : 0,
  };
}

export class ApiKeyUsageService {
  constructor(private readonly db: PrismaClient) {}

  async getStatsByApiKey(tenantId: string, apiKeyIds: string[]): Promise<Map<string, ApiKeyUsageStats>> {
    const statsByKey = new Map<string, ApiKeyUsageStats>();
    for (const apiKeyId of apiKeyIds) statsByKey.set(apiKeyId, emptyStats());
    if (apiKeyIds.length === 0) return statsByKey;

    const usageLogs = await this.db.auditLog.findMany({
      where: {
        tenantId,
        module: 'api_keys',
        entityType: EntityType.OTHER,
        entityId: { in: apiKeyIds },
      },
      select: {
        entityId: true,
        newValues: true,
        ipAddress: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: Math.max(500, apiKeyIds.length * 100),
    });

    for (const log of usageLogs) {
      const stats = statsByKey.get(log.entityId);
      if (stats) applyLog(stats, log);
    }

    return new Map([...statsByKey.entries()].map(([apiKeyId, stats]) => [apiKeyId, finalizeStats(stats)]));
  }

  emptyStats(): ApiKeyUsageStats {
    return emptyStats();
  }
}
