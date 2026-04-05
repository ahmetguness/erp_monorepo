import { Context } from 'hono';
import { FeatureKey } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError } from '../errors';
import { TenantFeatureService } from '../services/tenant-feature.service';

// ─────────────────────────────────────────────
// AuditLog Controller
// Starter: son 30 gün, Professional: 1 yıl, Enterprise: sınırsız
// ─────────────────────────────────────────────

const tenantFeatureService = new TenantFeatureService(prisma);

/** AUDIT_LOG feature value'suna göre tarih filtresi döner */
function getAuditDateFilter(auditLevel: string): Date | null {
  const now = new Date();
  switch (auditLevel) {
    case 'basic': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d;
    }
    case 'standard': {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d;
    }
    case 'full':
      return null; // sınırsız
    default: {
      // bilinmeyen değer → restrictive (30 gün)
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d;
    }
  }
}

export const AuditLogController = {

  async list(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '50', 10)));
    const module = c.req.query('module');
    const entityType = c.req.query('entityType');
    const action = c.req.query('action');
    const userId = c.req.query('userId');

    // Plan bazlı tarih kısıtlaması
    const feature = await tenantFeatureService.resolveFeature(tenantId, FeatureKey.AUDIT_LOG);
    const dateLimit = getAuditDateFilter(feature.value);

    const where = {
      tenantId,
      ...(dateLimit && { createdAt: { gte: dateLimit } }),
      ...(module && { module }),
      ...(entityType && { entityType: entityType as never }),
      ...(action && { action: action as never }),
      ...(userId && { userId }),
    };

    const [total, logs] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: logs,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    // Plan bazlı tarih kısıtlaması — eski kayıtlara erişimi engelle
    const feature = await tenantFeatureService.resolveFeature(tenantId, FeatureKey.AUDIT_LOG);
    const dateLimit = getAuditDateFilter(feature.value);

    const log = await prisma.auditLog.findFirst({
      where: {
        id,
        tenantId,
        ...(dateLimit && { createdAt: { gte: dateLimit } }),
      },
    });
    if (!log) return c.json({ error: 'Kayıt bulunamadı.' }, 404);

    return c.json({ data: log });
  },

  /**
   * GET /api/audit-logs/export
   * Enterprise (full) seviyesinde audit log'ları JSON olarak export eder.
   * Standard ve basic seviyelerde 403 döner.
   */
  async exportLogs(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const feature = await tenantFeatureService.resolveFeature(tenantId, FeatureKey.AUDIT_LOG);
    if (feature.value !== 'full') {
      return c.json(new ForbiddenError('Audit log export özelliği sadece Enterprise planında kullanılabilir.').toJSON(), 403);
    }

    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');
    const module = c.req.query('module');

    const where = {
      tenantId,
      ...(dateFrom && { createdAt: { gte: new Date(dateFrom) } }),
      ...(dateTo && { createdAt: { ...((dateFrom ? { gte: new Date(dateFrom) } : {})), lte: new Date(dateTo) } }),
      ...(module && { module }),
    };

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    return c.json({
      data: logs,
      meta: { total: logs.length, exportedAt: new Date().toISOString(), format: 'json' },
    });
  },
};
