import { Prisma, PrismaClient } from '@prisma/client';
import { recordSlowQuery } from '../services/observability.service.js';
import { getTenantIsolationContext } from './tenant-isolation-context.js';

declare global {
  var prismaClient: PrismaClient | undefined;
}

type UnknownRecord = Record<string, unknown>;

export interface TenantQueryParams {
  model?: Prisma.ModelName;
  action: Prisma.PrismaAction;
  args: UnknownRecord;
}

const prismaLogLevels: Prisma.PrismaClientOptions['log'] =
  process.env.PRISMA_QUERY_LOG === 'true'
    ? ['query', 'error', 'warn']
    : process.env.NODE_ENV === 'production'
      ? ['error']
      : ['error', 'warn'];

const basePrisma = globalThis.prismaClient ?? new PrismaClient({ log: prismaLogLevels });

const platformModelsWithOptionalTenantReference: ReadonlySet<Prisma.ModelName> =
  new Set(["DemoRequest"]);

export const tenantScopedModels: ReadonlySet<Prisma.ModelName> = new Set(
  Prisma.dmmf.datamodel.models
    .filter(
      (model) =>
        model.fields.some((field) => field.name === 'tenantId') &&
        !platformModelsWithOptionalTenantReference.has(model.name as Prisma.ModelName),
    )
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

function requireArgs(params: TenantQueryParams): UnknownRecord {
  return params.args;
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

function applyTenantScope(params: TenantQueryParams, tenantId: string): void {
  if (!params.model) return;
  const args = requireArgs(params);
  if (whereActions.has(params.action)) scopeWhere(args, tenantId);

  if (params.action === 'upsert') {
    args.create = scopeCreateData(args.create, tenantId, params.model);
  } else if (createActions.has(params.action)) {
    args.data = scopeCreateData(args.data, tenantId, params.model);
  }
}

function assertExplicitTenantScope(params: TenantQueryParams): void {
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

export function enforceTenantIsolation(params: TenantQueryParams): void {
  if (!params.model || !tenantScopedModels.has(params.model)) return;
  const context = getTenantIsolationContext();
  if (context?.mode === 'bypass') return;
  if (context?.mode === 'tenant') applyTenantScope(params, context.tenantId);
  else assertExplicitTenantScope(params);
}

const tenantSafePrisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const startedAt = Date.now();
        enforceTenantIsolation({
          model: model as Prisma.ModelName,
          action: operation as Prisma.PrismaAction,
          args: args as UnknownRecord,
        });
        const result = await query(args);
        recordSlowQuery({ model, action: operation, durationMs: Date.now() - startedAt });
        return result;
      },
    },
  },
});

function isPrismaClient(value: unknown): value is PrismaClient {
  if (!isRecord(value)) return false;
  return ['$connect', '$disconnect', '$transaction', '$queryRaw']
    .every((member) => typeof Reflect.get(value, member) === 'function');
}

function requirePrismaClient(value: unknown): PrismaClient {
  if (!isPrismaClient(value)) {
    throw new Error('Prisma tenant extension does not expose the required client lifecycle API.');
  }
  return value;
}

export const prisma = requirePrismaClient(tenantSafePrisma);

if (process.env.NODE_ENV !== 'production') globalThis.prismaClient = basePrisma;
