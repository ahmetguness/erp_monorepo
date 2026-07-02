import type { Context } from 'hono';
import { prisma } from '../lib/prisma.js';
import { ValidationError } from '../errors/index.js';
import { executeBulkOperation, previewBulkOperation, type BulkOperationTarget, type BulkValue } from '../services/bulk-operation.service.js';
import { requireTenantId, requireUserId } from '../utils/context.js';
import { getRequestMeta } from '../utils/audit.js';

interface BulkOperationBody {
  ids?: string[];
  field?: string;
  value?: BulkValue;
}

function readBody(body: BulkOperationBody): { ids: string[]; field: string; value: BulkValue } {
  if (!Array.isArray(body.ids)) throw new ValidationError('ids listesi zorunludur.');
  if (!body.ids.every((id) => typeof id === 'string')) throw new ValidationError('ids sadece metin değerlerden oluşmalıdır.');
  if (typeof body.field !== 'string' || body.field.trim().length === 0) throw new ValidationError('field zorunludur.');

  const value = body.value;
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean' && value !== null) {
    throw new ValidationError('value metin, sayı, boolean veya null olmalıdır.');
  }

  return { ids: body.ids, field: body.field, value };
}

async function previewTarget(c: Context, target: BulkOperationTarget): Promise<Response> {
    const tenantId = requireTenantId(c);
    const input = readBody(await c.req.json<BulkOperationBody>());

    const result = await previewBulkOperation(prisma, { tenantId }, target, input);
    return c.json({ data: result });
}

async function executeTarget(c: Context, target: BulkOperationTarget): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const input = readBody(await c.req.json<BulkOperationBody>());
    const meta = getRequestMeta(c);

    const result = await executeBulkOperation(
      prisma,
      { tenantId, userId, ipAddress: meta.ipAddress, userAgent: meta.userAgent },
      target,
      input,
    );
    return c.json({ data: result });
}

export const BulkOperationController = {
  previewContacts: (c: Context): Promise<Response> => previewTarget(c, 'contacts'),
  executeContacts: (c: Context): Promise<Response> => executeTarget(c, 'contacts'),
  previewProducts: (c: Context): Promise<Response> => previewTarget(c, 'products'),
  executeProducts: (c: Context): Promise<Response> => executeTarget(c, 'products'),
  previewInvoices: (c: Context): Promise<Response> => previewTarget(c, 'invoices'),
  executeInvoices: (c: Context): Promise<Response> => executeTarget(c, 'invoices'),
};
