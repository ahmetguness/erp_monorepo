import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

// ── Soft delete koruması ─────────────────────
// Tenant hard delete'ini engelle — her zaman soft delete (deletedAt) kullanılmalı
prisma.$use(async (params, next) => {
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
  return next(params);
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
