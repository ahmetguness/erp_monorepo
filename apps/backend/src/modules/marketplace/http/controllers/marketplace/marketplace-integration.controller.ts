import { AuditAction,EntityType } from '@prisma/client';
import { Context } from 'hono';
import { NotFoundError,ValidationError } from '../../../../../errors/index.js';
import { prisma } from '../../../../../lib/prisma.js';
import { createAuditLog,getRequestMeta } from '../../../../../utils/audit.js';
import { requireParam,requireTenantId,requireUserId } from '../../../../../utils/context.js';
import { encrypt } from '../../../../../utils/encryption.js';
import { hideIntegrationSecrets,parseCreateIntegrationBody,parseUpdateIntegrationBody } from './shared.js';

export const MarketplaceIntegrationController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const data = await prisma.marketplaceIntegration.findMany({
      where: { tenantId },
      include: { _count: { select: { listings: true, orders: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return c.json({ data: data.map(hideIntegrationSecrets) });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const integration = await prisma.marketplaceIntegration.findFirst({
      where: { id, tenantId },
      include: {
        _count: { select: { listings: true, orders: true } },
        listings: { take: 5, orderBy: { lastSyncAt: 'desc' }, include: { product: { select: { id: true, code: true, name: true } } } },
      },
    });
    if (!integration) return c.json(new NotFoundError('Entegrasyon', id).toJSON(), 404);
    return c.json({ data: hideIntegrationSecrets(integration) });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    const parsed = parseCreateIntegrationBody(await c.req.json<unknown>().catch(() => null));
    if (parsed instanceof ValidationError) return c.json(parsed.toJSON(), 400);
    const body = parsed;

    const exists = await prisma.marketplaceIntegration.findUnique({
      where: { tenantId_channel: { tenantId, channel: body.channel } },
    });
    if (exists) return c.json(new ValidationError(`${body.channel} kanalı zaten bağlı.`).toJSON(), 400);

    const integration = await prisma.marketplaceIntegration.create({
      data: {
        tenantId, channel: body.channel, name: body.name,
        apiKey: body.apiKey ? encrypt(body.apiKey) : null, apiSecret: body.apiSecret ? encrypt(body.apiSecret) : null, storeId: body.storeId ?? null,
      },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'marketplace',
      entityType: EntityType.OTHER,
      entityId: integration.id,
      action: AuditAction.CREATE,
      newValues: {
        id: integration.id,
        channel: integration.channel,
        name: integration.name,
        storeId: integration.storeId,
        hasApiKey: Boolean(integration.apiKey),
        hasApiSecret: Boolean(integration.apiSecret),
      },
      ...getRequestMeta(c),
    });

    return c.json({ data: hideIntegrationSecrets(integration) }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.marketplaceIntegration.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Entegrasyon', id).toJSON(), 404);

    const parsed = parseUpdateIntegrationBody(await c.req.json<unknown>().catch(() => null));
    if (parsed instanceof ValidationError) return c.json(parsed.toJSON(), 400);
    const body = parsed;
    const updated = await prisma.marketplaceIntegration.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.apiKey !== undefined && { apiKey: body.apiKey ? encrypt(body.apiKey) : null }),
        ...(body.apiSecret !== undefined && { apiSecret: body.apiSecret ? encrypt(body.apiSecret) : null }),
        ...(body.storeId !== undefined && { storeId: body.storeId }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'marketplace',
      entityType: EntityType.OTHER,
      entityId: id,
      action: AuditAction.UPDATE,
      oldValues: {
        id,
        channel: existing.channel,
        name: existing.name,
        storeId: existing.storeId,
        isActive: existing.isActive,
        hasApiKey: Boolean(existing.apiKey),
        hasApiSecret: Boolean(existing.apiSecret),
      },
      newValues: {
        id: updated.id,
        channel: updated.channel,
        name: updated.name,
        storeId: updated.storeId,
        isActive: updated.isActive,
        hasApiKey: Boolean(updated.apiKey),
        hasApiSecret: Boolean(updated.apiSecret),
      },
      ...getRequestMeta(c),
    });

    return c.json({ data: hideIntegrationSecrets(updated) });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.marketplaceIntegration.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Entegrasyon', id).toJSON(), 404);

    await prisma.marketplaceIntegration.delete({ where: { id } });
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'marketplace',
      entityType: EntityType.OTHER,
      entityId: id,
      action: AuditAction.DELETE,
      oldValues: {
        id,
        channel: existing.channel,
        name: existing.name,
        storeId: existing.storeId,
        isActive: existing.isActive,
        hasApiKey: Boolean(existing.apiKey),
        hasApiSecret: Boolean(existing.apiSecret),
      },
      ...getRequestMeta(c),
    });
    return c.json({ data: { success: true } });
  },
};

// ─────────────────────────────────────────────
// Marketplace Listing Controller
// ─────────────────────────────────────────────
