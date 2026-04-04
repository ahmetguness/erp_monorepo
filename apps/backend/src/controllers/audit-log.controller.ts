import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { ForbiddenError } from '../errors';

// ─────────────────────────────────────────────
// AuditLog Controller — read-only for Starter
// Starter: son 30 gün, Professional: 1 yıl, Enterprise: sınırsız
// ─────────────────────────────────────────────

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

    // Starter: son 30 gün
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const where = {
      tenantId,
      createdAt: { gte: thirtyDaysAgo },
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

    const log = await prisma.auditLog.findFirst({ where: { id, tenantId } });
    if (!log) return c.json({ error: 'Kayıt bulunamadı.' }, 404);

    return c.json({ data: log });
  },
};
