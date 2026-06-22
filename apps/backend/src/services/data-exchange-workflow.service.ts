import { EntityType, Priority, Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createTask } from './task.service.js';
import type { DataQualityIssue } from './data-quality.service.js';

const IMPORT_BATCHES_KEY = 'data_exchange.import_batches';
const MAX_BATCH_HISTORY = 30;

export type DataExchangeEntity = 'products' | 'contacts' | 'stock' | 'invoices';
export type ImportBatchStatus = 'PREVIEWED' | 'PARTIAL_READY' | 'READY' | 'BLOCKED' | 'ROLLED_BACK';
export type DuplicateResolutionAction = 'skip' | 'update_existing' | 'create_new' | 'merge_later';

export interface ImportBatchRowIssue {
  rowNumber: number;
  errors: string[];
  warnings: string[];
}

export interface DuplicateResolutionSuggestion {
  rowNumber: number;
  field: string;
  value: string;
  action: DuplicateResolutionAction;
  reason: string;
}

export interface ImportBatchHistoryItem {
  batchId: string;
  entity: DataExchangeEntity;
  status: ImportBatchStatus;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  partialImport: boolean;
  mapping: Record<string, string>;
  rowErrors: ImportBatchRowIssue[];
  duplicateSuggestions: DuplicateResolutionSuggestion[];
  createdById: string;
  createdAt: string;
  rolledBackAt: string | null;
  rollbackNote: string;
}

export interface RegisterImportBatchInput {
  tenantId: string;
  userId: string;
  batchId: string;
  entity: DataExchangeEntity;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  partialImport: boolean;
  mapping: Partial<Record<string, string>>;
  rowIssues: ImportBatchRowIssue[];
  duplicateSuggestions: DuplicateResolutionSuggestion[];
  canImportValidRows: boolean;
}

export interface QualityTaskResult {
  taskId: string;
  issueKey: string;
  assignedToId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readMapping(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([key, item]) => [key, item]),
  );
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function readRowIssue(value: unknown): ImportBatchRowIssue | null {
  if (!isRecord(value)) return null;
  return {
    rowNumber: readNumber(value.rowNumber),
    errors: readStringArray(value.errors),
    warnings: readStringArray(value.warnings),
  };
}

function isImportBatchStatus(value: string): value is ImportBatchStatus {
  return value === 'PREVIEWED' || value === 'PARTIAL_READY' || value === 'READY' || value === 'BLOCKED' || value === 'ROLLED_BACK';
}

function isDuplicateAction(value: string): value is DuplicateResolutionAction {
  return value === 'skip' || value === 'update_existing' || value === 'create_new' || value === 'merge_later';
}

function readDuplicateSuggestion(value: unknown): DuplicateResolutionSuggestion | null {
  if (!isRecord(value)) return null;
  const action = readString(value.action);
  return {
    rowNumber: readNumber(value.rowNumber),
    field: readString(value.field),
    value: readString(value.value),
    action: isDuplicateAction(action) ? action : 'merge_later',
    reason: readString(value.reason),
  };
}

function readBatch(value: unknown): ImportBatchHistoryItem | null {
  if (!isRecord(value)) return null;
  const status = readString(value.status);
  const entity = readString(value.entity);
  if (entity !== 'products' && entity !== 'contacts' && entity !== 'stock' && entity !== 'invoices') return null;
  if (!isImportBatchStatus(status)) return null;

  return {
    batchId: readString(value.batchId),
    entity,
    status,
    totalRows: readNumber(value.totalRows),
    validRows: readNumber(value.validRows),
    invalidRows: readNumber(value.invalidRows),
    partialImport: readBoolean(value.partialImport),
    mapping: readMapping(value.mapping),
    rowErrors: Array.isArray(value.rowErrors) ? value.rowErrors.map(readRowIssue).filter((item): item is ImportBatchRowIssue => item !== null) : [],
    duplicateSuggestions: Array.isArray(value.duplicateSuggestions)
      ? value.duplicateSuggestions.map(readDuplicateSuggestion).filter((item): item is DuplicateResolutionSuggestion => item !== null)
      : [],
    createdById: readString(value.createdById),
    createdAt: readString(value.createdAt),
    rolledBackAt: typeof value.rolledBackAt === 'string' ? value.rolledBackAt : null,
    rollbackNote: readString(value.rollbackNote),
  };
}

function parseBatches(value: string | null | undefined): ImportBatchHistoryItem[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(readBatch).filter((item): item is ImportBatchHistoryItem => item !== null);
  } catch {
    return [];
  }
}

async function readBatches(db: PrismaClient, tenantId: string): Promise<ImportBatchHistoryItem[]> {
  const setting = await db.tenantSetting.findUnique({
    where: { tenantId_key: { tenantId, key: IMPORT_BATCHES_KEY } },
    select: { value: true },
  });
  return parseBatches(setting?.value);
}

async function saveBatches(db: PrismaClient, tenantId: string, batches: readonly ImportBatchHistoryItem[]): Promise<void> {
  await db.tenantSetting.upsert({
    where: { tenantId_key: { tenantId, key: IMPORT_BATCHES_KEY } },
    create: { tenantId, key: IMPORT_BATCHES_KEY, value: JSON.stringify(batches) },
    update: { value: JSON.stringify(batches) },
  });
}

