import { Context } from 'hono';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Plan, TenantStatus, AuditAction } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ValidationError, NotFoundError } from '../errors';
import { getPaginationParams } from '../utils/pagination.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET ortam değişkeni tanımlı değil. Uygulama başlatılamaz.');

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || JWT_SECRET + '_admin';

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

    const token = jwt.sign({ adminId: admin.id, email: admin.email, role: 'admin' }, ADMIN_JWT_SECRET, { expiresIn: '24h' });

    return c.json({ data: { token, admin: { id: admin.id, email: admin.email, name: admin.name } } });
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
    if (!body.plan || !['STARTER', 'PROFESSIONAL', 'ENTERPRISE'].includes(body.plan)) {
      return c.json(new ValidationError('Geçerli bir plan seçiniz: STARTER, PROFESSIONAL, ENTERPRISE').toJSON(), 400);
    }

    const tenant = await prisma.tenant.findFirst({ where: { id, deletedAt: null } });
    if (!tenant) return c.json(new NotFoundError('Tenant', id).toJSON(), 404);

    const updated = await prisma.tenant.update({
      where: { id },
      data: { plan: body.plan, planChangedAt: new Date() },
    });

    return c.json({ data: updated });
  },

  async updateStatus(c: Context): Promise<Response> {
    const id = c.req.param('id')!;
    const body = await c.req.json<{ status: TenantStatus }>();
    if (!body.status || !['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED'].includes(body.status)) {
      return c.json(new ValidationError('Geçerli bir durum seçiniz.').toJSON(), 400);
    }

    const tenant = await prisma.tenant.findFirst({ where: { id, deletedAt: null } });
    if (!tenant) return c.json(new NotFoundError('Tenant', id).toJSON(), 404);

    const updated = await prisma.tenant.update({
      where: { id },
      data: { status: body.status },
    });

    return c.json({ data: updated });
  },

  async updateTenant(c: Context): Promise<Response> {
    const id = c.req.param('id')!;
    const body = await c.req.json<{
      maxUsers?: number | null; modules?: string[]; notes?: string;
      isCustomPricing?: boolean; trialEndsAt?: string | null;
      subscriptionStart?: string | null; subscriptionEnd?: string | null;
    }>();

    const tenant = await prisma.tenant.findFirst({ where: { id, deletedAt: null } });
    if (!tenant) return c.json(new NotFoundError('Tenant', id).toJSON(), 404);

    const updated = await prisma.tenant.update({
      where: { id },
      data: {
        ...(body.maxUsers !== undefined && { maxUsers: body.maxUsers }),
        ...(body.modules !== undefined && { modules: body.modules }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.isCustomPricing !== undefined && { isCustomPricing: body.isCustomPricing }),
        ...(body.trialEndsAt !== undefined && { trialEndsAt: body.trialEndsAt ? new Date(body.trialEndsAt) : null }),
        ...(body.subscriptionStart !== undefined && { subscriptionStart: body.subscriptionStart ? new Date(body.subscriptionStart) : null }),
        ...(body.subscriptionEnd !== undefined && { subscriptionEnd: body.subscriptionEnd ? new Date(body.subscriptionEnd) : null }),
      },
    });

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

    const override = await prisma.tenantFeatureOverride.upsert({
      where: { tenantId_featureKey: { tenantId: body.tenantId, featureKey: body.featureKey as never } },
      create: {
        tenantId: body.tenantId,
        featureKey: body.featureKey as never,
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

    return c.json({ data: override });
  },

  async deleteOverride(c: Context): Promise<Response> {
    const id = c.req.param('id')!;
    await prisma.tenantFeatureOverride.delete({ where: { id } }).catch(() => null);
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
