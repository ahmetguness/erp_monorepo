import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { runWithTenantScope } from '../../lib/tenant-isolation-context.js';

export type TenantDatabase = PrismaClient;

export function withTenantDatabase<TResult>(
  tenantId: string,
  operation: (database: TenantDatabase) => Promise<TResult>,
): Promise<TResult> {
  return runWithTenantScope(tenantId, () => operation(prisma));
}
