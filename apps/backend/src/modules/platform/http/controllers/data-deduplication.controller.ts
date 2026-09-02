import type { Context } from 'hono';
import { z } from 'zod';
import { ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { getRequestMeta } from '../../../../utils/audit.js';
import { requireTenantId, requireUserId } from '../../../../utils/context.js';
import { DataDeduplicationService } from '../../application/data-deduplication/index.js';
import { PrismaDataDeduplicationRepository } from '../../infrastructure/persistence/prisma-data-deduplication.repository.js';

const entitySchema = z.enum(['contacts', 'products', 'invoices']);
const winnerSchema = z.enum(['source', 'target']);
const fieldWinnersSchema = z.object({ name: winnerSchema.optional(), taxNumber: winnerSchema.optional(), taxOffice: winnerSchema.optional(), email: winnerSchema.optional(), phone: winnerSchema.optional(), website: winnerSchema.optional(), address: winnerSchema.optional(), city: winnerSchema.optional(), country: winnerSchema.optional(), notes: winnerSchema.optional(), creditLimit: winnerSchema.optional(), paymentTermDays: winnerSchema.optional() }).strict();
const mergeSchema = z.object({ sourceId: z.string().min(1), targetId: z.string().min(1), fieldWinners: fieldWinnersSchema.default({}) });
const deduplication = new DataDeduplicationService(new PrismaDataDeduplicationRepository(prisma));

async function scanEntity(c: Context, entity: z.infer<typeof entitySchema>): Promise<Response> {
  const thresholdValue = Number(c.req.query('threshold') ?? 0.15);
  const threshold = Number.isFinite(thresholdValue) ? Math.max(0.15, Math.min(1, thresholdValue)) : 0.15;
  return c.json({ data: await deduplication.scan(requireTenantId(c), entity, threshold) });
}

function parseMergeBody(value: unknown) {
  const parsed = mergeSchema.safeParse(value);
  if (!parsed.success) throw new ValidationError('Cari birleştirme isteği geçersiz.');
  return parsed.data;
}

export const DataDeduplicationController = {
  scanContacts: (c: Context): Promise<Response> => scanEntity(c, 'contacts'),
  scanProducts: (c: Context): Promise<Response> => scanEntity(c, 'products'),
  scanInvoices: (c: Context): Promise<Response> => scanEntity(c, 'invoices'),
  previewContactMerge: async (c: Context): Promise<Response> => {
    const body = parseMergeBody(await c.req.json<unknown>());
    return c.json({ data: await deduplication.previewContactMerge(requireTenantId(c), body.sourceId, body.targetId, body.fieldWinners) });
  },
  mergeContacts: async (c: Context): Promise<Response> => {
    const body = parseMergeBody(await c.req.json<unknown>());
    const meta = getRequestMeta(c);
    return c.json({ data: await deduplication.mergeContacts({ tenantId: requireTenantId(c), userId: requireUserId(c), ipAddress: meta.ipAddress, userAgent: meta.userAgent }, body.sourceId, body.targetId, body.fieldWinners) });
  },
  rollbackContactMerge: async (c: Context): Promise<Response> => {
    const auditLogId = c.req.param('auditLogId');
    if (!auditLogId) throw new ValidationError('Audit log kimliği zorunludur.');
    const meta = getRequestMeta(c);
    return c.json({ data: await deduplication.rollbackContactMerge({ tenantId: requireTenantId(c), userId: requireUserId(c), ipAddress: meta.ipAddress, userAgent: meta.userAgent }, auditLogId) });
  },
};
