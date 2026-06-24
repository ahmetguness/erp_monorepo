import { Prisma, PrismaClient } from '@prisma/client';
import { recordSlowQuery } from '../services/observability.service.js';

declare global {
  var prisma: PrismaClient | undefined;
}

const prismaLogLevels: Prisma.PrismaClientOptions['log'] =
  process.env.PRISMA_QUERY_LOG === 'true'
    ? ['query', 'error', 'warn']
    : process.env.NODE_ENV === 'production'
      ? ['error']
      : ['error', 'warn'];

export const prisma =
  globalThis.prisma ??
  new PrismaClient({
    log: prismaLogLevels,
  });

// ── Soft delete koruması ─────────────────────
// Tenant hard delete'ini engelle — her zaman soft delete (deletedAt) kullanılmalı
prisma.$use(async (params: Prisma.MiddlewareParams, next) => {
  const startedAt = Date.now();
  if (params.model === 'Tenant' && params.action === 'delete') {
    // Hard delete'i soft delete'e çevir
    params.action = 'update';
    params.args['data'] = { deletedAt: new Date() };
  }
  if (params.model === 'Tenant' && params.action === 'deleteMany') {
    params.action = 'updateMany';
    if (params.args.data !== undefined) {
      params.args.data['deletedAt'] = new Date();
    } else {
      params.args['data'] = { deletedAt: new Date() };
    }
  }
  const result = await next(params);
  recordSlowQuery({
    model: params.model ?? null,
    action: params.action,
    durationMs: Date.now() - startedAt,
  });
  return result;
});

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma;
}
