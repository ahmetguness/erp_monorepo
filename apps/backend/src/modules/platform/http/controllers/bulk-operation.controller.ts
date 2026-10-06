import type { Context } from 'hono';
import { ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { executeBulkOperation,previewBulkOperation,type BulkOperationTarget,type BulkValue } from '../../../../services/bulk-operation.service.js';
import { getRequestMeta } from '../../../../utils/audit.js';
import { requireTenantId,requireUserId } from '../../../../utils/context.js';
import { z } from 'zod';
import { BulkImportAssistanceService } from '../../application/bulk-import-assistance/index.js';
import { PrismaMappingProfileRepository } from '../../infrastructure/persistence/prisma-mapping-profile.repository.js';

const importCellSchema = z.union([z.string().max(10_000), z.number().finite(), z.boolean(), z.null()]);
const importTargetSchema = z.enum(['contacts', 'products', 'invoices']);
const importTargetFields = {
  contacts: new Set(['name', 'taxNumber', 'email', 'phone', 'city', 'country']),
  products: new Set(['code', 'name', 'barcode', 'salesPrice', 'purchasePrice', 'unit']),
  invoices: new Set(['number', 'date', 'dueDate', 'contactName', 'total', 'currency']),
} as const;
const headerSchema = z.string().trim().min(1).max(120);
const mappingSchema = z.object({ source: headerSchema, target: z.string().max(80), confidence: z.number().finite().min(0).max(1), learned: z.boolean() }).strict();
const analyzeImportSchema = z.object({ target: importTargetSchema, headers: z.array(headerSchema).min(1).max(100), rows: z.array(z.record(z.string().max(120), importCellSchema)).max(1000) }).strict().superRefine((value, ctx) => {
  if (new Set(value.headers).size !== value.headers.length) ctx.addIssue({ code: 'custom', message: 'Başlıklar benzersiz olmalıdır.', path: ['headers'] });
});
const saveProfileSchema = z.object({ name: z.string().trim().min(1).max(80), target: importTargetSchema, headers: z.array(headerSchema).min(1).max(100), mappings: z.array(mappingSchema).min(1).max(100) }).strict().superRefine((value, ctx) => {
  const headers = new Set(value.headers);
  if (headers.size !== value.headers.length) ctx.addIssue({ code: 'custom', message: 'Başlıklar benzersiz olmalıdır.', path: ['headers'] });
  const sources = new Set<string>();
  for (const [index, mapping] of value.mappings.entries()) {
    if (!headers.has(mapping.source)) ctx.addIssue({ code: 'custom', message: 'Eşleme kaynağı başlıklarda bulunmalıdır.', path: ['mappings', index, 'source'] });
    if (mapping.target && !importTargetFields[value.target].has(mapping.target)) ctx.addIssue({ code: 'custom', message: 'Eşleme hedef için desteklenmiyor.', path: ['mappings', index, 'target'] });
    if (sources.has(mapping.source)) ctx.addIssue({ code: 'custom', message: 'Eşleme kaynakları benzersiz olmalıdır.', path: ['mappings', index, 'source'] });
    sources.add(mapping.source);
  }
});
const importAssistance = new BulkImportAssistanceService(new PrismaMappingProfileRepository(prisma));

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
  analyzeImport: async (c: Context): Promise<Response> => {
    const tenantId = requireTenantId(c);
    const parsed = analyzeImportSchema.safeParse(await c.req.json<unknown>());
    if (!parsed.success) throw new ValidationError('İçe aktarma örneği geçersiz. Başlık ve satır biçimini kontrol edin.');
    return c.json({ data: await importAssistance.analyze(tenantId, parsed.data) });
  },
  listMappingProfiles: async (c: Context): Promise<Response> => c.json({ data: await importAssistance.listProfiles(requireTenantId(c)) }),
  saveMappingProfile: async (c: Context): Promise<Response> => {
    const tenantId = requireTenantId(c);
    const parsed = saveProfileSchema.safeParse(await c.req.json<unknown>());
    if (!parsed.success) throw new ValidationError('Eşleme profili geçersiz.');
    return c.json({ data: await importAssistance.saveProfile(tenantId, parsed.data) }, 201);
  },
};
