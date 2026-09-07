import { AuditAction } from '@prisma/client';
import { Context } from 'hono';
import { ValidationError } from '../../../../../errors/index.js';
import { prisma } from '../../../../../lib/prisma.js';
import { getPaginationParams } from '../../../../../utils/pagination.js';

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
        include: { admin: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: skip,
        take: limit,
      }),
    ]);

    return c.json({
      data: logs.map((log) => ({ ...log, createdAt: log.createdAt.toISOString() })),
      meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) },
    });
  },
};
