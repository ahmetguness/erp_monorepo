import { Context } from 'hono';
import { AuditAction, EntityType, PermissionAction } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { getTenantPermissionContext, type TenantPermissionContext } from '../lib/tenant-permissions';
import { ForbiddenError, ValidationError } from '../errors';
import { requireTenantId, requireUserId } from '../utils/context.js';
import { getDataQualitySummary } from '../services/data-quality.service.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';
import { DataExchangeWorkflowService, duplicateSuggestionsFromWarnings, toJsonObject } from '../services/data-exchange-workflow.service.js';
import { buildCsv, parseCsv, type CsvParseResult } from '../utils/csv.js';
import { StarterAccessService } from '../services/starter-access.service.js';

type DataExchangeEntity = 'products' | 'contacts' | 'stock' | 'invoices';

interface ImportWizardBody {
  csv: string;
  mapping: Partial<Record<string, string>>;
  partialImport: boolean;
}

interface ImportPreviewRow {
  rowNumber: number;
  values: Record<string, string>;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface EntityConfig {
  entity: DataExchangeEntity;
  module: string;
  headers: string[];
  requiredHeaders: string[];
}

const ENTITY_CONFIGS: Record<DataExchangeEntity, EntityConfig> = {
  products: {
    entity: 'products',
    module: 'inventory',
    headers: ['code', 'name', 'barcode', 'salesPrice', 'purchasePrice', 'minStockLevel', 'isActive'],
    requiredHeaders: ['code', 'name'],
  },
  contacts: {
    entity: 'contacts',
    module: 'contacts',
    headers: ['type', 'code', 'name', 'taxNumber', 'email', 'phone', 'city', 'country', 'isActive'],
    requiredHeaders: ['type', 'name'],
  },
  stock: {
    entity: 'stock',
    module: 'inventory',
    headers: ['productCode', 'productName', 'warehouseCode', 'warehouseName', 'quantity'],
    requiredHeaders: ['productCode', 'warehouseCode', 'quantity'],
  },
  invoices: {
    entity: 'invoices',
    module: 'invoicing',
    headers: ['number', 'type', 'status', 'contactName', 'date', 'dueDate', 'currencyCode', 'totalGross'],
    requiredHeaders: ['number', 'type', 'contactName', 'date'],
  },
};

function parseEntity(value: string | undefined): DataExchangeEntity | null {
  if (value === 'products' || value === 'contacts' || value === 'stock' || value === 'invoices') return value;
  return null;
}

function requireEntity(c: Context): EntityConfig | Response {
  const entity = parseEntity(c.req.param('entity'));
  if (!entity) {
    return c.json(new ValidationError('Gecersiz import/export varligi.').toJSON(), 400);
  }
  return ENTITY_CONFIGS[entity];
}

async function requireAccess(
  c: Context,
  tenantId: string,
  userId: string,
  module: string,
  action: PermissionAction,
): Promise<TenantPermissionContext | Response> {
  const permissions = await getTenantPermissionContext(tenantId, userId);
  if (!permissions) return c.json(new ForbiddenError("Bu tenant'a erisiminiz yok.").toJSON(), 403);
  if (!permissions.can(action, module)) {
    return c.json(new ForbiddenError(`Bu islem icin yetkiniz yok (${module}:${action}).`).toJSON(), 403);
  }
  return permissions;
}

async function requireAnyReadAccess(
  c: Context,
  tenantId: string,
  userId: string,
  modules: readonly string[],
): Promise<TenantPermissionContext | Response> {
  const permissions = await getTenantPermissionContext(tenantId, userId);
  if (!permissions) return c.json(new ForbiddenError("Bu tenant'a erisiminiz yok.").toJSON(), 403);
  if (!modules.some((module) => permissions.can(PermissionAction.READ, module))) {
    return c.json(new ForbiddenError(`Bu islem icin yetkiniz yok (${modules.join('|')}:READ).`).toJSON(), 403);
  }
  return permissions;
}

function parseMapping(value: unknown): Partial<Record<string, string>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const mapping: Partial<Record<string, string>> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') mapping[key] = item;
  }
  return mapping;
}

async function readImportBody(c: Context): Promise<ImportWizardBody> {
  const body = await c.req.json<unknown>().catch(() => null);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { csv: '', mapping: {}, partialImport: false };
  }

  const entries = Object.entries(body);
  const csvValue = entries.find(([key]) => key === 'csv')?.[1];
  const mappingValue = entries.find(([key]) => key === 'mapping')?.[1];
  const partialImportValue = entries.find(([key]) => key === 'partialImport')?.[1];

  return {
    csv: typeof csvValue === 'string' ? csvValue : '',
    mapping: parseMapping(mappingValue),
    partialImport: partialImportValue === true,
  };
}

