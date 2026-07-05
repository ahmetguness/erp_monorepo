import { Context } from 'hono';
import { prisma } from '../lib/prisma.js';
import { ValidationError } from '../errors/index.js';
import { getRequestMeta } from '../utils/audit.js';
import { requireTenantId, requireUserId } from '../utils/context.js';
import { StarterCsvImportService, type StarterCsvImportEntity, type StarterCsvImportInput } from '../services/starter-csv-import.service.js';

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}

function parseEntity(value: string | undefined): StarterCsvImportEntity | null {
  if (value === 'products' || value === 'contacts') return value;
  return null;
}

function parseEntityFromPath(path: string): StarterCsvImportEntity | null {
  if (path.includes('/starter-import/products/')) return 'products';
  if (path.includes('/starter-import/contacts/')) return 'contacts';
  return null;
}

function readMapping(value: unknown): Partial<Record<string, string>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const mapping: Partial<Record<string, string>> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') mapping[key] = item;
  }
  return mapping;
}

async function readBody(c: Context): Promise<StarterCsvImportInput> {
  const body = await c.req.json<unknown>().catch(() => null);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { csv: '', mapping: {}, partialImport: false };
  }

  const csv = 'csv' in body && typeof body.csv === 'string' ? body.csv : '';
  const partialImport = 'partialImport' in body && body.partialImport === true;
  const mapping = 'mapping' in body ? readMapping(body.mapping) : {};
  return { csv, mapping, partialImport };
}

function requireEntity(c: Context): StarterCsvImportEntity | Response {
  const entity = parseEntity(c.req.param('entity')) ?? parseEntityFromPath(c.req.path);
  if (!entity) return c.json(new ValidationError('Gecersiz Starter import varligi.').toJSON(), 400);
  return entity;
}

export const StarterCsvImportController = {
  async template(c: Context): Promise<Response> {
    const entity = requireEntity(c);
    if (entity instanceof Response) return entity;
    const service = new StarterCsvImportService(prisma);
    return csvResponse(service.buildTemplateCsv(entity), `starter-${entity}-import-template.csv`);
  },

  async preview(c: Context): Promise<Response> {
    const entity = requireEntity(c);
    if (entity instanceof Response) return entity;
    const tenantId = requireTenantId(c);
    const body = await readBody(c);
    if (!body.csv.trim()) return c.json(new ValidationError('csv alani zorunludur.').toJSON(), 400);

    const preview = await new StarterCsvImportService(prisma).preview(entity, tenantId, body);
    return c.json({ data: preview });
  },

  async commit(c: Context): Promise<Response> {
    const entity = requireEntity(c);
    if (entity instanceof Response) return entity;
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await readBody(c);
    if (!body.csv.trim()) return c.json(new ValidationError('csv alani zorunludur.').toJSON(), 400);

    const result = await new StarterCsvImportService(prisma).commit(entity, tenantId, userId, body, getRequestMeta(c));
    return c.json({ data: result }, 201);
  },
};
