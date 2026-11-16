import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { AuditAction, EntityType, PermissionAction, Prisma } from '@prisma/client';
import { PLAN_MODULES, type TenantProvisioningInput, type TenantProvisioningJob, type TenantProvisioningPreview, type TenantProvisioningStepKey } from '@repo/types';
import { BaseError } from '../../../errors/index.js';
import { prisma } from '../../../lib/prisma.js';
import { redactSensitiveText } from '../../../lib/sensitive-redaction.js';
import { tenantReadyEmail } from '../../../services/mail-templates.service.js';
import { queueOutboundMail } from '../../../services/mail-delivery/mail-delivery.service.js';
import { createAuditLog } from '../../../utils/audit.js';
import { toAppModules } from '../../../utils/tenant-modules.js';
import { tenantProvisioningInputSchema } from './tenant-provisioning.schemas.js';
import { createPasswordResetToken } from '../../../security/password-reset-token.js';

const STEP_KEYS: readonly TenantProvisioningStepKey[] = ['TENANT_CREATED', 'OWNER_CREATED', 'DEFAULT_ROLES_CREATED', 'EMAIL_SENT'];
export class TenantProvisioningError extends BaseError {
  constructor(message: string, status: 400 | 404 | 409 = 409) { super(message, status, 'TENANT_PROVISIONING_ERROR'); }
}
const slugify = (value: string): string => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const hashInput = (input: TenantProvisioningInput): string => crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
const date = (value: string | null | undefined): Date | null => value ? new Date(value) : null;
function serializeInput(input: TenantProvisioningInput): Prisma.InputJsonObject {
  return {
    companyName: input.companyName, email: input.email, ownerName: input.ownerName, plan: input.plan, status: input.status, modules: input.modules,
    ...(input.slug !== undefined ? { slug: input.slug } : {}), ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.city !== undefined ? { city: input.city } : {}), ...(input.sector !== undefined ? { sector: input.sector } : {}),
    ...(input.maxUsers !== undefined ? { maxUsers: input.maxUsers } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.isCustomPricing !== undefined ? { isCustomPricing: input.isCustomPricing } : {}),
    ...(input.trialEndsAt !== undefined ? { trialEndsAt: input.trialEndsAt } : {}),
    ...(input.subscriptionStart !== undefined ? { subscriptionStart: input.subscriptionStart } : {}),
    ...(input.subscriptionEnd !== undefined ? { subscriptionEnd: input.subscriptionEnd } : {}),
  };
}

function validStepKey(value: string): TenantProvisioningStepKey {
  const key = STEP_KEYS.find((item) => item === value);
  if (!key) throw new TenantProvisioningError('Invalid provisioning step.', 409);
  return key;
}

async function failProvisioning(jobId: string, error: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const changed = await tx.tenantProvisioningJob.updateMany({ where: { id: jobId, provisionedTenantId: null, status: { in: ['PENDING', 'RUNNING'] } }, data: { status: 'FAILED', error } });
    if (!changed.count) return;
    await tx.tenantProvisioningStep.updateMany({
      where: { jobId, key: { in: ['TENANT_CREATED', 'OWNER_CREATED', 'DEFAULT_ROLES_CREATED'] } },
      data: { status: 'FAILED', attempts: { increment: 1 }, error }
    });
  });
}

function serializeJob(job: Prisma.TenantProvisioningJobGetPayload<{ include: { steps: true } }>): TenantProvisioningJob {
  const validStatus = (value: string): TenantProvisioningJob['status'] => {
    if (value === 'PENDING' || value === 'RUNNING' || value === 'SUCCEEDED' || value === 'FAILED') return value;
    throw new TenantProvisioningError('Provisioning durumu bozuk.', 409);
  };
  return { id: job.id, tenantId: job.provisionedTenantId, idempotencyKey: job.idempotencyKey, status: validStatus(job.status), error: job.error,
    createdAt: job.createdAt.toISOString(), updatedAt: job.updatedAt.toISOString(), steps: job.steps.map(step => ({
      key: validStepKey(step.key),
      status: validStatus(step.status), attempts: step.attempts, error: step.error, updatedAt: step.updatedAt.toISOString() })) };
}

