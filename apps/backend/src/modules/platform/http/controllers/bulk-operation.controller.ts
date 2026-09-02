import type { Context } from 'hono';
import { ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { executeBulkOperation,previewBulkOperation,type BulkOperationTarget,type BulkValue } from '../../../../services/bulk-operation.service.js';
import { getRequestMeta } from '../../../../utils/audit.js';
import { requireTenantId,requireUserId } from '../../../../utils/context.js';
import { z } from 'zod';
import { BulkImportAssistanceService } from '../../application/bulk-import-assistance/index.js';
import { PrismaMappingProfileRepository } from '../../infrastructure/persistence/prisma-mapping-profile.repository.js';

const importCellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const importTargetSchema = z.enum(['contacts', 'products', 'invoices']);
const mappingSchema = z.object({ source: z.string().min(1), target: z.string(), confidence: z.number().min(0).max(1), learned: z.boolean() });
const analyzeImportSchema = z.object({ target: importTargetSchema, headers: z.array(z.string().min(1)).min(1).max(100), rows: z.array(z.record(z.string(), importCellSchema)).max(1000) });
const saveProfileSchema = z.object({ name: z.string().trim().min(1).max(80), target: importTargetSchema, headers: z.array(z.string().min(1)).min(1).max(100), mappings: z.array(mappingSchema).min(1).max(100) });
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
