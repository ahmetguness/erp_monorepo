import { Context } from 'hono';
import { PermissionAction } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getTenantPermissionContext, type TenantPermissionContext } from '../lib/tenant-permissions';
import { ForbiddenError, ValidationError } from '../errors';
import { requireTenantId, requireUserId } from '../utils/context.js';

type DataExchangeEntity = 'products' | 'contacts' | 'stock' | 'invoices';

interface CsvParseResult {
  headers: string[];
  rows: Record<string, string>[];
}

interface ImportPreviewRow {
  rowNumber: number;
  values: Record<string, string>;
  valid: boolean;
  errors: string[];
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

function csvEscape(value: string | number | boolean | null | undefined): string {
  const normalized = value === null || value === undefined ? '' : String(value);
  if (!/[",\r\n]/.test(normalized)) return normalized;
  return `"${normalized.replace(/"/g, '""')}"`;
}

function buildCsv(headers: string[], rows: Record<string, string | number | boolean | null | undefined>[]): string {
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseCsv(csv: string): CsvParseResult {
  const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  });
  return { headers, rows };
}

async function readCsvBody(c: Context): Promise<string> {
  const body = await c.req.json<unknown>().catch(() => null);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return '';
  const value = Object.entries(body).find(([key]) => key === 'csv')?.[1];
  return typeof value === 'string' ? value : '';
}

function previewImport(config: EntityConfig, csv: string): { rows: ImportPreviewRow[]; errors: string[] } {
  const parsed = parseCsv(csv);
  const missingHeaders = config.requiredHeaders.filter((header) => !parsed.headers.includes(header));
  if (missingHeaders.length > 0) {
    return { rows: [], errors: missingHeaders.map((header) => `${header} kolonu zorunludur.`) };
  }

  const rows = parsed.rows.map((values, index): ImportPreviewRow => {
    const errors = config.requiredHeaders
      .filter((header) => !values[header]?.trim())
      .map((header) => `${header} zorunludur.`);

    return {
      rowNumber: index + 2,
      values,
      valid: errors.length === 0,
      errors,
    };
  });

  return { rows, errors: [] };
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

    const csv = await readCsvBody(c);
    if (!csv.trim()) return c.json(new ValidationError('csv alani zorunludur.').toJSON(), 400);

    const preview = previewImport(config, csv);
    return c.json({
      data: {
        entity: config.entity,
        headers: config.headers,
        rows: preview.rows.slice(0, 200),
        errors: preview.errors,
        validRows: preview.rows.filter((row) => row.valid).length,
        invalidRows: preview.rows.filter((row) => !row.valid).length,
      },
    });
  },
};
