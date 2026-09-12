import { AdminChangeRequestType,AppModule,AuditAction,EntityType,Plan,TenantStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Context } from 'hono';
import { ConflictError,NotFoundError,ValidationError } from '../../../../../errors/index.js';
import { prisma } from '../../../../../lib/prisma.js';
import { tenantReadyEmail } from '../../../../../services/mail-templates.service.js';
import { sendMail } from '../../../../../services/mail.service.js';
import { createAuditLog,getRequestMeta } from '../../../../../utils/audit.js';
import { requireParam } from '../../../../../utils/context.js';
import { getPaginationParams } from '../../../../../utils/pagination.js';
import { modulesForPrismaPlan } from '../../../../../utils/tenant-modules.js';
import { submitAdminChange } from '../../../admin-change-request/admin-change-request.service.js';
import { isCriticalTenantPlanChange,isCriticalTenantStatusChange } from '../../../admin-change-request/admin-change-request.policy.js';
import { changeMetadataSchema } from '../../../admin-change-request/admin-change-request.schemas.js';
import { assertLegacyTenantTransition } from '../../../tenant-lifecycle/tenant-lifecycle.policy.js';
import { tenantListQuerySchema } from '../../../admin-list-operations/index.js';
import { tenantSettingsUpdateSchema } from '../../../admin-api-safety/index.js';
import { maskTenantForAdmin,maskTenantsForAdmin } from '../../../sensitive-data/index.js';
import { syncSubscriptionForPlan } from '../../../subscription-operations/subscription-operations.service.js';
import { buildChangeLine,createSlug,formatNotificationValue,normalizeEmail,notifyTenantOwners,parseNullableDate,planChangeExperienceService,translateModules,VALID_PLANS,VALID_STATUSES,validateModules } from './shared.js';

