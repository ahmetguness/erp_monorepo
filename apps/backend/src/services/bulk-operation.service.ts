import { AuditAction, EntityType, Prisma, PrismaClient } from '@prisma/client';
import { ValidationError } from '../errors/index.js';
import { createAuditLog } from '../utils/audit.js';

export type BulkOperationTarget = 'contacts' | 'products' | 'invoices';
export type BulkOperationMode = 'preview' | 'execute';

type ContactBulkField = 'isActive' | 'city' | 'country' | 'paymentTermDays' | 'notes';
type ProductBulkField = 'isActive' | 'salesPrice' | 'purchasePrice' | 'minStockLevel' | 'description';
type InvoiceBulkField = 'dueDate' | 'notes';
export type BulkOperationField = ContactBulkField | ProductBulkField | InvoiceBulkField;

export type BulkValue = string | number | boolean | null;

export interface BulkOperationInput {
  ids: readonly string[];
  field: string;
  value: BulkValue;
}

export interface BulkOperationContext {
  tenantId: string;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface BulkOperationChange {
  id: string;
  label: string;
  field: BulkOperationField;
  oldValue: BulkValue;
  newValue: BulkValue;
  changed: boolean;
}

export interface BulkOperationResult {
  batchId: string;
  target: BulkOperationTarget;
  mode: BulkOperationMode;
  field: BulkOperationField;
  totalRequested: number;
  matched: number;
  changed: number;
  skipped: number;
  missingIds: string[];
  changes: BulkOperationChange[];
  rollbackLogId: string | null;
}

type ContactRecord = {
  id: string;
  name: string;
  isActive: boolean;
  city: string | null;
  country: string;
  paymentTermDays: number | null;
  notes: string | null;
};

type ProductRecord = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  salesPrice: Prisma.Decimal;
  purchasePrice: Prisma.Decimal;
  minStockLevel: Prisma.Decimal;
  description: string | null;
};

type InvoiceRecord = {
  id: string;
  number: string;
  dueDate: Date | null;
  notes: string | null;
};

const MAX_BULK_OPERATION_RECORDS = 100;
const CONTACT_FIELDS = ['isActive', 'city', 'country', 'paymentTermDays', 'notes'] as const;
const PRODUCT_FIELDS = ['isActive', 'salesPrice', 'purchasePrice', 'minStockLevel', 'description'] as const;
const INVOICE_FIELDS = ['dueDate', 'notes'] as const;

function normalizeIds(ids: readonly string[]): string[] {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) throw new ValidationError('En az bir kayıt seçilmelidir.');
  if (uniqueIds.length > MAX_BULK_OPERATION_RECORDS) {
    throw new ValidationError(`Tek seferde en fazla ${MAX_BULK_OPERATION_RECORDS} kayıt güncellenebilir.`);
  }
  return uniqueIds;
}

function assertField<T extends string>(field: string, fields: readonly T[], target: BulkOperationTarget): T {
  const matched = fields.find((item) => item === field);
  if (!matched) throw new ValidationError(`${target} için desteklenmeyen toplu işlem alanı: ${field}`);
  return matched;
}

function parseBoolean(value: BulkValue, field: string): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ValidationError(`${field} boolean olmalıdır.`);
}

