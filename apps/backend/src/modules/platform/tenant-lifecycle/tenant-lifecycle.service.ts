import { Prisma, type Tenant } from '@prisma/client';
import { TENANT_TRANSITIONS, type TenantLifecycleInput, type TenantLifecycleSnapshot } from '@repo/types';
import { prisma } from '../../../lib/prisma.js';
import { assertTenantTransition, TenantLifecycleError } from './tenant-lifecycle.policy.js';
import { lifecycleInputSchema } from './tenant-lifecycle.schemas.js';

const WAIT_MS = 30 * 24 * 60 * 60 * 1000;
type Db = Prisma.TransactionClient;

async function runLifecycleTransaction<T>(operation: (tx: Db) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue;
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
        throw new TenantLifecycleError('Tenant yaşam döngüsü eşzamanlı olarak değişti; güncel verilerle yeniden deneyin.');
      }
      throw error;
    }
  }
  throw new TenantLifecycleError('Tenant yaşam döngüsü işlemi tamamlanamadı.');
}

async function validateTransition(db: Db, tenant: Tenant, input: TenantLifecycleInput, requestCreatedAt: Date): Promise<void> {
  if (input.retentionUntil && tenant.retentionUntil && new Date(input.retentionUntil) < tenant.retentionUntil) throw new TenantLifecycleError('Saklama tarihi geriye alınamaz.');
  if (input.action === 'LEGAL_HOLD') return;
  if (!input.targetStatus) throw new TenantLifecycleError('Hedef durum zorunlu.', 400);
  assertTenantTransition(tenant.status, input.targetStatus);
  if (!['DELETION_SCHEDULED', 'DELETED'].includes(input.targetStatus)) return;
  if (tenant.legalHold) throw new TenantLifecycleError('Hukuki bekletme kaldırılmadan silme işlemi yapılamaz.');
  if (!input.checklist || !Object.values(input.checklist).every(Boolean)) throw new TenantLifecycleError('Kapanış kontrol listesinin tamamı zorunludur.');
  if (!input.exportId) throw new TenantLifecycleError('Güncel export zorunludur.');
  const exported = await db.tenantLifecycleExport.findFirst({ where: { id: input.exportId, tenantId: tenant.id, version: tenant.lifecycleVersion } });
  if (!exported) throw new TenantLifecycleError('Export tenant veya güncel yaşam döngüsü sürümüyle eşleşmiyor.');
  if (input.targetStatus === 'DELETION_SCHEDULED') {
    if (!input.retentionUntil || !input.deletionNotBefore) throw new TenantLifecycleError('Saklama ve silme tarihi zorunludur.');
    const deletionAt = new Date(input.deletionNotBefore);
    if (deletionAt.getTime() < requestCreatedAt.getTime() + WAIT_MS || deletionAt < new Date(input.retentionUntil) || (tenant.retentionUntil && deletionAt < tenant.retentionUntil)) {
      throw new TenantLifecycleError('Silme tarihi en az 30 günlük beklemeyi ve saklama süresini karşılamalıdır.');
    }
  } else if (!tenant.deletionNotBefore || tenant.deletionNotBefore > new Date() || !tenant.retentionUntil || new Date(input.retentionUntil ?? tenant.retentionUntil) > new Date()) {
    throw new TenantLifecycleError('Bekleme veya yasal saklama süresi henüz dolmadı.');
  }
}

export async function getTenantLifecycle(tenantId: string): Promise<TenantLifecycleSnapshot> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new TenantLifecycleError('Tenant bulunamadı.', 404);
  const [requests, exports] = await Promise.all([
    prisma.tenantLifecycleRequest.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.tenantLifecycleExport.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, createdAt: true, digest: true, version: true } }),
  ]);
  return {
    tenantId, companyName: tenant.companyName, status: tenant.status, version: tenant.lifecycleVersion, legalHold: tenant.legalHold,
    retentionUntil: tenant.retentionUntil?.toISOString() ?? null, deletionNotBefore: tenant.deletionNotBefore?.toISOString() ?? null, deletedAt: tenant.deletedAt?.toISOString() ?? null,
    transitions: TENANT_TRANSITIONS[tenant.status],
    requests: requests.map(row => {
      if (!['PENDING', 'APPLIED', 'REJECTED'].includes(row.state)) throw new Error('Invalid lifecycle state');
      return { id: row.id, state: row.state as 'PENDING' | 'APPLIED' | 'REJECTED', input: lifecycleInputSchema.parse(row.input), fromStatus: row.fromStatus,
        requestedById: row.requestedById, requestedByName: row.requestedByName, decidedById: row.decidedById, createdAt: row.createdAt.toISOString(), decidedAt: row.decidedAt?.toISOString() ?? null };
    }),
    exports: exports.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })),
  };
}