export const AdminTenantController = {

  async list(c: Context): Promise<Response> {
    const { page, limit, skip } = getPaginationParams(c, 20);
    const status = c.req.query('status') as TenantStatus | undefined;
    const plan = c.req.query('plan') as Plan | undefined;
    const search = c.req.query('search');
    const listOptions = tenantListQuerySchema.safeParse({ from: c.req.query('from'), to: c.req.query('to'), sortBy: c.req.query('sortBy'), sortDirection: c.req.query('sortDirection') });
    if (!listOptions.success) return c.json(new ValidationError('Geçersiz tarih veya sıralama filtresi.').toJSON(), 400);
    const from = listOptions.data.from ? new Date(`${listOptions.data.from}T00:00:00.000Z`) : undefined;
    const to = listOptions.data.to ? new Date(`${listOptions.data.to}T23:59:59.999Z`) : undefined;

    if (status && !VALID_STATUSES.includes(status)) {
      return c.json(new ValidationError('Geçerli bir durum seçiniz.').toJSON(), 400);
    }
    if (plan && !VALID_PLANS.includes(plan)) {
      return c.json(new ValidationError('Geçerli bir plan seçiniz.').toJSON(), 400);
    }

    const where = {
      deletedAt: status === 'DELETED' ? undefined : null,
      ...(status && { status }),
      ...(plan && { plan }),
      ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
      ...(search && {
        OR: [
          { companyName: { contains: search, mode: 'insensitive' as const } },
          { slug: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [total, tenants] = await prisma.$transaction([
      prisma.tenant.count({ where }),
      prisma.tenant.findMany({
        where,
        select: {
          id: true, slug: true, companyName: true, email: true, phone: true,
          plan: true, status: true, city: true, sector: true,
          maxUsers: true, trialEndsAt: true, subscriptionStart: true, subscriptionEnd: true,
          planChangedAt: true, isCustomPricing: true, modules: true, notes: true,
          createdAt: true, updatedAt: true,
          _count: { select: { users: true, products: true, invoices: true, contacts: true } },
        },
        orderBy: { [listOptions.data.sortBy]: listOptions.data.sortDirection },
        skip: skip,
        take: limit,
      }),
    ]);

    return c.json({ data: await maskTenantsForAdmin(c.get('adminId'), tenants), meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async create(c: Context): Promise<Response> {
    const body = await c.req.json<{
      companyName: string; email: string; ownerName: string;
      slug?: string; phone?: string; city?: string; sector?: string;
      plan?: Plan; status?: TenantStatus; maxUsers?: number | null;
      modules?: string[]; notes?: string; isCustomPricing?: boolean;
      trialEndsAt?: string | null; subscriptionStart?: string | null; subscriptionEnd?: string | null;
    }>();

    if (!body.companyName?.trim() || !body.email?.trim() || !body.ownerName?.trim()) {
      return c.json(new ValidationError('companyName, email ve ownerName zorunludur.').toJSON(), 400);
    }

    const email = normalizeEmail(body.email);
    const plan = body.plan ?? Plan.STARTER;
    const status = body.status ?? TenantStatus.TRIAL;
    if (status !== 'TRIAL' && status !== 'ACTIVE') return c.json(new ValidationError('Yeni tenant yalnızca TRIAL veya ACTIVE olabilir.').toJSON(), 400);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json(new ValidationError('Geçerli bir e-posta adresi giriniz.').toJSON(), 400);
    }
    if (!VALID_PLANS.includes(plan)) return c.json(new ValidationError('Geçerli bir plan seçiniz.').toJSON(), 400);
    if (!VALID_STATUSES.includes(status)) return c.json(new ValidationError('Geçerli bir durum seçiniz.').toJSON(), 400);
    if (body.maxUsers !== undefined && body.maxUsers !== null && (!Number.isInteger(body.maxUsers) || body.maxUsers < 1)) {
      return c.json(new ValidationError('maxUsers pozitif bir tam sayı veya boş olmalıdır.').toJSON(), 400);
    }

    let modules: AppModule[] | undefined;
    let trialEndsAt: Date | null | undefined;
    let subscriptionStart: Date | null | undefined;
    let subscriptionEnd: Date | null | undefined;
    try {
      modules = validateModules(body.modules);
      trialEndsAt = parseNullableDate(body.trialEndsAt, 'trialEndsAt');
      subscriptionStart = parseNullableDate(body.subscriptionStart, 'subscriptionStart');
      subscriptionEnd = parseNullableDate(body.subscriptionEnd, 'subscriptionEnd');
    } catch (error) {
      if (error instanceof ValidationError) return c.json(error.toJSON(), 400);
      throw error;
    }

    const baseSlug = createSlug(body.slug?.trim() || body.companyName);
    const slugExists = await prisma.tenant.findUnique({ where: { slug: baseSlug } });
    const slug = slugExists ? `${baseSlug}-${Date.now()}` : baseSlug;
    const rawToken = crypto.randomBytes(32).toString('hex');
    const setPasswordToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const setPasswordExpiry = new Date(Date.now() + 60 * 60 * 1000);
    const tempPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 12);
    const meta = getRequestMeta(c);

    const result = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email } });

      if (!user) {
        user = await tx.user.create({
          data: {
            email,
            name: body.ownerName.trim(),
            phone: body.phone?.trim() || null,
            password: tempPassword,
            passwordResetToken: setPasswordToken,
            passwordResetExpiry: setPasswordExpiry,
          },
        });
      } else {
        user = await tx.user.update({
          where: { id: user.id },
          data: {
            name: body.ownerName.trim(),
            phone: body.phone?.trim() || user.phone,
            passwordResetToken: setPasswordToken,
            passwordResetExpiry: setPasswordExpiry,
          },
        });
      }

      const tenant = await tx.tenant.create({
        data: {
          slug,
          companyName: body.companyName.trim(),
          email,
          phone: body.phone?.trim() || null,
          city: body.city?.trim() || null,
          sector: body.sector?.trim() || null,
          plan,
          status,
          maxUsers: body.maxUsers ?? null,
          modules: (modules && modules.length > 0) ? modules : modulesForPrismaPlan(plan),
          notes: body.notes?.trim() || null,
          isCustomPricing: body.isCustomPricing ?? false,
          trialEndsAt,
          subscriptionStart,
          subscriptionEnd,
          planChangedAt: new Date(),
        },
        select: {
          id: true, slug: true, companyName: true, email: true, phone: true,
          plan: true, status: true, city: true, sector: true,
          maxUsers: true, trialEndsAt: true, subscriptionStart: true, subscriptionEnd: true,
          planChangedAt: true, isCustomPricing: true, modules: true, notes: true,
          createdAt: true, updatedAt: true,
        },
      });

      await tx.tenantUser.create({
        data: { tenantId: tenant.id, userId: user.id, isOwner: true, isActive: true },
      });

      await createAuditLog(tx, {
        tenantId: tenant.id,
        adminId: c.get('adminId'),
        module: 'admin',
        entityType: EntityType.OTHER,
        entityId: tenant.id,
        action: AuditAction.CREATE,
        newValues: { tenantId: tenant.id, slug: tenant.slug, plan: tenant.plan, status: tenant.status },
        ...meta,
      });

      await notifyTenantOwners(tx, tenant.id, 'Tenant hesabınız oluşturuldu', [
        `Şirket: ${tenant.companyName}`,
        `Plan: ${tenant.plan}`,
        `Durum: ${tenant.status}`,
        `Modüller: ${formatNotificationValue(translateModules(tenant.modules))}`,
      ]);

      return tenant;
    });

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const setPasswordUrl = `${appUrl}/set-password?token=${rawToken}&email=${encodeURIComponent(email)}`;
    const template = tenantReadyEmail(body.ownerName.trim(), result.companyName, result.plan, setPasswordUrl);
    await sendMail({ to: email, ...template });

    return c.json({ data: await maskTenantForAdmin(c.get('adminId'), result) }, 201);
  },

  async getById(c: Context): Promise<Response> {
    const id = requireParam(c, 'id');
    const tenant = await prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: {
          select: {
            users: true, products: true, invoices: true, contacts: true,
            salesOrders: true, purchaseOrders: true, warehouses: true,
            payments: true, journalEntries: true,
          },
        },
        featureOverrides: true,
      },
    });
    if (!tenant) return c.json(new NotFoundError('Tenant', id).toJSON(), 404);
    return c.json({ data: await maskTenantForAdmin(c.get('adminId'), tenant) });
  },

  async updatePlan(c: Context): Promise<Response> {
    const id = requireParam(c, 'id');
    const body = await c.req.json<{ plan: Plan; reason?: string; ticketId?: string }>();
    if (!body.plan || !VALID_PLANS.includes(body.plan)) {
      return c.json(new ValidationError('Geçerli bir plan seçiniz: STARTER, PROFESSIONAL, ENTERPRISE').toJSON(), 400);
    }

    const tenant = await prisma.tenant.findFirst({ where: { id, deletedAt: null } });
    if (!tenant) return c.json(new NotFoundError('Tenant', id).toJSON(), 404);
    if (tenant.plan === body.plan) return c.json({ data: await maskTenantForAdmin(c.get('adminId'), tenant) });

    if (isCriticalTenantPlanChange(tenant.plan, body.plan)) {
      const metadata = changeMetadataSchema.safeParse({ reason: body.reason, ticketId: body.ticketId });
      if (!metadata.success) return c.json(new ValidationError('Kritik plan değişikliği için en az 10 karakterlik gerekçe zorunludur.').toJSON(), 400);
      const affectedUserCount = await prisma.tenantUser.count({ where: { tenantId: id, isActive: true } });
      const changeRequest = await submitAdminChange({
        type: AdminChangeRequestType.TENANT_PLAN_UPDATE,
        targetId: id,
        targetLabel: tenant.companyName,
        requiredPermission: 'tenant.plan.approve',
        payload: { tenantId: id, plan: body.plan },
        previousValues: { plan: tenant.plan },
        affectedTenantCount: 1,
        affectedUserCount,
        requestedById: c.get('adminId'),
        reason: metadata.data.reason, ticketId: metadata.data.ticketId,
      });
      return c.json({ data: { requiresApproval: true, changeRequest } }, 202);
    }

    const updated = await prisma.$transaction(async tx => {
      const changed = await tx.tenant.update({ where: { id }, data: { plan: body.plan, modules: modulesForPrismaPlan(body.plan), planChangedAt: new Date() } });
      await syncSubscriptionForPlan(tx, id, body.plan);
      return changed;
    });

    await createAuditLog(prisma, {
      tenantId: id,
      adminId: c.get('adminId'),
      module: 'admin',
      entityType: EntityType.OTHER,
      entityId: id,
      action: AuditAction.UPDATE,
      oldValues: { plan: tenant.plan },
      newValues: { plan: updated.plan },
      ...getRequestMeta(c),
    });

    await planChangeExperienceService.handlePlanChanged({
      tenantId: id,
      oldPlan: tenant.plan,
      newPlan: updated.plan,
      changedByUserId: null,
    });

    return c.json({ data: await maskTenantForAdmin(c.get('adminId'), updated) });
  },

  async updateStatus(c: Context): Promise<Response> {
    const id = requireParam(c, 'id');
    const body = await c.req.json<{ status: TenantStatus; reason?: string; ticketId?: string }>();
    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return c.json(new ValidationError('Geçerli bir durum seçiniz.').toJSON(), 400);
    }

    const tenant = await prisma.tenant.findFirst({ where: { id, deletedAt: null } });
    if (!tenant) return c.json(new NotFoundError('Tenant', id).toJSON(), 404);
    if (tenant.status === body.status) return c.json({ data: await maskTenantForAdmin(c.get('adminId'), tenant) });
    assertLegacyTenantTransition(tenant.status, body.status);

    if (isCriticalTenantStatusChange(body.status)) {
      const metadata = changeMetadataSchema.safeParse({ reason: body.reason, ticketId: body.ticketId });
      if (!metadata.success) return c.json(new ValidationError('Kritik durum değişikliği için en az 10 karakterlik gerekçe zorunludur.').toJSON(), 400);
      const affectedUserCount = await prisma.tenantUser.count({ where: { tenantId: id, isActive: true } });
      const changeRequest = await submitAdminChange({
        type: AdminChangeRequestType.TENANT_STATUS_UPDATE,
        targetId: id,
        targetLabel: tenant.companyName,
        requiredPermission: 'tenant.status.approve',
        payload: { tenantId: id, status: body.status },
        previousValues: { status: tenant.status, lifecycleVersion: tenant.lifecycleVersion },
        affectedTenantCount: 1,
        affectedUserCount,
        requestedById: c.get('adminId'),
        reason: metadata.data.reason, ticketId: metadata.data.ticketId,
      });
      return c.json({ data: { requiresApproval: true, changeRequest } }, 202);
    }

    const updated = await prisma.tenant.update({
      where: { id },
      data: { status: body.status, lifecycleVersion: { increment: 1 } },
    });

    await createAuditLog(prisma, {
      tenantId: id,
      adminId: c.get('adminId'),
      module: 'admin',
      entityType: EntityType.OTHER,
      entityId: id,
      action: AuditAction.UPDATE,
      oldValues: { status: tenant.status },
      newValues: { status: updated.status },
      ...getRequestMeta(c),
    });

    await notifyTenantOwners(prisma, id, 'Tenant durumunuz admin tarafından değiştirildi', [
      `Durum: ${tenant.status} → ${updated.status}`,
    ]);

    return c.json({ data: await maskTenantForAdmin(c.get('adminId'), updated) });
  },

  async updateTenant(c: Context): Promise<Response> {
    const id = requireParam(c, 'id');
    const parsed = tenantSettingsUpdateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json(new ValidationError('Tenant ayarları geçersiz.', Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.') || 'body', issue.message]))).toJSON(), 400);
    const body = parsed.data;

    const tenant = await prisma.tenant.findFirst({ where: { id, deletedAt: null } });
    if (!tenant) return c.json(new NotFoundError('Tenant', id).toJSON(), 404);

    let modules: AppModule[] | undefined;
    let trialEndsAt: Date | null | undefined;
    let subscriptionStart: Date | null | undefined;
    let subscriptionEnd: Date | null | undefined;
    try {
      modules = validateModules(body.modules);
      trialEndsAt = parseNullableDate(body.trialEndsAt, 'trialEndsAt');
      subscriptionStart = parseNullableDate(body.subscriptionStart, 'subscriptionStart');
      subscriptionEnd = parseNullableDate(body.subscriptionEnd, 'subscriptionEnd');
    } catch (error) {
      if (error instanceof ValidationError) return c.json(error.toJSON(), 400);
      throw error;
    }
    if (body.maxUsers !== undefined && body.maxUsers !== null && (!Number.isInteger(body.maxUsers) || body.maxUsers < 1)) {
      return c.json(new ValidationError('maxUsers pozitif bir tam sayı veya boş olmalıdır.').toJSON(), 400);
    }

    const changed = await prisma.tenant.updateMany({
      where: { id, deletedAt: null, updatedAt: new Date(body.expectedUpdatedAt) },
      data: {
        ...(body.maxUsers !== undefined && { maxUsers: body.maxUsers }),
        ...(modules !== undefined && { modules }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.isCustomPricing !== undefined && { isCustomPricing: body.isCustomPricing }),
        ...(trialEndsAt !== undefined && { trialEndsAt }),
        ...(subscriptionStart !== undefined && { subscriptionStart }),
        ...(subscriptionEnd !== undefined && { subscriptionEnd }),
      },
    });
    if (changed.count !== 1) return c.json(new ConflictError('Kayıt başka bir admin tarafından değiştirildi. Güncel veriyi yükleyip değişikliklerinizi yeniden uygulayın.').toJSON(), 409);
    const updated = await prisma.tenant.findUniqueOrThrow({ where: { id } });

    await createAuditLog(prisma, {
      tenantId: id,
      adminId: c.get('adminId'),
      module: 'admin',
      entityType: EntityType.OTHER,
      entityId: id,
      action: AuditAction.UPDATE,
      oldValues: {
        maxUsers: tenant.maxUsers,
        modules: tenant.modules,
        notes: tenant.notes,
        isCustomPricing: tenant.isCustomPricing,
        trialEndsAt: tenant.trialEndsAt,
        subscriptionStart: tenant.subscriptionStart,
        subscriptionEnd: tenant.subscriptionEnd,
      },
      newValues: {
        maxUsers: updated.maxUsers,
        modules: updated.modules,
        notes: updated.notes,
        isCustomPricing: updated.isCustomPricing,
        trialEndsAt: updated.trialEndsAt,
        subscriptionStart: updated.subscriptionStart,
        subscriptionEnd: updated.subscriptionEnd,
      },
      ...getRequestMeta(c),
    });

    // notify: false gönderilmişse bildirim atlanır (varsayılan: true)
    if (body.notify !== false) {
      await notifyTenantOwners(prisma, id, 'Tenant ayarlarınız admin tarafından güncellendi', [
        buildChangeLine('Maksimum kullanıcı', tenant.maxUsers, updated.maxUsers),
        buildChangeLine('Modüller', translateModules(tenant.modules), translateModules(updated.modules)),
        buildChangeLine('Notlar', tenant.notes, updated.notes),
        buildChangeLine('Özel fiyatlandırma', tenant.isCustomPricing, updated.isCustomPricing),
        buildChangeLine('Deneme bitiş tarihi', tenant.trialEndsAt, updated.trialEndsAt),
        buildChangeLine('Abonelik başlangıcı', tenant.subscriptionStart, updated.subscriptionStart),
        buildChangeLine('Abonelik bitişi', tenant.subscriptionEnd, updated.subscriptionEnd),
      ].filter((line): line is string => Boolean(line)));
    }

    return c.json({ data: await maskTenantForAdmin(c.get('adminId'), updated) });
  },
};

// ─────────────────────────────────────────────
// Feature Override Management
// ─────────────────────────────────────────────
