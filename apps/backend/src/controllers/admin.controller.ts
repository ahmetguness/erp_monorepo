import { Context } from 'hono';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { setCookie, deleteCookie } from 'hono/cookie';
import { AuditAction, EntityType, FeatureKey, Plan, Prisma, TenantStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ValidationError, NotFoundError } from '../errors';
import { getPaginationParams } from '../utils/pagination.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';
import { sendMail } from '../services/mail.service.js';
import { tenantReadyEmail } from '../services/mail-templates.service.js';
import { getObservabilitySnapshot } from '../services/observability.service.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET ortam değişkeni tanımlı değil. Uygulama başlatılamaz.');

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
if (!ADMIN_JWT_SECRET) {
  throw new Error('ADMIN_JWT_SECRET ortam değişkeni zorunludur.');
}
const RESOLVED_ADMIN_SECRET = ADMIN_JWT_SECRET;

const ADMIN_COOKIE_NAME = 'axon_admin_token';
const ADMIN_COOKIE_MAX_AGE = 24 * 60 * 60; // 24h

const VALID_PLANS = Object.values(Plan);
const VALID_STATUSES = Object.values(TenantStatus);
const VALID_FEATURE_KEYS: readonly string[] = Object.values(FeatureKey);
const VALID_MODULES = [
  'accounting', 'inventory', 'crm', 'sales', 'purchasing', 'warehouse',
  'production', 'service', 'hr', 'payroll', 'marketplace', 'reporting',
  'contacts', 'invoicing', 'approvals',
];

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function isFeatureKey(value: string): value is FeatureKey {
  return VALID_FEATURE_KEYS.includes(value);
}

function createSlug(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return slug || `tenant-${Date.now()}`;
}

