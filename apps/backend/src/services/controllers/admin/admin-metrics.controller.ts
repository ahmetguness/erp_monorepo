import { requireParam } from '../../../utils/context.js';
import { Context } from 'hono';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { setCookie, deleteCookie } from 'hono/cookie';
import { AppModule, AuditAction, EntityType, FeatureKey, FeatureType, Plan, Prisma, TenantStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ValidationError, NotFoundError } from '../../../errors';
import { getPaginationParams } from '../../../utils/pagination.js';
import { createAuditLog, getRequestMeta } from '../../../utils/audit.js';
import { sendMail } from '../../mail.service.js';
import { tenantReadyEmail } from '../../mail-templates.service.js';
import { getObservabilitySnapshot } from '../../observability.service.js';
import { rateLimiter } from '../../../lib/rateLimiter';
import { logger } from '../../../lib/logger';
import { getTrustedClientIp } from '../../../utils/request-ip.js';
import { modulesForPrismaPlan, toAppModule, VALID_MODULE_KEYS } from '../../../utils/tenant-modules';
import { PlanFeatureService } from '../../plan-feature.service';
import { PlanChangeExperienceService } from '../../plan-change-experience.service';
import { JWT_SECRET, ADMIN_JWT_SECRET, IS_PRODUCTION, RESOLVED_ADMIN_SECRET, ADMIN_COOKIE_NAME, ADMIN_COOKIE_MAX_AGE, ADMIN_LOGIN_LIMIT, ADMIN_LOGIN_WINDOW_MS, ADMIN_LOGIN_LOCKOUT_FAILURES, ADMIN_LOGIN_LOCKOUT_WINDOW_MS, VALID_PLANS, VALID_STATUSES, VALID_FEATURE_KEYS, VALID_FEATURE_TYPES, VALID_MODULES, planFeatureService, planChangeExperienceService, normalizeEmail, getClientIp, getAdminLoginLimitKeys, recordAdminLoginFailure, isFeatureKey, isPlan, isFeatureType, createSlug, parseNullableDate, validateModules, normalizePlanFeatureValue, getPlanFeatureAuditTenantIds, formatNotificationValue, MODULE_TRANSLATIONS, translateModules, buildChangeLine, notifyTenantOwners } from './shared.js';

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
    const id = requireParam(c, 'id');
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

  async observabilitySearch(c: Context): Promise<Response> {
    const query = c.req.query('q')?.trim();
    if (!query || query.length < 6) {
      return c.json(new ValidationError('Arama için en az 6 karakterli requestId veya correlationId girin.').toJSON(), 400);
    }

    const snapshot = await getObservabilitySnapshot(prisma);
    const matchingSlowEndpoints = snapshot.http.recentSlowEndpoints.filter(
      (item) => item.requestId === query || item.correlationId === query,
    );
    const matchingErrors = snapshot.http.recentErrors.filter(
      (item) => item.requestId === query || item.correlationId === query,
    );
    const matchingSlowQueries = snapshot.slowQueries.recent.filter(
      (item) => item.requestId === query || item.correlationId === query,
    );

    const where: Prisma.AuditLogWhereInput = {
      OR: [
        { newValues: { path: ['requestId'], equals: query } },
        { newValues: { path: ['correlationId'], equals: query } },
        { oldValues: { path: ['requestId'], equals: query } },
        { oldValues: { path: ['correlationId'], equals: query } },
      ],
    };
    const auditLogs = await prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        tenantId: true,
        userId: true,
        module: true,
        entityType: true,
        entityId: true,
        action: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return c.json({
      data: {
        query,
        slowEndpoints: matchingSlowEndpoints,
        errors: matchingErrors,
        slowQueries: matchingSlowQueries,
        auditLogs: auditLogs.map((log) => ({ ...log, createdAt: log.createdAt.toISOString() })),
      },
    });
  },
};

// ─────────────────────────────────────────────
// Admin Audit Logs (no 30-day limit)
// ─────────────────────────────────────────────