function parseNullableString(value: BulkValue, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new ValidationError(`${field} metin olmalıdır.`);
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseRequiredString(value: BulkValue, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${field} boş bırakılamaz.`);
  }
  return value.trim();
}

function parseNullableInt(value: BulkValue, field: string): number | null {
  if (value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new ValidationError(`${field} sıfır veya pozitif tam sayı olmalıdır.`);
  return parsed;
}

function parseDecimalString(value: BulkValue, field: string): string {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new ValidationError(`${field} sıfır veya pozitif sayı olmalıdır.`);
  return parsed.toFixed(4);
}

function parseNullableDateIso(value: BulkValue, field: string): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new ValidationError(`${field} tarih metni olmalıdır.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${field} geçerli bir tarih olmalıdır.`);
  return date.toISOString();
}

function contactValue(field: ContactBulkField, value: BulkValue): BulkValue {
  switch (field) {
    case 'isActive':
      return parseBoolean(value, field);
    case 'city':
    case 'notes':
      return parseNullableString(value, field);
    case 'country':
      return parseRequiredString(value, field);
    case 'paymentTermDays':
      return parseNullableInt(value, field);
  }
}

function productValue(field: ProductBulkField, value: BulkValue): BulkValue {
  switch (field) {
    case 'isActive':
      return parseBoolean(value, field);
    case 'description':
      return parseNullableString(value, field);
    case 'salesPrice':
    case 'purchasePrice':
    case 'minStockLevel':
      return parseDecimalString(value, field);
  }
}

function invoiceValue(field: InvoiceBulkField, value: BulkValue): BulkValue {
  switch (field) {
    case 'dueDate':
      return parseNullableDateIso(value, field);
    case 'notes':
      return parseNullableString(value, field);
  }
}

function decimalToString(value: Prisma.Decimal): string {
  return value.toFixed(4);
}

function dateToIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function createBatchId(): string {
  return `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function missingIds(requestedIds: readonly string[], matchedIds: readonly string[]): string[] {
  const matched = new Set(matchedIds);
  return requestedIds.filter((id) => !matched.has(id));
}

function countChanged(changes: readonly BulkOperationChange[]): number {
  return changes.filter((change) => change.changed).length;
}

function buildResult(params: {
  batchId: string;
  target: BulkOperationTarget;
  mode: BulkOperationMode;
  field: BulkOperationField;
  requestedIds: readonly string[];
  changes: readonly BulkOperationChange[];
  rollbackLogId: string | null;
}): BulkOperationResult {
  const changed = countChanged(params.changes);
  return {
    batchId: params.batchId,
    target: params.target,
    mode: params.mode,
    field: params.field,
    totalRequested: params.requestedIds.length,
    matched: params.changes.length,
    changed,
    skipped: params.changes.length - changed,
    missingIds: missingIds(params.requestedIds, params.changes.map((change) => change.id)),
    changes: [...params.changes],
    rollbackLogId: params.rollbackLogId,
  };
}

function createContactChanges(records: readonly ContactRecord[], field: ContactBulkField, newValue: BulkValue): BulkOperationChange[] {
  return records.map((record) => {
    const oldValue = record[field];
    return {
      id: record.id,
      label: record.name,
      field,
      oldValue,
      newValue,
      changed: oldValue !== newValue,
    };
  });
}

function createProductChanges(records: readonly ProductRecord[], field: ProductBulkField, newValue: BulkValue): BulkOperationChange[] {
  return records.map((record) => {
    const oldValue = field === 'salesPrice' || field === 'purchasePrice' || field === 'minStockLevel'
      ? decimalToString(record[field])
      : record[field];
    return {
      id: record.id,
      label: `${record.code} - ${record.name}`,
      field,
      oldValue,
      newValue,
      changed: oldValue !== newValue,
    };
  });
}

function createInvoiceChanges(records: readonly InvoiceRecord[], field: InvoiceBulkField, newValue: BulkValue): BulkOperationChange[] {
  return records.map((record) => {
    const oldValue = field === 'dueDate' ? dateToIso(record.dueDate) : record[field];
    return {
      id: record.id,
      label: record.number,
      field,
      oldValue,
      newValue,
      changed: oldValue !== newValue,
    };
  });
}

function auditJson(result: BulkOperationResult): Prisma.InputJsonObject {
  return {
    batchId: result.batchId,
    target: result.target,
    field: result.field,
    totalRequested: result.totalRequested,
    matched: result.matched,
    changed: result.changed,
    skipped: result.skipped,
    missingIds: result.missingIds,
    changes: result.changes.map((change) => ({
      id: change.id,
      label: change.label,
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      changed: change.changed,
    })),
  };
}

async function createRollbackAudit(
  tx: Prisma.TransactionClient,
  context: BulkOperationContext,
  result: BulkOperationResult,
): Promise<string> {
  const log = await tx.auditLog.create({
    data: {
      tenantId: context.tenantId,
      userId: context.userId,
      module: 'bulk-operations',
      entityType: EntityType.OTHER,
      entityId: result.batchId,
      action: AuditAction.UPDATE,
      oldValues: auditJson(result),
      newValues: { summary: { changed: result.changed, target: result.target, field: result.field } },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
    select: { id: true },
  });
  return log.id;
}

async function auditEntityChanges(
  tx: Prisma.TransactionClient,
  context: BulkOperationContext,
  result: BulkOperationResult,
): Promise<void> {
  const entityType =
    result.target === 'contacts' ? EntityType.CONTACT : result.target === 'products' ? EntityType.PRODUCT : EntityType.INVOICE;

  for (const change of result.changes.filter((item) => item.changed)) {
    await createAuditLog(tx, {
      tenantId: context.tenantId,
      userId: context.userId,
      module: 'bulk-operations',
      entityType,
      entityId: change.id,
      action: AuditAction.UPDATE,
      oldValues: { batchId: result.batchId, field: change.field, value: change.oldValue },
      newValues: { batchId: result.batchId, field: change.field, value: change.newValue },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }
}

export async function previewBulkOperation(
  db: PrismaClient,
  context: Pick<BulkOperationContext, 'tenantId'>,
  target: BulkOperationTarget,
  input: BulkOperationInput,
): Promise<BulkOperationResult> {
  const requestedIds = normalizeIds(input.ids);
  const batchId = createBatchId();

  if (target === 'contacts') {
    const field = assertField(input.field, CONTACT_FIELDS, target);
    const newValue = contactValue(field, input.value);
    const records = await db.contact.findMany({
      where: { tenantId: context.tenantId, id: { in: requestedIds }, deletedAt: null },
      select: { id: true, name: true, isActive: true, city: true, country: true, paymentTermDays: true, notes: true },
      orderBy: { name: 'asc' },
    });
    return buildResult({ batchId, target, mode: 'preview', field, requestedIds, changes: createContactChanges(records, field, newValue), rollbackLogId: null });
  }

  if (target === 'products') {
    const field = assertField(input.field, PRODUCT_FIELDS, target);
    const newValue = productValue(field, input.value);
    const records = await db.product.findMany({
      where: { tenantId: context.tenantId, id: { in: requestedIds }, deletedAt: null },
      select: { id: true, code: true, name: true, isActive: true, salesPrice: true, purchasePrice: true, minStockLevel: true, description: true },
      orderBy: { code: 'asc' },
    });
    return buildResult({ batchId, target, mode: 'preview', field, requestedIds, changes: createProductChanges(records, field, newValue), rollbackLogId: null });
  }

  const field = assertField(input.field, INVOICE_FIELDS, target);
  const newValue = invoiceValue(field, input.value);
  const records = await db.invoice.findMany({
    where: { tenantId: context.tenantId, id: { in: requestedIds }, deletedAt: null },
    select: { id: true, number: true, dueDate: true, notes: true },
    orderBy: { date: 'desc' },
  });
  return buildResult({ batchId, target, mode: 'preview', field, requestedIds, changes: createInvoiceChanges(records, field, newValue), rollbackLogId: null });
}

export async function executeBulkOperation(
  db: PrismaClient,
  context: BulkOperationContext,
  target: BulkOperationTarget,
  input: BulkOperationInput,
): Promise<BulkOperationResult> {
  const preview = await previewBulkOperation(db, context, target, input);
  const changedIds = preview.changes.filter((change) => change.changed).map((change) => change.id);

  if (changedIds.length === 0) {
    return { ...preview, mode: 'execute', rollbackLogId: null };
  }

  return db.$transaction(async (tx) => {
    if (target === 'contacts') {
      await tx.contact.updateMany({
        where: { tenantId: context.tenantId, id: { in: changedIds }, deletedAt: null },
        data: { [preview.field]: preview.changes[0]?.newValue, updatedById: context.userId },
      });
    } else if (target === 'products') {
      await tx.product.updateMany({
        where: { tenantId: context.tenantId, id: { in: changedIds }, deletedAt: null },
        data: { [preview.field]: preview.changes[0]?.newValue, updatedById: context.userId },
      });
    } else {
      await tx.invoice.updateMany({
        where: { tenantId: context.tenantId, id: { in: changedIds }, deletedAt: null },
        data: { [preview.field]: preview.changes[0]?.newValue, updatedById: context.userId },
      });
    }

    const result: BulkOperationResult = { ...preview, mode: 'execute', rollbackLogId: null };
    const rollbackLogId = await createRollbackAudit(tx, context, result);
    const resultWithRollback = { ...result, rollbackLogId };
    await auditEntityChanges(tx, context, resultWithRollback);
    return resultWithRollback;
  });
}
