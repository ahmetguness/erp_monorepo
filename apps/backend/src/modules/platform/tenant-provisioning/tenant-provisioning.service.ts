import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { AuditAction, EntityType, PermissionAction, Plan, Prisma, TenantStatus } from '@prisma/client';
import { PLAN_MODULES, type TenantProvisioningInput, type TenantProvisioningJob, type TenantProvisioningPreview, type TenantProvisioningStepKey } from '@repo/types';
import { BaseError } from '../../../errors/index.js';
import { prisma } from '../../../lib/prisma.js';
import { redactSensitiveText } from '../../../lib/sensitive-redaction.js';
import { tenantReadyEmail } from '../../../services/mail-templates.service.js';
import { sendMail } from '../../../services/mail.service.js';
import { createAuditLog } from '../../../utils/audit.js';
import { toAppModules } from '../../../utils/tenant-modules.js';
import { tenantProvisioningInputSchema } from './tenant-provisioning.schemas.js';

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

function serializeJob(job: Prisma.TenantProvisioningJobGetPayload<{ include: { steps: true } }>): TenantProvisioningJob {
  const validStatus = (value: string): TenantProvisioningJob['status'] => {
    if (value === 'PENDING' || value === 'RUNNING' || value === 'SUCCEEDED' || value === 'FAILED') return value;
    throw new TenantProvisioningError('Provisioning durumu bozuk.', 409);
  };
  return { id: job.id, tenantId: job.provisionedTenantId, idempotencyKey: job.idempotencyKey, status: validStatus(job.status), error: job.error,
    createdAt: job.createdAt.toISOString(), updatedAt: job.updatedAt.toISOString(), steps: job.steps.map(step => ({ key: step.key as TenantProvisioningStepKey,
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

async function markStep(jobId: string, key: TenantProvisioningStepKey, status: 'RUNNING' | 'SUCCEEDED' | 'FAILED', error?: string): Promise<void> {
  await prisma.tenantProvisioningStep.update({ where: { jobId_key: { jobId, key } }, data: { status, error: error ?? null, ...(status === 'RUNNING' ? { attempts: { increment: 1 } } : {}) } });
}

async function deliverOwnerEmail(jobId: string, tenantId: string, input: TenantProvisioningInput): Promise<void> {
  await markStep(jobId, 'EMAIL_SENT', 'RUNNING');
  const rawToken = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({ where: { email: input.email.toLowerCase() }, data: { passwordResetToken: crypto.createHash('sha256').update(rawToken).digest('hex'), passwordResetExpiry: new Date(Date.now() + 3600000) } });
  const link = `${process.env.APP_URL || 'http://localhost:3000'}/set-password?token=${rawToken}&email=${encodeURIComponent(input.email.toLowerCase())}`;
  const mail = await sendMail({ to: input.email, ...tenantReadyEmail(input.ownerName, input.companyName, input.plan, link) });
  if (!mail.success) {
    await markStep(jobId, 'EMAIL_SENT', 'FAILED', mail.error || 'E-posta sağlayıcısı gönderimi reddetti.');
    await prisma.tenantProvisioningJob.update({ where: { id: jobId }, data: { status: 'FAILED', error: mail.error || 'E-posta gönderilemedi.' } });
    return;
  }
  await markStep(jobId, 'EMAIL_SENT', 'SUCCEEDED');
  await prisma.tenantProvisioningJob.update({ where: { id: jobId }, data: { status: 'SUCCEEDED', error: null } });
  await createAuditLog(prisma, { tenantId, adminId: (await prisma.tenantProvisioningJob.findUniqueOrThrow({ where: { id: jobId } })).createdById, module: 'TENANT_PROVISIONING', entityType: EntityType.OTHER, entityId: jobId, action: AuditAction.UPDATE, newValues: { emailDelivered: true } });
}

async function executeProvisioning(jobId: string, input: TenantProvisioningInput, adminId: string): Promise<void> {
  try {
    await prisma.tenantProvisioningJob.update({ where: { id: jobId }, data: { status: 'RUNNING', error: null } });
    await Promise.all(['TENANT_CREATED', 'OWNER_CREATED', 'DEFAULT_ROLES_CREATED'].map(key => markStep(jobId, key as TenantProvisioningStepKey, 'RUNNING')));
    const password = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12);
    const result = await prisma.$transaction(async tx => {
      const tenant = await tx.tenant.create({ data: { slug: slugify(input.slug || input.companyName), companyName: input.companyName, email: input.email.toLowerCase(), phone: input.phone || null,
        city: input.city || null, sector: input.sector || null, plan: input.plan as Plan, status: input.status as TenantStatus, maxUsers: input.maxUsers ?? null,
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
      await createAuditLog(tx, { tenantId: tenant.id, adminId, module: 'TENANT_PROVISIONING', entityType: EntityType.OTHER, entityId: jobId, action: AuditAction.CREATE, newValues: { slug: tenant.slug, plan: tenant.plan, status: tenant.status } });
      return tenant.id;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await Promise.all(['TENANT_CREATED', 'OWNER_CREATED', 'DEFAULT_ROLES_CREATED'].map(key => markStep(jobId, key as TenantProvisioningStepKey, 'SUCCEEDED')));
    await deliverOwnerEmail(jobId, result, input);
  } catch (error: unknown) {
    const message = redactSensitiveText(error instanceof Error ? error.message : 'Provisioning başarısız.');
    await prisma.tenantProvisioningJob.update({ where: { id: jobId }, data: { status: 'FAILED', error: message } });
    await prisma.tenantProvisioningStep.updateMany({ where: { jobId, status: 'RUNNING' }, data: { status: 'FAILED', error: message } });
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
  await executeProvisioning(job.id, input, adminId);
  return getTenantProvisioning(job.id);
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
    await deliverOwnerEmail(job.id, job.provisionedTenantId, input);
  } else {
    await executeProvisioning(job.id, input, adminId);
  }
  return getTenantProvisioning(id);
}