export async function requestTenantLifecycle(tenantId: string, adminId: string, input: TenantLifecycleInput): Promise<void> {
  const serializedInput: Prisma.InputJsonObject = { ...input, checklist: input.checklist ? { ...input.checklist } : undefined };
  await runLifecycleTransaction(async tx => {
    const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new TenantLifecycleError('Tenant bulunamadı.', 404);
    if (await tx.tenantLifecycleRequest.findFirst({ where: { tenantId, state: 'PENDING' } })) throw new TenantLifecycleError('Bekleyen yaşam döngüsü talebi var.');
    const createdAt = new Date();
    await validateTransition(tx, tenant, input, createdAt);
    const admin = await tx.adminUser.findUniqueOrThrow({ where: { id: adminId }, select: { name: true } });
    const request = await tx.tenantLifecycleRequest.create({ data: { tenantId, fromStatus: tenant.status, version: tenant.lifecycleVersion, input: serializedInput, requestedById: adminId, requestedByName: admin.name, createdAt } });
    await tx.auditLog.create({ data: { tenantId, adminId, module: 'TENANT_LIFECYCLE', entityType: 'OTHER', entityId: request.id, action: 'CREATE', reason: input.reason, ticketId: input.ticketId, newValues: serializedInput } });
  });
}

export async function decideTenantLifecycle(tenantId: string, id: string, adminId: string, decision: 'approve' | 'reject'): Promise<void> {
  await runLifecycleTransaction(async tx => {
    const request = await tx.tenantLifecycleRequest.findFirst({ where: { id, tenantId, state: 'PENDING' } });
    if (!request) throw new TenantLifecycleError('Bekleyen talep bulunamadı.', 404);
    if (request.requestedById === adminId) throw new TenantLifecycleError('Kendi talebinizi onaylayamaz/reddedemezsiniz.', 403);
    const input = lifecycleInputSchema.parse(request.input);
    const now = new Date();
    if (decision === 'approve') {
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
      if (tenant.lifecycleVersion !== request.version || tenant.status !== request.fromStatus) throw new TenantLifecycleError('Tenant değişmiş; talebi reddedip yeniden oluşturun.');
      await validateTransition(tx, tenant, input, request.createdAt);
      const requester = await tx.adminUser.findFirst({ where: { id: request.requestedById, isActive: true, roleAssignments: { some: { adminRole: { permissions: { some: { adminPermission: { key: 'tenant.status.update' } } } } } } } });
      if (!requester) throw new TenantLifecycleError('Talep eden adminin yetkisi artık geçerli değil.', 403);
      const target = input.action === 'TRANSITION' ? input.targetStatus : undefined;
      const updated = await tx.tenant.updateMany({ where: { id: tenantId, lifecycleVersion: request.version, status: request.fromStatus }, data: {
        lifecycleVersion: { increment: 1 }, status: target,
        ...(input.action === 'LEGAL_HOLD' ? { legalHold: input.legalHold } : {}),
        ...(input.retentionUntil ? { retentionUntil: new Date(input.retentionUntil) } : {}),
        ...(target === 'DELETION_SCHEDULED' ? { deletionNotBefore: new Date(Math.max(new Date(input.deletionNotBefore!).getTime(), now.getTime() + WAIT_MS)) } : target ? { deletionNotBefore: null } : {}),
        ...(target ? { deletedAt: target === 'DELETED' ? now : null } : {}),
      } });
      if (updated.count !== 1) throw new TenantLifecycleError('Eşzamanlı durum değişikliği.');
      if (target && !['ACTIVE', 'TRIAL'].includes(target)) await tx.supportSession.updateMany({ where: { tenantId, revokedAt: null }, data: { revokedAt: now } });
      const owners = await tx.tenantUser.findMany({ where: { tenantId, isOwner: true, isActive: true }, select: { userId: true } });
      if (owners.length) await tx.notification.createMany({ data: owners.map(owner => ({ tenantId, userId: owner.userId, title: 'Tenant yaşam döngüsü değişikliği', message: `${tenant.status} → ${target ?? tenant.status}. ${input.reason}`, module: 'admin', entityType: 'OTHER', entityId: tenantId })) });
    }
    const claimed = await tx.tenantLifecycleRequest.updateMany({ where: { id, tenantId, state: 'PENDING' }, data: { state: decision === 'approve' ? 'APPLIED' : 'REJECTED', decidedById: adminId, decidedAt: now } });
    if (claimed.count !== 1) throw new TenantLifecycleError('Talep başka bir admin tarafından işlendi.');
    await tx.auditLog.create({ data: { tenantId, adminId, module: 'TENANT_LIFECYCLE', entityType: 'OTHER', entityId: id, action: decision === 'approve' ? 'APPROVE' : 'REJECT', reason: input.reason, ticketId: input.ticketId, newValues: { ...input, effectiveAt: now.toISOString(), requestedById: request.requestedById } } });
  });
}
