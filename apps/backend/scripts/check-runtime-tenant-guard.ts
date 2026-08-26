import type { Prisma } from '@prisma/client';
import { enforceTenantIsolation, tenantScopedModels } from '../src/lib/prisma.js';
import { runWithTenantScope } from '../src/lib/tenant-isolation-context.js';

function params(model: Prisma.ModelName, action: Prisma.PrismaAction, args: Record<string, unknown>): Prisma.MiddlewareParams {
  return { model, action, args, dataPath: [], runInTransaction: false };
}

function expectViolation(model: Prisma.ModelName, action: Prisma.PrismaAction, args: Record<string, unknown>): void {
  try {
    enforceTenantIsolation(params(model, action, args));
  } catch {
    return;
  }
  throw new Error(`${model}.${action} unexpectedly passed without tenant scope.`);
}

async function main(): Promise<void> {
  for (const model of tenantScopedModels) {
    expectViolation(model, 'findUnique', { where: { id: 'record-id' } });
    expectViolation(model, 'update', { where: { id: 'record-id' }, data: {} });
    expectViolation(model, 'delete', { where: { id: 'record-id' } });
    expectViolation(model, 'create', { data: {} });

    await runWithTenantScope('tenant-a', async () => {
      const read = params(model, 'findUnique', { where: { id: 'record-id' } });
      enforceTenantIsolation(read);
      if (!JSON.stringify(read.args.where).includes('tenant-a')) throw new Error(`${model}.findUnique was not scoped.`);

      const create = params(model, 'create', { data: {} });
      enforceTenantIsolation(create);
      if (!JSON.stringify(create.args.data).includes('tenant-a')) throw new Error(`${model}.create was not scoped.`);
    });
  }

  console.log(`Runtime tenant guard: OK (${tenantScopedModels.size} tenant-scoped model(s))`);
}

void main();