function statusForBatch(input: RegisterImportBatchInput): ImportBatchStatus {
  if (!input.canImportValidRows) return 'BLOCKED';
  if (input.partialImport && input.invalidRows > 0) return 'PARTIAL_READY';
  return 'READY';
}

export function duplicateSuggestionsFromWarnings(rows: readonly {
  rowNumber: number;
  values: Record<string, string>;
  warnings: string[];
}[]): DuplicateResolutionSuggestion[] {
  return rows.flatMap((row) => row.warnings
    .filter((warning) => /ayn|duplicate|daha/i.test(warning))
    .map((warning): DuplicateResolutionSuggestion => {
      const field = row.values.taxNumber ? 'taxNumber' : row.values.email ? 'email' : row.values.code ? 'code' : 'name';
      return {
        rowNumber: row.rowNumber,
        field,
        value: row.values[field] ?? '',
        action: warning.toLocaleLowerCase('tr-TR').includes('sistemde') ? 'update_existing' : 'merge_later',
        reason: warning,
      };
    }));
}

export class DataExchangeWorkflowService {
  constructor(private readonly db: PrismaClient) {}

  async listBatches(tenantId: string): Promise<ImportBatchHistoryItem[]> {
    return readBatches(this.db, tenantId);
  }

  async registerBatch(input: RegisterImportBatchInput): Promise<ImportBatchHistoryItem> {
    const current = await readBatches(this.db, input.tenantId);
    const batch: ImportBatchHistoryItem = {
      batchId: input.batchId || randomUUID(),
      entity: input.entity,
      status: statusForBatch(input),
      totalRows: input.totalRows,
      validRows: input.validRows,
      invalidRows: input.invalidRows,
      partialImport: input.partialImport,
      mapping: Object.fromEntries(Object.entries(input.mapping).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
      rowErrors: input.rowIssues.slice(0, 200),
      duplicateSuggestions: input.duplicateSuggestions.slice(0, 100),
      createdById: input.userId,
      createdAt: new Date().toISOString(),
      rolledBackAt: null,
      rollbackNote: 'Bu batch sadece preview kaydıdır; gerçek import commit edilmediği için rollback kayıt durumu olarak işaretlenir.',
    };
    const next = [batch, ...current.filter((item) => item.batchId !== batch.batchId)].slice(0, MAX_BATCH_HISTORY);
    await saveBatches(this.db, input.tenantId, next);
    return batch;
  }

  async rollbackBatch(tenantId: string, batchId: string): Promise<ImportBatchHistoryItem | null> {
    const current = await readBatches(this.db, tenantId);
    const existing = current.find((item) => item.batchId === batchId);
    if (!existing) return null;
    const updated: ImportBatchHistoryItem = {
      ...existing,
      status: 'ROLLED_BACK',
      rolledBackAt: new Date().toISOString(),
      rollbackNote: 'Batch rollback işaretlendi. Kalıcı import commit modeli olmadığı için veri değişikliği geri alınmadı.',
    };
    await saveBatches(this.db, tenantId, current.map((item) => (item.batchId === batchId ? updated : item)));
    return updated;
  }

  async createQualityTask(tenantId: string, userId: string, issue: DataQualityIssue): Promise<QualityTaskResult> {
    const owner = await this.db.tenantUser.findFirst({
      where: { tenantId, isOwner: true, isActive: true, user: { isActive: true } },
      select: { userId: true },
      orderBy: { createdAt: 'asc' },
    });
    const dueAt = new Date(Date.now() + 7 * 86_400_000);
    const task = await createTask(tenantId, {
      title: `Veri kalitesi: ${issue.title}`,
      detail: `${issue.description} Etkilenen kayıt: ${issue.count}.`,
      type: 'GENERAL',
      priority: issue.severity === 'critical' ? Priority.CRITICAL : issue.severity === 'high' ? Priority.HIGH : Priority.MEDIUM,
      module: 'data_exchange',
      entityType: EntityType.OTHER,
      entityId: issue.key,
      href: issue.href,
      source: `data-quality:${issue.key}`,
      assignedToId: owner?.userId ?? null,
      createdById: userId,
      dueAt,
    });
    return { taskId: task.id, issueKey: issue.key, assignedToId: task.assignedToId };
  }
}

export function toJsonObject(value: ImportBatchHistoryItem): Prisma.InputJsonObject {
  return {
    batchId: value.batchId,
    entity: value.entity,
    status: value.status,
    totalRows: value.totalRows,
    validRows: value.validRows,
    invalidRows: value.invalidRows,
    partialImport: value.partialImport,
    mapping: value.mapping,
    rowErrors: value.rowErrors.map((row) => ({ rowNumber: row.rowNumber, errors: row.errors, warnings: row.warnings })),
    duplicateSuggestions: value.duplicateSuggestions.map((item) => ({
      rowNumber: item.rowNumber,
      field: item.field,
      value: item.value,
      action: item.action,
      reason: item.reason,
    })),
    createdById: value.createdById,
    createdAt: value.createdAt,
    rolledBackAt: value.rolledBackAt,
    rollbackNote: value.rollbackNote,
  };
}
