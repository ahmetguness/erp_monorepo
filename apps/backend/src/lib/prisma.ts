import { Prisma, PrismaClient } from '@prisma/client';
import { recordSlowQuery } from '../services/observability.service.js';
import { getTenantIsolationContext } from './tenant-isolation-context.js';

declare global {
  var prisma: PrismaClient | undefined;
}

type UnknownRecord = Record<string, unknown>;

const prismaLogLevels: Prisma.PrismaClientOptions['log'] =
  process.env.PRISMA_QUERY_LOG === 'true'
    ? ['query', 'error', 'warn']
    : process.env.NODE_ENV === 'production'
      ? ['error']
      : ['error', 'warn'];

export const prisma = globalThis.prisma ?? new PrismaClient({ log: prismaLogLevels });

export const tenantScopedModels: ReadonlySet<Prisma.ModelName> = new Set(
  Prisma.dmmf.datamodel.models
    .filter((model) => model.fields.some((field) => field.name === 'tenantId'))
    .map((model) => model.name as Prisma.ModelName),
);

const whereActions = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow',
  'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert',
]);
const createActions = new Set(['create', 'createMany', 'upsert']);

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasTenantWherePredicate(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasTenantWherePredicate);
  if (!isRecord(value)) return false;
  if (Object.prototype.hasOwnProperty.call(value, 'tenantId')) return true;
  return ['AND', 'OR', 'NOT'].some((operator) => hasTenantWherePredicate(value[operator]));
}

function hasTenantCreateData(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0 && value.every(hasTenantCreateData);
  return isRecord(value) && typeof value.tenantId === 'string' && value.tenantId.length > 0;
}

function requireArgs(params: Prisma.MiddlewareParams): UnknownRecord {
  if (!isRecord(params.args)) params.args = {};
  return params.args as UnknownRecord;
}

function scopeWhere(args: UnknownRecord, tenantId: string): void {
  const existingWhere = args.where;
  if (existingWhere !== undefined && !isRecord(existingWhere)) {
    throw new Error('Tenant isolation violation: where must be an object.');
  }
  args.where = { ...(existingWhere ?? {}), tenantId };
}

function scopeCreateData(data: unknown, tenantId: string, model: string): unknown {
  if (Array.isArray(data)) return data.map((entry) => scopeCreateData(entry, tenantId, model));
  if (!isRecord(data)) throw new Error(`Tenant isolation violation: ${model} create data must be an object.`);
  if (typeof data.tenantId === 'string' && data.tenantId !== tenantId) {
    throw new Error(`Tenant isolation violation: ${model} create data targets another tenant.`);
  }
  return { ...data, tenantId };
}

function applyTenantScope(params: Prisma.MiddlewareParams, tenantId: string): void {
  if (!params.model) return;
  const args = requireArgs(params);
  if (whereActions.has(params.action)) scopeWhere(args, tenantId);

  if (params.action === 'upsert') {
    args.create = scopeCreateData(args.create, tenantId, params.model);
  } else if (createActions.has(params.action)) {
    args.data = scopeCreateData(args.data, tenantId, params.model);
  }
}

function assertExplicitTenantScope(params: Prisma.MiddlewareParams): void {
  if (!params.model) return;
  const args = requireArgs(params);
  if (whereActions.has(params.action) && !hasTenantWherePredicate(args.where)) {
    throw new Error(`Tenant isolation violation: ${params.model}.${params.action} requires tenantId in where.`);
  }
  if (params.action === 'upsert' && !hasTenantCreateData(args.create)) {
    throw new Error(`Tenant isolation violation: ${params.model}.upsert requires tenantId in create data.`);
  }
  if (params.action !== 'upsert' && createActions.has(params.action) && !hasTenantCreateData(args.data)) {
    throw new Error(`Tenant isolation violation: ${params.model}.${params.action} requires tenantId in data.`);
  }
}

export function enforceTenantIsolation(params: Prisma.MiddlewareParams): void {
  if (!params.model || !tenantScopedModels.has(params.model)) return;
  const context = getTenantIsolationContext();
  if (context?.mode === 'bypass') return;
  if (context?.mode === 'tenant') applyTenantScope(params, context.tenantId);
  else assertExplicitTenantScope(params);
}

prisma.$use(async (params: Prisma.MiddlewareParams, next) => {
  const startedAt = Date.now();
  enforceTenantIsolation(params);

  if (params.model === 'Tenant' && params.action === 'delete') {
    params.action = 'update';
    params.args.data = { deletedAt: new Date() };
  }
  if (params.model === 'Tenant' && params.action === 'deleteMany') {
    params.action = 'updateMany';
    params.args.data = { ...(isRecord(params.args.data) ? params.args.data : {}), deletedAt: new Date() };
  }

  const result = await next(params);
  recordSlowQuery({ model: params.model ?? null, action: params.action, durationMs: Date.now() - startedAt });
  return result;
});

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma;