function remapRows(config: EntityConfig, parsed: CsvParseResult, mapping: Partial<Record<string, string>>): CsvParseResult {
  const headers = config.headers;
  const rows = parsed.rows.map((row) => {
    const output: Record<string, string> = {};
    for (const target of headers) {
      const source = mapping[target]?.trim() || target;
      output[target] = row[source] ?? '';
    }
    return output;
  });
  return { headers, rows };
}

async function dbDuplicateWarnings(config: EntityConfig, tenantId: string, rows: Record<string, string>[]): Promise<Map<number, string[]>> {
  const warnings = new Map<number, string[]>();

  if (config.entity === 'products') {
    const codes = Array.from(new Set(rows.map((row) => row.code?.trim()).filter((code): code is string => Boolean(code))));
    if (codes.length === 0) return warnings;
    const existing = await prisma.product.findMany({
      where: { tenantId, deletedAt: null, code: { in: codes } },
      select: { code: true },
    });
    const existingCodes = new Set(existing.map((product) => product.code));
    rows.forEach((row, index) => {
      if (existingCodes.has(row.code?.trim())) warnings.set(index, ['Aynı ürün kodu sistemde mevcut.']);
    });
  }

  if (config.entity === 'contacts') {
    const codes = Array.from(new Set(rows.map((row) => row.code?.trim()).filter((code): code is string => Boolean(code))));
    const taxNumbers = Array.from(new Set(rows.map((row) => row.taxNumber?.trim()).filter((taxNumber): taxNumber is string => Boolean(taxNumber))));
    const emails = Array.from(new Set(rows.map((row) => row.email?.trim()).filter((email): email is string => Boolean(email))));
    if (codes.length === 0 && taxNumbers.length === 0 && emails.length === 0) return warnings;
    const existing = await prisma.contact.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          ...(codes.length > 0 ? [{ code: { in: codes } }] : []),
          ...(taxNumbers.length > 0 ? [{ taxNumber: { in: taxNumbers } }] : []),
          ...(emails.length > 0 ? [{ email: { in: emails } }] : []),
        ],
      },
      select: { code: true, taxNumber: true, email: true },
    });
    const existingCodes = new Set(existing.map((contact) => contact.code).filter((code): code is string => Boolean(code)));
    const existingTaxNumbers = new Set(existing.map((contact) => contact.taxNumber).filter((taxNumber): taxNumber is string => Boolean(taxNumber)));
    const existingEmails = new Set(existing.map((contact) => contact.email).filter((email): email is string => Boolean(email)));
    rows.forEach((row, index) => {
      const rowWarnings = [
        existingCodes.has(row.code?.trim()) ? 'Aynı cari kodu sistemde mevcut.' : null,
        existingTaxNumbers.has(row.taxNumber?.trim()) ? 'Aynı vergi numarası sistemde mevcut.' : null,
        existingEmails.has(row.email?.trim()) ? 'Aynı e-posta sistemde mevcut.' : null,
      ].filter((warning): warning is string => warning !== null);
      if (rowWarnings.length > 0) warnings.set(index, rowWarnings);
    });
  }

  return warnings;
}

function fileDuplicateWarnings(config: EntityConfig, rows: Record<string, string>[]): Map<number, string[]> {
  const warnings = new Map<number, string[]>();
  const uniqueField = config.entity === 'products' ? 'code' : config.entity === 'contacts' ? 'code' : null;
  if (!uniqueField) return warnings;

  const seen = new Map<string, number>();
  rows.forEach((row, index) => {
    const key = row[uniqueField]?.trim().toLocaleLowerCase('tr-TR');
    if (!key) return;
    const firstIndex = seen.get(key);
    if (firstIndex === undefined) {
      seen.set(key, index);
      return;
    }
    warnings.set(index, [`Dosyada ${uniqueField} daha önce ${firstIndex + 2}. satırda kullanılmış.`]);
  });
  return warnings;
}

