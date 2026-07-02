import { Context } from 'hono';
import { prisma } from '../lib/prisma.js';
import { ValidationError } from '../errors/index.js';
import { ProductQuickImportService } from '../services/product-quick-import.service.js';
import { requireTenantId, requireUserId } from '../utils/context.js';
import { getRequestMeta } from '../utils/audit.js';
import { getValidatedBody } from '../middleware/validateBody.js';
import { productQuickImportBodySchema, type ProductQuickImportBody } from '../schemas/request-body.schemas.js';

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}

export const ProductQuickImportController = {
  async template(c: Context): Promise<Response> {
    const service = new ProductQuickImportService(prisma);
    return csvResponse(service.buildTemplateCsv(), 'product-quick-import-template.csv');
  },

  async preview(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = getValidatedBody<ProductQuickImportBody>(c, productQuickImportBodySchema);
    if (!body.csv.trim()) return c.json(new ValidationError('csv alani zorunludur.').toJSON(), 400);

    const preview = await new ProductQuickImportService(prisma).preview(tenantId, body);
    return c.json({ data: preview });
  },

  async commit(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = getValidatedBody<ProductQuickImportBody>(c, productQuickImportBodySchema);
    if (!body.csv.trim()) return c.json(new ValidationError('csv alani zorunludur.').toJSON(), 400);

    const result = await new ProductQuickImportService(prisma).commit(tenantId, userId, body, getRequestMeta(c));
    return c.json({ data: result }, 201);
  },
};
