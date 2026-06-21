import { Context } from 'hono';
import { DomainEventOutboxStatus } from '@prisma/client';
import {
  DOMAIN_EVENT_LISTENER_IDEMPOTENCY,
  DOMAIN_EVENT_PUBLISH_COVERAGE,
  DOMAIN_EVENT_SCHEMA_VERSION,
} from '../domain-events/events.js';
import { NotFoundError, ValidationError } from '../errors/index.js';
import { prisma } from '../lib/prisma.js';
import { replayDomainEventOutbox } from '../services/domain-event-outbox-worker.service.js';
import { requireTenantId } from '../utils/context.js';

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
    const query = c.req.query();
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

  async failures(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const query = c.req.query();
    const page = parsePositiveInt(query.page, 1, 10_000);
    const pageSize = parsePositiveInt(query.limit, 20, 100);

    const where = {
      tenantId,
      status: { in: [DomainEventOutboxStatus.FAILED, DomainEventOutboxStatus.DEAD_LETTER] },
      ...(query.name && { name: query.name }),
      ...(query.entityId && { entityId: query.entityId }),
    };

    const [total, events] = await prisma.$transaction([
      prisma.domainEventOutbox.count({ where }),
      prisma.domainEventOutbox.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return c.json({
      data: events,
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    });
  },

  async coverage(c: Context): Promise<Response> {
    return c.json({
      data: {
        schemaVersion: DOMAIN_EVENT_SCHEMA_VERSION,
        publishCoverage: DOMAIN_EVENT_PUBLISH_COVERAGE,
        listenerIdempotency: DOMAIN_EVENT_LISTENER_IDEMPOTENCY,
      },
    });
  },

  async replay(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    try {
      const result = await replayDomainEventOutbox(tenantId, id, true);
      if (!result) return c.json(new NotFoundError('Domain event', id).toJSON(), 404);
      return c.json({ data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Domain event replay hatasi.';
      return c.json(new ValidationError(message).toJSON(), 400);
    }
  },
};