async function previewImport(config: EntityConfig, tenantId: string, body: ImportWizardBody): Promise<{ rows: ImportPreviewRow[]; errors: string[] }> {
  const rawParsed = parseCsv(body.csv);
  const mappingErrors = Object.entries(body.mapping).flatMap(([target, source]) => {
    const column = source?.trim();
    if (!column || rawParsed.headers.includes(column)) return [];
    return [`${target} eşleştirmesi için ${column} kolonu dosyada yok.`];
  });
  if (mappingErrors.length > 0) return { rows: [], errors: mappingErrors };

  const parsed = Object.keys(body.mapping).length > 0 ? remapRows(config, rawParsed, body.mapping) : rawParsed;
  const missingHeaders = config.requiredHeaders.filter((header) => !parsed.headers.includes(header));
  if (missingHeaders.length > 0) {
    return { rows: [], errors: missingHeaders.map((header) => `${header} kolonu zorunludur.`) };
  }

  const dbWarnings = await dbDuplicateWarnings(config, tenantId, parsed.rows);
  const fileWarnings = fileDuplicateWarnings(config, parsed.rows);
  const rows = parsed.rows.map((values, index): ImportPreviewRow => {
    const errors = config.requiredHeaders
      .filter((header) => !values[header]?.trim())
      .map((header) => `${header} zorunludur.`);
    const warnings = [
      ...(fileWarnings.get(index) ?? []),
      ...(dbWarnings.get(index) ?? []),
    ];

    return {
      rowNumber: index + 2,
      values,
      valid: errors.length === 0,
      errors,
      warnings,
    };
  });

  if (config.entity === 'products') {
    await applyProductLimitToPreview(tenantId, rows);
  }

  return { rows, errors: [] };
}

async function applyProductLimitToPreview(tenantId: string, rows: ImportPreviewRow[]): Promise<void> {
  const validRows = rows.filter((row) => row.valid).length;
  const capacity = await new StarterAccessService(prisma).getProductCapacity(tenantId, validRows);
  if (capacity.allowed || capacity.remainingSlots === null) return;

  let acceptedRows = 0;
  for (const row of rows) {
    if (!row.valid) continue;
    acceptedRows += 1;
    if (acceptedRows > capacity.remainingSlots) {
      row.valid = false;
      row.errors.push(`Plan urun limiti asiliyor. Kalan hak: ${capacity.remainingSlots}.`);
    }
  }
}

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}

async function exportEntity(entity: DataExchangeEntity, tenantId: string): Promise<string> {
  if (entity === 'products') {
    const rows = await prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      select: { code: true, name: true, barcode: true, salesPrice: true, purchasePrice: true, minStockLevel: true, isActive: true },
      orderBy: { code: 'asc' },
      take: 5_000,
    });
    return buildCsv(ENTITY_CONFIGS.products.headers, rows.map((row) => ({
      ...row,
      salesPrice: Number(row.salesPrice).toFixed(2),
      purchasePrice: Number(row.purchasePrice).toFixed(2),
      minStockLevel: Number(row.minStockLevel).toFixed(3),
    })));
  }

  if (entity === 'contacts') {
    const rows = await prisma.contact.findMany({
      where: { tenantId, deletedAt: null },
      select: { type: true, code: true, name: true, taxNumber: true, email: true, phone: true, city: true, country: true, isActive: true },
      orderBy: { name: 'asc' },
      take: 5_000,
    });
    return buildCsv(ENTITY_CONFIGS.contacts.headers, rows);
  }

  if (entity === 'stock') {
    const rows = await prisma.stockLevel.findMany({
      where: { tenantId },
      select: {
        quantity: true,
        product: { select: { code: true, name: true } },
        warehouse: { select: { code: true, name: true } },
      },
      orderBy: [{ product: { code: 'asc' } }, { warehouse: { code: 'asc' } }],
      take: 5_000,
    });
    return buildCsv(ENTITY_CONFIGS.stock.headers, rows.map((row) => ({
      productCode: row.product.code,
      productName: row.product.name,
      warehouseCode: row.warehouse.code,
      warehouseName: row.warehouse.name,
      quantity: Number(row.quantity).toFixed(3),
    })));
  }

  const rows = await prisma.invoice.findMany({
    where: { tenantId, deletedAt: null },
    select: {
      number: true,
      type: true,
      status: true,
      date: true,
      dueDate: true,
      currencyCode: true,
      totalGross: true,
      contact: { select: { name: true } },
    },
    orderBy: { date: 'desc' },
    take: 5_000,
  });
  return buildCsv(ENTITY_CONFIGS.invoices.headers, rows.map((row) => ({
    number: row.number,
    type: row.type,
    status: row.status,
    contactName: row.contact.name,
    date: row.date.toISOString().slice(0, 10),
    dueDate: row.dueDate?.toISOString().slice(0, 10) ?? '',
    currencyCode: row.currencyCode,
    totalGross: Number(row.totalGross).toFixed(2),
  })));
}