function parseNullableDate(value: string | null | undefined, field: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${field} için geçerli bir tarih giriniz.`);
  return date;
}

function validateModules(modules: string[] | undefined): string[] | undefined {
  if (modules === undefined) return undefined;
  if (!Array.isArray(modules)) throw new ValidationError('modules alanı liste olmalıdır.');

  const uniqueModules = Array.from(new Set(modules.map((module) => module.trim().toLowerCase()).filter(Boolean)));
  const invalidModules = uniqueModules.filter((module) => !VALID_MODULES.includes(module));
  if (invalidModules.length > 0) {
    throw new ValidationError(`Geçersiz modül: ${invalidModules.join(', ')}`);
  }
  return uniqueModules;
}

function formatNotificationValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'boş';
  if (value instanceof Date) return value.toLocaleDateString('tr-TR');
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'boş';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  return String(value);
}

const MODULE_TRANSLATIONS: Record<string, string> = {
  accounting: 'Muhasebe',
  inventory: 'Stok & Depo',
  crm: 'CRM',
  sales: 'Satış',
  purchasing: 'Satın Alma',
  warehouse: 'Depo Yönetimi',
  production: 'Üretim',
  service: 'Teknik Servis',
  hr: 'İnsan Kaynakları',
  payroll: 'Bordro',
  marketplace: 'Pazaryeri',
  reporting: 'Raporlama',
  contacts: 'Cari Hesaplar',
  invoicing: 'Fatura',
  approvals: 'Onay Akışları',
};

function translateModules(modules: unknown): unknown {
  if (Array.isArray(modules)) {
    return modules.map(m => MODULE_TRANSLATIONS[m as string] || m);
  }
  return modules;
}

function buildChangeLine(label: string, oldValue: unknown, newValue: unknown): string | null {
  const oldText = formatNotificationValue(oldValue);
  const newText = formatNotificationValue(newValue);
  if (oldText === newText) return null;
  return `${label}: ${oldText} → ${newText}`;
}

async function notifyTenantOwners(
  db: typeof prisma | Prisma.TransactionClient,
  tenantId: string,
  title: string,
  changeLines: string[],
): Promise<void> {
  try {
    const owners = await db.tenantUser.findMany({
      where: { tenantId, isOwner: true, isActive: true },
      select: { userId: true },
    });
    if (owners.length === 0 || changeLines.length === 0) return;

    await db.notification.createMany({
      data: owners.map((owner) => ({
        tenantId,
        userId: owner.userId,
        title,
        message: changeLines.join('\n'),
        module: 'admin',
        entityType: EntityType.OTHER,
        entityId: tenantId,
      })),
    });
  } catch {
    // Bildirim hatası admin işlemini durdurmamalı.
  }
}

// ─────────────────────────────────────────────
// Admin Auth
// ─────────────────────────────────────────────

export const AdminAuthController = {
  async login(c: Context): Promise<Response> {
    const { email, password } = await c.req.json<{ email: string; password: string }>();
    if (!email || !password) return c.json(new ValidationError('Email ve şifre zorunludur.').toJSON(), 400);

    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin || !admin.isActive) return c.json({ error: 'Geçersiz kimlik bilgileri.' }, 401);

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) return c.json({ error: 'Geçersiz kimlik bilgileri.' }, 401);

    await prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

    const token = jwt.sign({ adminId: admin.id, email: admin.email, role: 'admin' }, RESOLVED_ADMIN_SECRET, { expiresIn: '24h' });

    setCookie(c, ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: 'Lax',
      path: '/',
      maxAge: ADMIN_COOKIE_MAX_AGE,
    });

    return c.json({ data: { admin: { id: admin.id, email: admin.email, name: admin.name } } });
  },

  async logout(c: Context): Promise<Response> {
    deleteCookie(c, ADMIN_COOKIE_NAME, {
      path: '/',
      secure: IS_PRODUCTION,
      sameSite: 'Lax',
    });
    return c.json({ data: { success: true } });
  },

  async me(c: Context): Promise<Response> {
    const adminId = c.get('adminId') as string;
    const admin = await prisma.adminUser.findUnique({ where: { id: adminId }, select: { id: true, email: true, name: true, isActive: true, lastLoginAt: true, createdAt: true } });
    if (!admin) return c.json({ error: 'Admin bulunamadı.' }, 404);
    return c.json({ data: admin });
  },
};

// ─────────────────────────────────────────────
// Tenant Management
// ─────────────────────────────────────────────

export const AdminTenantController = {

  async list(c: Context): Promise<Response> {
    const { page, limit, skip } = getPaginationParams(c, 20);
    const status = c.req.query('status') as TenantStatus | undefined;
    const plan = c.req.query('plan') as Plan | undefined;
    const search = c.req.query('search');

    if (status && !VALID_STATUSES.includes(status)) {
      return c.json(new ValidationError('Geçerli bir durum seçiniz.').toJSON(), 400);
    }
    if (plan && !VALID_PLANS.includes(plan)) {
      return c.json(new ValidationError('Geçerli bir plan seçiniz.').toJSON(), 400);
    }

    const where = {
      deletedAt: null,
      ...(status && { status }),
      ...(plan && { plan }),
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
        orderBy: { createdAt: 'desc' },
        skip: skip,
        take: limit,
      }),
    ]);

    return c.json({ data: tenants, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return c.json(new ValidationError('Geçerli bir e-posta adresi giriniz.').toJSON(), 400);
    }
    if (!VALID_PLANS.includes(plan)) return c.json(new ValidationError('Geçerli bir plan seçiniz.').toJSON(), 400);
    if (!VALID_STATUSES.includes(status)) return c.json(new ValidationError('Geçerli bir durum seçiniz.').toJSON(), 400);
    if (body.maxUsers !== undefined && body.maxUsers !== null && (!Number.isInteger(body.maxUsers) || body.maxUsers < 1)) {
      return c.json(new ValidationError('maxUsers pozitif bir tam sayı veya boş olmalıdır.').toJSON(), 400);
    }

    let modules: string[] | undefined;
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
          modules: modules ?? [],
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

    return c.json({ data: result }, 201);
  },

  async getById(c: Context): Promise<Response> {
    const id = c.req.param('id')!;
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
    return c.json({ data: tenant });
  },

  async updatePlan(c: Context): Promise<Response> {
    const id = c.req.param('id')!;
    const body = await c.req.json<{ plan: Plan }>();
    if (!body.plan || !VALID_PLANS.includes(body.plan)) {
      return c.json(new ValidationError('Geçerli bir plan seçiniz: STARTER, PROFESSIONAL, ENTERPRISE').toJSON(), 400);
    }

    const tenant = await prisma.tenant.findFirst({ where: { id, deletedAt: null } });
    if (!tenant) return c.json(new NotFoundError('Tenant', id).toJSON(), 404);

    const updated = await prisma.tenant.update({
      where: { id },
      data: { plan: body.plan, planChangedAt: new Date() },
    });

    await createAuditLog(prisma, {
      tenantId: id,
      module: 'admin',
      entityType: EntityType.OTHER,
      entityId: id,
      action: AuditAction.UPDATE,
      oldValues: { plan: tenant.plan },
      newValues: { plan: updated.plan },
      ...getRequestMeta(c),
    });

    await notifyTenantOwners(prisma, id, 'Planınız admin tarafından değiştirildi', [
      `Plan: ${tenant.plan} → ${updated.plan}`,
    ]);

    return c.json({ data: updated });
  },

  async updateStatus(c: Context): Promise<Response> {
    const id = c.req.param('id')!;
    const body = await c.req.json<{ status: TenantStatus }>();
    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return c.json(new ValidationError('Geçerli bir durum seçiniz.').toJSON(), 400);
    }

    const tenant = await prisma.tenant.findFirst({ where: { id, deletedAt: null } });
    if (!tenant) return c.json(new NotFoundError('Tenant', id).toJSON(), 404);

    const updated = await prisma.tenant.update({
      where: { id },
      data: { status: body.status },
    });

    await createAuditLog(prisma, {
      tenantId: id,
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

    return c.json({ data: updated });
  },

  async updateTenant(c: Context): Promise<Response> {
    const id = c.req.param('id')!;
    const body = await c.req.json<{
      maxUsers?: number | null; modules?: string[]; notes?: string;
      isCustomPricing?: boolean; trialEndsAt?: string | null;
      subscriptionStart?: string | null; subscriptionEnd?: string | null;
      notify?: boolean;
    }>();

    const tenant = await prisma.tenant.findFirst({ where: { id, deletedAt: null } });
    if (!tenant) return c.json(new NotFoundError('Tenant', id).toJSON(), 404);

    let modules: string[] | undefined;
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

    const updated = await prisma.tenant.update({
      where: { id },
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

    await createAuditLog(prisma, {
      tenantId: id,
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

    return c.json({ data: updated });
  },
};

// ─────────────────────────────────────────────
// Feature Override Management
// ─────────────────────────────────────────────

export const AdminFeatureController = {

  async listPlanFeatures(c: Context): Promise<Response> {
    const plan = c.req.query('plan') as Plan | undefined;
    const features = await prisma.planFeature.findMany({
      where: plan ? { plan } : {},
      orderBy: [{ plan: 'asc' }, { key: 'asc' }],
    });
    return c.json({ data: features });
  },

  async listOverrides(c: Context): Promise<Response> {
    const tenantId = c.req.query('tenantId');
    const overrides = await prisma.tenantFeatureOverride.findMany({
      where: tenantId ? { tenantId } : {},
      include: { tenant: { select: { id: true, companyName: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return c.json({ data: overrides });
  },

  async createOverride(c: Context): Promise<Response> {
    const body = await c.req.json<{
      tenantId: string; featureKey: string; value: string;
      isEnabled?: boolean; reason?: string; expiresAt?: string;
    }>();

    if (!body.tenantId || !body.featureKey || body.value === undefined) {
      return c.json(new ValidationError('tenantId, featureKey ve value zorunludur.').toJSON(), 400);
    }

    if (!isFeatureKey(body.featureKey)) {
      return c.json(new ValidationError('Gecersiz featureKey.').toJSON(), 400);
    }

    const featureKey = body.featureKey;

    const existingOverride = await prisma.tenantFeatureOverride.findUnique({
      where: { tenantId_featureKey: { tenantId: body.tenantId, featureKey } },
    });

    const override = await prisma.tenantFeatureOverride.upsert({
      where: { tenantId_featureKey: { tenantId: body.tenantId, featureKey } },
      create: {
        tenantId: body.tenantId,
        featureKey,
        value: body.value,
        isEnabled: body.isEnabled ?? true,
        reason: body.reason ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
      update: {
        value: body.value,
        isEnabled: body.isEnabled ?? true,
        reason: body.reason ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    await notifyTenantOwners(prisma, body.tenantId, 'Tenant özellik ayarınız admin tarafından değiştirildi', [
      `Özellik: ${body.featureKey}`,
      buildChangeLine('Değer', existingOverride?.value, override.value),
      buildChangeLine('Aktiflik', existingOverride?.isEnabled, override.isEnabled),
      buildChangeLine('Gerekçe', existingOverride?.reason, override.reason),
      buildChangeLine('Bitiş tarihi', existingOverride?.expiresAt, override.expiresAt),
    ].filter((line): line is string => Boolean(line)));

    return c.json({ data: override });
  },

  async deleteOverride(c: Context): Promise<Response> {
    const id = c.req.param('id')!;
    const override = await prisma.tenantFeatureOverride.findUnique({ where: { id } });
    await prisma.tenantFeatureOverride.delete({ where: { id } }).catch(() => null);
    if (override) {
      await notifyTenantOwners(prisma, override.tenantId, 'Tenant özellik ayarınız admin tarafından kaldırıldı', [
        `Özellik: ${override.featureKey}`,
        `Kaldırılan değer: ${formatNotificationValue(override.value)}`,
      ]);
    }
    return c.json({ data: { success: true } });
  },
};

// ─────────────────────────────────────────────
// Platform Metrics
// ─────────────────────────────────────────────

export const AdminMetricsController = {

  async dashboard(c: Context): Promise<Response> {
    const [
      totalTenants, activeTenants, trialTenants, suspendedTenants,
      starterCount, professionalCount, enterpriseCount,
      totalUsers, totalProducts, totalInvoices, totalPayments,
    ] = await prisma.$transaction([
      prisma.tenant.count({ where: { deletedAt: null } }),
      prisma.tenant.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
      prisma.tenant.count({ where: { deletedAt: null, status: 'TRIAL' } }),
      prisma.tenant.count({ where: { deletedAt: null, status: 'SUSPENDED' } }),
      prisma.tenant.count({ where: { deletedAt: null, plan: 'STARTER' } }),
      prisma.tenant.count({ where: { deletedAt: null, plan: 'PROFESSIONAL' } }),
      prisma.tenant.count({ where: { deletedAt: null, plan: 'ENTERPRISE' } }),
      prisma.user.count(),
      prisma.product.count(),
      prisma.invoice.count(),
      prisma.payment.count(),
    ]);

    return c.json({
      data: {
        tenants: { total: totalTenants, active: activeTenants, trial: trialTenants, suspended: suspendedTenants },
        plans: { starter: starterCount, professional: professionalCount, enterprise: enterpriseCount },
        totals: { users: totalUsers, products: totalProducts, invoices: totalInvoices, payments: totalPayments },
      },
    });
  },

  async tenantMetrics(c: Context): Promise<Response> {
    const id = c.req.param('id')!;
    const tenant = await prisma.tenant.findFirst({ where: { id, deletedAt: null } });
    if (!tenant) return c.json(new NotFoundError('Tenant', id).toJSON(), 404);

    const [users, products, contacts, invoices, salesOrders, purchaseOrders, payments, warehouses, stockLevels, journalEntries] = await prisma.$transaction([
      prisma.tenantUser.count({ where: { tenantId: id } }),
      prisma.product.count({ where: { tenantId: id, deletedAt: null } }),
      prisma.contact.count({ where: { tenantId: id, deletedAt: null } }),
      prisma.invoice.count({ where: { tenantId: id } }),
      prisma.salesOrder.count({ where: { tenantId: id, deletedAt: null } }),
      prisma.purchaseOrder.count({ where: { tenantId: id, deletedAt: null } }),
      prisma.payment.count({ where: { tenantId: id } }),
      prisma.warehouse.count({ where: { tenantId: id } }),
      prisma.stockLevel.count({ where: { tenantId: id } }),
      prisma.journalEntry.count({ where: { tenantId: id } }),
    ]);

    return c.json({
      data: {
        tenantId: id,
        counts: { users, products, contacts, invoices, salesOrders, purchaseOrders, payments, warehouses, stockLevels, journalEntries },
      },
    });
  },

  async observability(c: Context): Promise<Response> {
    const snapshot = await getObservabilitySnapshot(prisma);
    return c.json({ data: snapshot });
  },
};

// ─────────────────────────────────────────────
// Admin Audit Logs (no 30-day limit)
// ─────────────────────────────────────────────

export const AdminAuditController = {

  async list(c: Context): Promise<Response> {
    const { page, limit, skip } = getPaginationParams(c, 50);
    const tenantId = c.req.query('tenantId');
    const module = c.req.query('module');
    const action = c.req.query('action');

    // Action enum validasyonu
    const VALID_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'EXPORT', 'LOGIN', 'LOGOUT', 'OTHER'];
    if (action && !VALID_ACTIONS.includes(action)) {
      return c.json(new ValidationError(`Geçersiz action. Geçerli değerler: ${VALID_ACTIONS.join(', ')}`).toJSON(), 400);
    }

    const where = {
      ...(tenantId && { tenantId }),
      ...(module && { module }),
      ...(action && { action: action as AuditAction }),
    };

    const [total, logs] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skip,
        take: limit,
      }),
    ]);

    return c.json({ data: logs, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },
};
