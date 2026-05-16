import { Context } from 'hono';
import { AuditAction, EntityType, FeatureKey } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError } from '../errors';
import { TenantFeatureService } from '../services/tenant-feature.service';
import { requireTenantId } from '../utils/context.js';

// ─────────────────────────────────────────────
// AuditLog Controller
// Starter: son 30 gün, Professional: 1 yıl, Enterprise: sınırsız
// ─────────────────────────────────────────────

const tenantFeatureService = new TenantFeatureService(prisma);
const VALID_AUDIT_ACTIONS: readonly string[] = Object.values(AuditAction);
const VALID_ENTITY_TYPES: readonly string[] = Object.values(EntityType);

function isAuditAction(value: string): value is AuditAction {
  return VALID_AUDIT_ACTIONS.includes(value);
}

function isEntityType(value: string): value is EntityType {
  return VALID_ENTITY_TYPES.includes(value);
}

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
    const tenantId = requireTenantId(c);

    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '50', 10)));
    const module = c.req.query('module');
    const entityType = c.req.query('entityType');
    const action = c.req.query('action');
    const userId = c.req.query('userId');
    const filteredEntityType = entityType && isEntityType(entityType) ? entityType : undefined;
    const filteredAction = action && isAuditAction(action) ? action : undefined;

    // Plan bazlı tarih kısıtlaması
    const feature = await tenantFeatureService.resolveFeature(tenantId, FeatureKey.AUDIT_LOG);
    const dateLimit = getAuditDateFilter(feature.value);

    const where = {
      tenantId,
      ...(dateLimit && { createdAt: { gte: dateLimit } }),
      ...(module && { module }),
      ...(filteredEntityType && { entityType: filteredEntityType }),
      ...(filteredAction && { action: filteredAction }),
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
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

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
    const tenantId = requireTenantId(c);

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