export const DataExchangeController = {
  async batches(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const access = await requireAnyReadAccess(c, tenantId, userId, ['reporting', 'contacts', 'inventory', 'invoicing']);
    if (access instanceof Response) return access;

    const batches = await new DataExchangeWorkflowService(prisma).listBatches(tenantId);
    return c.json({ data: batches });
  },

  async rollbackBatch(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const batchId = c.req.param('batchId');
    if (!batchId) return c.json(new ValidationError('batchId zorunludur.').toJSON(), 400);
    const access = await requireAnyReadAccess(c, tenantId, userId, ['reporting', 'contacts', 'inventory', 'invoicing']);
    if (access instanceof Response) return access;

    const batch = await new DataExchangeWorkflowService(prisma).rollbackBatch(tenantId, batchId);
    if (!batch) return c.json(new ValidationError('Import batch bulunamadı.').toJSON(), 404);

    const { ipAddress, userAgent } = getRequestMeta(c);
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'data_exchange',
      entityType: EntityType.OTHER,
      entityId: batch.batchId,
      action: AuditAction.UPDATE,
      newValues: toJsonObject(batch),
      ipAddress,
      userAgent,
    });

    return c.json({ data: batch });
  },

  async quality(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const access = await requireAnyReadAccess(c, tenantId, userId, ['reporting', 'contacts', 'inventory', 'hr', 'sales', 'invoicing']);
    if (access instanceof Response) return access;

    const summary = await getDataQualitySummary(prisma, tenantId);
    return c.json({ data: summary });
  },

  async createQualityTask(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const access = await requireAnyReadAccess(c, tenantId, userId, ['reporting', 'contacts', 'inventory', 'hr', 'sales', 'invoicing']);
    if (access instanceof Response) return access;

    const issueKey = c.req.param('issueKey');
    const summary = await getDataQualitySummary(prisma, tenantId);
    const issue = summary.issues.find((item) => item.key === issueKey);
    if (!issue) return c.json(new ValidationError('Data quality sorunu bulunamadı.').toJSON(), 404);

    const result = await new DataExchangeWorkflowService(prisma).createQualityTask(tenantId, userId, issue);
    return c.json({ data: result }, 201);
  },

  async template(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const config = requireEntity(c);
    if (config instanceof Response) return config;

    const access = await requireAccess(c, tenantId, userId, config.module, PermissionAction.READ);
    if (access instanceof Response) return access;

    return csvResponse(buildCsv(config.headers, []), `${config.entity}-template.csv`);
  },

  async export(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const config = requireEntity(c);
    if (config instanceof Response) return config;

    const access = await requireAccess(c, tenantId, userId, config.module, PermissionAction.READ);
    if (access instanceof Response) return access;

    const csv = await exportEntity(config.entity, tenantId);
    return csvResponse(csv, `${config.entity}-export.csv`);
  },

  async preview(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const config = requireEntity(c);
    if (config instanceof Response) return config;

    const access = await requireAccess(c, tenantId, userId, config.module, PermissionAction.CREATE);
    if (access instanceof Response) return access;

    const body = await readImportBody(c);
    if (!body.csv.trim()) return c.json(new ValidationError('csv alani zorunludur.').toJSON(), 400);

    const preview = await previewImport(config, tenantId, body);
    const validRows = preview.rows.filter((row) => row.valid).length;
    const invalidRows = preview.rows.filter((row) => !row.valid).length;
    const canImportValidRows = body.partialImport ? validRows > 0 : invalidRows === 0 && validRows > 0;
    const batchId = randomUUID();
    const duplicateSuggestions = duplicateSuggestionsFromWarnings(preview.rows);
    const batch = await new DataExchangeWorkflowService(prisma).registerBatch({
      tenantId,
      userId,
      batchId,
      entity: config.entity,
      totalRows: preview.rows.length,
      validRows,
      invalidRows,
      partialImport: body.partialImport,
      mapping: body.mapping,
      rowIssues: preview.rows
        .filter((row) => row.errors.length > 0 || row.warnings.length > 0)
        .map((row) => ({ rowNumber: row.rowNumber, errors: row.errors, warnings: row.warnings })),
      duplicateSuggestions,
      canImportValidRows,
    });
    return c.json({
      data: {
        entity: config.entity,
        headers: config.headers,
        rows: preview.rows.slice(0, 200),
        errors: preview.errors,
        validRows,
        invalidRows,
        duplicateSuggestions,
        batchPlan: {
          batchId,
          mapping: body.mapping,
          partialImport: body.partialImport,
          canImportValidRows,
          rollbackAvailable: !body.partialImport || invalidRows === 0,
          rollbackNote: batch.rollbackNote,
        },
      },
    });
  },
};
