import { Context } from 'hono';
import { DomainEventOutboxStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireTenantId } from '../utils/context.js';

interface DomainEventListQuery {
  page?: string;
  limit?: string;
  status?: string;
  name?: string;
  entityId?: string;
}

const VALID_STATUSES: readonly string[] = Object.values(DomainEventOutboxStatus);

function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, parsed));
}

function parseStatus(value: string | undefined): DomainEventOutboxStatus | undefined {
  if (!value) return undefined;
  return VALID_STATUSES.includes(value) ? value as DomainEventOutboxStatus : undefined;
}

export const DomainEventController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const query = c.req.query() as DomainEventListQuery;
    const page = parsePositiveInt(query.page, 1, 10_000);
    const pageSize = parsePositiveInt(query.limit, 20, 100);
    const status = parseStatus(query.status);

    const where = {
      tenantId,
      ...(status && { status }),
      ...(query.name && { name: query.name }),
      ...(query.entityId && { entityId: query.entityId }),
    };

    const [total, events] = await prisma.$transaction([
      prisma.domainEventOutbox.count({ where }),
      prisma.domainEventOutbox.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: events,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },
};