export async function previewTenantProvisioning(input: TenantProvisioningInput): Promise<TenantProvisioningPreview> {
  const normalizedSlug = slugify(input.slug || input.companyName);
  const normalizedEmail = input.email.toLowerCase();
  const [slugOwner, owner] = await Promise.all([
    normalizedSlug ? prisma.tenant.findUnique({ where: { slug: normalizedSlug }, select: { id: true } }) : null,
    prisma.user.findUnique({ where: { email: normalizedEmail }, select: { tenants: { where: { isActive: true }, select: { tenant: { select: { companyName: true } } } } } }),
  ]);
  const allowed = PLAN_MODULES[input.plan];
  const invalidModules = input.modules.filter(module => !allowed.includes(module));
  const modulesUnique = new Set(input.modules).size === input.modules.length;
  const datesValid = !input.subscriptionStart || !input.subscriptionEnd || new Date(input.subscriptionEnd) > new Date(input.subscriptionStart);
  const checks: TenantProvisioningPreview['checks'] = [
    { key: 'SLUG', valid: Boolean(normalizedSlug) && !slugOwner, message: !normalizedSlug ? 'Geçerli bir slug üretilemedi.' : slugOwner ? 'Slug kullanımda.' : 'Slug uygun.' },
    { key: 'OWNER', valid: true, message: owner?.tenants.length ? `Owner mevcut ${owner.tenants.length} tenant üyeliğine bağlanacak.` : 'Yeni owner hesabı oluşturulacak.' },
    { key: 'PLAN_MODULES', valid: invalidModules.length === 0 && modulesUnique, message: !modulesUnique ? 'Modüller tekrarlanamaz.' : invalidModules.length ? `Plan dışı modüller: ${invalidModules.join(', ')}` : 'Modüller planla uyumlu.' },
    { key: 'DATES', valid: datesValid, message: datesValid ? 'Abonelik tarihleri geçerli.' : 'Bitiş tarihi başlangıçtan sonra olmalı.' },
  ];
  return { valid: checks.every(check => check.valid), normalizedSlug, normalizedEmail, ownerExistingTenantNames: owner?.tenants.map(item => item.tenant.companyName) ?? [],
    effectiveModules: [...input.modules], checks, emailPreview: { to: normalizedEmail, subject: 'Axon ERP hesabınız hazır', passwordLinkExpiresInMinutes: 60 } };
}

async function queueOwnerEmail(tx: Prisma.TransactionClient, jobId: string, tenantId: string, input: TenantProvisioningInput): Promise<void> {
  const step = await tx.tenantProvisioningStep.update({ where: { jobId_key: { jobId, key: 'EMAIL_SENT' } }, data: { status: 'RUNNING', attempts: { increment: 1 }, error: null } });
  const { rawToken, tokenHash, expiresAt } = createPasswordResetToken();
  await tx.user.update({ where: { email: input.email.toLowerCase() }, data: { passwordResetToken: tokenHash, passwordResetExpiry: expiresAt } });
  const link = `${process.env.APP_URL || 'http://localhost:3000'}/set-password?token=${rawToken}&email=${encodeURIComponent(input.email.toLowerCase())}`;
  await queueOutboundMail(tx, {
    tenantId, to: [input.email.toLowerCase()], ...tenantReadyEmail(input.ownerName, input.companyName, input.plan, link),
    expiresAt, provisioning: { jobId, attempt: step.attempts }
  });
}

