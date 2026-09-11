import { Prisma } from '@prisma/client';
import { Context } from 'hono';
import { NotFoundError,ValidationError } from '../../../../../errors/index.js';
import { prisma } from '../../../../../lib/prisma.js';
import { getObservabilitySnapshot } from '../../../../../services/observability.service.js';
import { requireParam } from '../../../../../utils/context.js';
import { capturePersistentSnapshot } from '../../../persistent-observability/persistent-observability.service.js';

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
    await capturePersistentSnapshot(snapshot);
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