async function executeProvisioning(jobId: string, input: TenantProvisioningInput, adminId: string): Promise<void> {
  try {
    const claimed = await prisma.tenantProvisioningJob.updateMany({ where: { id: jobId, provisionedTenantId: null, status: { in: ['PENDING', 'RUNNING'] } }, data: { status: 'RUNNING', error: null } });
    if (!claimed.count) return;
    const password = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM tenant_provisioning_jobs WHERE id = ${jobId} FOR UPDATE`;
      const current = await tx.tenantProvisioningJob.findUniqueOrThrow({ where: { id: jobId } });
      if (current.provisionedTenantId) return;
      await tx.tenantProvisioningStep.updateMany({
        where: { jobId, key: { in: ['TENANT_CREATED', 'OWNER_CREATED', 'DEFAULT_ROLES_CREATED'] } },
        data: { status: 'RUNNING', attempts: { increment: 1 }, error: null }
      });
      const tenant = await tx.tenant.create({ data: { slug: slugify(input.slug || input.companyName), companyName: input.companyName, email: input.email.toLowerCase(), phone: input.phone || null,
        city: input.city || null, sector: input.sector || null, plan: input.plan, status: input.status, maxUsers: input.maxUsers ?? null,
        modules: toAppModules(input.modules), notes: input.notes || null, isCustomPricing: input.isCustomPricing ?? false, trialEndsAt: date(input.trialEndsAt),
        subscriptionStart: date(input.subscriptionStart), subscriptionEnd: date(input.subscriptionEnd), planChangedAt: new Date() } });
      await tx.billingSubscription.create({ data: { tenantId: tenant.id, state: input.status === 'TRIAL' ? 'TRIALING' : 'ACTIVE', monthlyAmount: input.plan === 'STARTER' ? 1990 : input.plan === 'PROFESSIONAL' ? 3990 : 0 } });
      let user = await tx.user.findUnique({ where: { email: input.email.toLowerCase() } });
      if (!user) user = await tx.user.create({ data: { email: input.email.toLowerCase(), name: input.ownerName, phone: input.phone || null, password } });
      await tx.tenantUser.create({ data: { tenantId: tenant.id, userId: user.id, isOwner: true, isActive: true } });
      const adminRole = await tx.role.create({ data: { tenantId: tenant.id, name: 'Yönetici', description: 'Tenant varsayılan yönetici rolü', isSystem: true,
        permissions: { create: input.modules.flatMap(module => Object.values(PermissionAction).map(action => ({ module, action }))) } } });
      await tx.role.create({ data: { tenantId: tenant.id, name: 'Görüntüleyici', description: 'Tenant varsayılan salt okunur rolü', isSystem: true,
        permissions: { create: input.modules.map(module => ({ module, action: PermissionAction.READ })) } } });
      const assigned = await tx.tenantUser.updateMany({ where: { tenantId: tenant.id, userId: user.id }, data: { roleId: adminRole.id } });
      if (assigned.count !== 1) throw new TenantProvisioningError('Owner varsayılan yönetici rolüne atanamadı.');
      await tx.tenantProvisioningJob.update({ where: { id: jobId }, data: { provisionedTenantId: tenant.id } });
      await createAuditLog(tx, { tenantId: tenant.id, adminId, module: 'TENANT_PROVISIONING', entityType: EntityType.OTHER, entityId: jobId, action: AuditAction.CREATE, newValues: { slug: tenant.slug, plan: tenant.plan, status: tenant.status } }, { required: true });
      await tx.tenantProvisioningStep.updateMany({ where: { jobId, key: { in: ['TENANT_CREATED', 'OWNER_CREATED', 'DEFAULT_ROLES_CREATED'] } }, data: { status: 'SUCCEEDED', error: null } });
      await queueOwnerEmail(tx, jobId, tenant.id, input);
    });
  } catch (error: unknown) {
    const message = redactSensitiveText(error instanceof Error ? error.message : 'Provisioning başarısız.');
    await failProvisioning(jobId, message);
  }
}

export async function createTenantProvisioning(input: TenantProvisioningInput, idempotencyKey: string, adminId: string): Promise<TenantProvisioningJob> {
  const requestHash = hashInput(input);
  const existing = await prisma.tenantProvisioningJob.findUnique({ where: { idempotencyKey }, include: { steps: true } });
  if (existing) {
    if (existing.requestHash !== requestHash) throw new TenantProvisioningError('Idempotency-Key farklı bir istek için kullanılmış.');
    return serializeJob(existing);
  }
  const preview = await previewTenantProvisioning(input);
  if (!preview.valid) throw new TenantProvisioningError(preview.checks.filter(check => !check.valid).map(check => check.message).join(' '), 400);
  let job: Prisma.TenantProvisioningJobGetPayload<{ include: { steps: true } }>;
  try {
    job = await prisma.tenantProvisioningJob.create({ data: { idempotencyKey, requestHash, input: serializeInput(input), createdById: adminId,
      steps: { create: STEP_KEYS.map(key => ({ key })) } }, include: { steps: true } });
  } catch (error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const concurrent = await prisma.tenantProvisioningJob.findUniqueOrThrow({ where: { idempotencyKey }, include: { steps: true } });
    if (concurrent.requestHash !== requestHash) throw new TenantProvisioningError('Idempotency-Key farklı bir istek için kullanılmış.');
    return serializeJob(concurrent);
  }
  return serializeJob(job);
}

export async function getTenantProvisioning(id: string): Promise<TenantProvisioningJob> {
  const job = await prisma.tenantProvisioningJob.findUnique({ where: { id }, include: { steps: { orderBy: { id: 'asc' } } } });
  if (!job) throw new TenantProvisioningError('Provisioning işi bulunamadı.', 404);
  return serializeJob(job);
}

export async function listTenantProvisioning(): Promise<TenantProvisioningJob[]> {
  const jobs = await prisma.tenantProvisioningJob.findMany({ orderBy: { createdAt: 'desc' }, take: 50, include: { steps: { orderBy: { id: 'asc' } } } });
  return jobs.map(serializeJob);
}

export async function retryTenantProvisioning(id: string, adminId: string): Promise<TenantProvisioningJob> {
  const job = await prisma.tenantProvisioningJob.findUnique({ where: { id }, include: { steps: true } });
  if (!job) throw new TenantProvisioningError('Provisioning işi bulunamadı.', 404);
  if (job.status !== 'FAILED') throw new TenantProvisioningError('Yalnızca başarısız işler yeniden denenebilir.');
  const input = tenantProvisioningInputSchema.parse(job.input);
  if (job.provisionedTenantId) {
    await prisma.tenantProvisioningStep.updateMany({ where: { jobId: job.id, key: { in: ['TENANT_CREATED', 'OWNER_CREATED', 'DEFAULT_ROLES_CREATED'] } }, data: { status: 'SUCCEEDED', error: null } });
    const tenantId = job.provisionedTenantId;
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.tenantProvisioningJob.updateMany({ where: { id: job.id, status: 'FAILED', updatedAt: job.updatedAt }, data: { status: 'RUNNING', error: null } });
      if (!claimed.count) throw new TenantProvisioningError('Provisioning job changed concurrently.');
      await queueOwnerEmail(tx, job.id, tenantId, input);
      await createAuditLog(tx, { tenantId, adminId, module: 'TENANT_PROVISIONING', entityType: EntityType.OTHER, entityId: job.id, action: AuditAction.UPDATE, newValues: { emailRetryQueued: true } }, { required: true });
    });
  } else {
    await prisma.tenantProvisioningJob.updateMany({ where: { id: job.id, status: 'FAILED' }, data: { status: 'PENDING', error: null } });
  }
  return getTenantProvisioning(id);
}

/** Recover durable requests that never reached the tenant transaction, including a crashed API process. */
export async function processPendingTenantProvisioning(): Promise<void> {
  const jobs = await prisma.tenantProvisioningJob.findMany({
    where: { provisionedTenantId: null, OR: [{ status: 'PENDING' }, { status: 'RUNNING', updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } }] },
    orderBy: { createdAt: 'asc' }, take: 5,
  });
  for (const job of jobs) {
    const parsed = tenantProvisioningInputSchema.safeParse(job.input);
    if (!parsed.success) {
      await failProvisioning(job.id, 'Invalid stored provisioning input.');
      continue;
    }
    await executeProvisioning(job.id, parsed.data, job.createdById);
  }
}
