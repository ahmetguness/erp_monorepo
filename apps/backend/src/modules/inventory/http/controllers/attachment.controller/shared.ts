import { EntityType,PermissionAction,Prisma } from '@prisma/client';
import { basename,extname } from 'path';
import { ForbiddenError,ValidationError } from '../../../../../errors/index.js';
import { prisma } from '../../../../../lib/prisma.js';
import {
parseDocumentCenterCategory,
parseDocumentConfidentiality,
parseDocumentKind,
type DocumentCenterCategory,
type DocumentConfidentiality,
type DocumentKind
} from '../../../../../services/document-center.service.js';

export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.txt',
  '.csv',
  '.docx',
  '.xlsx',
]);

export const ENTITY_TYPES: readonly EntityType[] = Object.values(EntityType);

export function isEntityType(value: string): value is EntityType {
  return ENTITY_TYPES.includes(value as EntityType);
}

export function sanitizeFileName(fileName: string): string {
  return basename(fileName).replace(/[^\w.\- ]/g, '_').slice(0, 180) || 'file';
}

export function sanitizeTag(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 40);
}

export function readFormString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseTagList(value: string | undefined): string[] {
  if (!value) return [];
  return Array.from(new Set(value.split(',').map(sanitizeTag).filter(Boolean))).slice(0, 12);
}

export function parseDateField(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('Gecerli bir tarih girin.');
  }
  return date;
}

export function parsePositiveVersion(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const version = Number.parseInt(value, 10);
  if (!Number.isInteger(version) || version < 1 || version > 999) {
    throw new ValidationError('Versiyon 1 ile 999 arasinda olmalidir.');
  }
  return version;
}

export function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readBodyString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readStringArray(body: Record<string, unknown>, key: string): string[] | undefined {
  const value = body[key];
  if (!Array.isArray(value)) return undefined;
  return Array.from(new Set(value.map((item) => (typeof item === 'string' ? sanitizeTag(item) : '')).filter(Boolean))).slice(0, 12);
}

export function readStringArrayRequired(body: Record<string, unknown>, key: string): string[] {
  const value = body[key];
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))).slice(0, 100);
}

export function parseCategoryInput(value: string | undefined): DocumentCenterCategory | null {
  if (!value) return null;
  const category = parseDocumentCenterCategory(value);
  if (!category) throw new ValidationError('Gecerli bir kategori secin.');
  return category;
}

export function parseKindInput(value: string | undefined): DocumentKind | null {
  if (!value) return null;
  const documentKind = parseDocumentKind(value);
  if (!documentKind) throw new ValidationError('Gecerli bir dokuman tipi secin.');
  return documentKind;
}

export function parseConfidentialityInput(value: string | undefined): DocumentConfidentiality | null {
  if (!value) return null;
  const confidentiality = parseDocumentConfidentiality(value);
  if (!confidentiality) throw new ValidationError('Gecerli bir gizlilik seviyesi secin.');
  return confidentiality;
}

export function validateDocumentDates(validFrom: Date | null | undefined, validUntil: Date | null | undefined): void {
  if (validFrom && validUntil && validFrom > validUntil) {
    throw new ValidationError('Baslangic tarihi bitis tarihinden sonra olamaz.');
  }
}

export interface AttachmentMetadataUpdate {
  data: Prisma.AttachmentUpdateInput;
  validFrom?: Date | null;
  validUntil?: Date | null;
}

export function parseAttachmentMetadataUpdate(body: Record<string, unknown>): AttachmentMetadataUpdate {
  const data: Prisma.AttachmentUpdateInput = {};
  const fileName = readBodyString(body, 'fileName');
  const category = 'category' in body ? parseCategoryInput(readBodyString(body, 'category')) : undefined;
  const tags = 'tags' in body ? readStringArray(body, 'tags') ?? [] : undefined;
  const documentKind = 'documentKind' in body ? parseKindInput(readBodyString(body, 'documentKind')) : undefined;
  const confidentiality = 'confidentiality' in body ? parseConfidentialityInput(readBodyString(body, 'confidentiality')) : undefined;
  const validFrom = 'validFrom' in body ? parseDateField(readBodyString(body, 'validFrom')) ?? null : undefined;
  const validUntil = 'validUntil' in body ? parseDateField(readBodyString(body, 'validUntil')) ?? null : undefined;
  const version = 'version' in body ? parsePositiveVersion(readBodyString(body, 'version')) ?? 1 : undefined;

  validateDocumentDates(validFrom, validUntil);

  if (fileName) data.fileName = sanitizeFileName(fileName);
  if (category !== undefined) data.category = category;
  if (tags !== undefined) data.tags = tags;
  if (documentKind !== undefined) data.documentKind = documentKind;
  if (confidentiality !== undefined) data.confidentiality = confidentiality;
  if (validFrom !== undefined) data.validFrom = validFrom;
  if (validUntil !== undefined) data.validUntil = validUntil;
  if (version !== undefined) data.version = version;
  return { data, validFrom, validUntil };
}

export async function ensureEntityBelongsToTenant(tenantId: string, entityType: EntityType, entityId: string): Promise<void> {
  const count = await countEntity(tenantId, entityType, entityId);
  if (count === 0) {
    throw new ValidationError('Ek dosya baglanacak kayit bu tenant icinde bulunamadi.');
  }
}

export async function canAccessConfidentialDocuments(tenantId: string, userId: string): Promise<boolean> {
  const tenantUser = await prisma.tenantUser.findFirst({
    where: { tenantId, userId, isActive: true },
    select: {
      isOwner: true,
      roleRef: {
        select: {
          permissions: {
            where: { module: 'attachments', action: PermissionAction.UPDATE },
            select: { id: true },
          },
        },
      },
    },
  });
  return Boolean(tenantUser?.isOwner || (tenantUser?.roleRef?.permissions.length ?? 0) > 0);
}

export async function ensureAttachmentConfidentialityAccess(tenantId: string, userId: string, confidentiality: string | null): Promise<void> {
  if (confidentiality !== 'CONFIDENTIAL') return;
  if (await canAccessConfidentialDocuments(tenantId, userId)) return;
  throw new ForbiddenError('Gizli dokumanlara erisim icin attachments:UPDATE yetkisi gereklidir.');
}

export async function countEntity(tenantId: string, entityType: EntityType, entityId: string): Promise<number> {
  switch (entityType) {
    case EntityType.INVOICE:
      return prisma.invoice.count({ where: { id: entityId, tenantId } });
    case EntityType.PRODUCT:
      return prisma.product.count({ where: { id: entityId, tenantId } });
    case EntityType.CATEGORY:
      return prisma.category.count({ where: { id: entityId, tenantId } });
    case EntityType.CONTACT:
      return prisma.contact.count({ where: { id: entityId, tenantId } });
    case EntityType.EMPLOYEE:
      return prisma.employee.count({ where: { id: entityId, tenantId } });
    case EntityType.CUSTOMER_ASSET:
      return prisma.customerAsset.count({ where: { id: entityId, tenantId, deletedAt: null } });
    case EntityType.SERVICE_REQUEST:
      return prisma.serviceRequest.count({ where: { id: entityId, tenantId } });
    case EntityType.PURCHASE_ORDER:
      return prisma.purchaseOrder.count({ where: { id: entityId, tenantId } });
    case EntityType.SALES_QUOTE:
      return prisma.salesQuote.count({ where: { id: entityId, tenantId, deletedAt: null } });
    case EntityType.SALES_ORDER:
      return prisma.salesOrder.count({ where: { id: entityId, tenantId } });
    case EntityType.WORK_ORDER:
      return prisma.workOrder.count({ where: { id: entityId, tenantId } });
    case EntityType.DELIVERY_NOTE:
      return prisma.deliveryNote.count({ where: { id: entityId, tenantId } });
    case EntityType.OTHER:
      return 0;
  }
}

export interface EntityOption {
  id: string;
  label: string;
  detail: string | null;
}

export async function findEntityOptions(tenantId: string, entityType: EntityType, search: string | undefined): Promise<EntityOption[]> {
  const take = 20;
  const contains = search ? { contains: search, mode: 'insensitive' as const } : undefined;

  switch (entityType) {
    case EntityType.CONTACT: {
      const rows = await prisma.contact.findMany({
        where: { tenantId, deletedAt: null, ...(contains && { OR: [{ name: contains }, { code: contains }, { email: contains }] }) },
        select: { id: true, name: true, code: true, email: true },
        orderBy: { name: 'asc' },
        take,
      });
      return rows.map((row) => ({ id: row.id, label: row.code ? `${row.code} - ${row.name}` : row.name, detail: row.email }));
    }
    case EntityType.EMPLOYEE: {
      const rows = await prisma.employee.findMany({
        where: { tenantId, deletedAt: null, ...(contains && { OR: [{ firstName: contains }, { lastName: contains }, { email: contains }] }) },
        select: { id: true, firstName: true, lastName: true, email: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        take,
      });
      return rows.map((row) => ({ id: row.id, label: `${row.firstName} ${row.lastName}`, detail: row.email }));
    }
    case EntityType.INVOICE: {
      const rows = await prisma.invoice.findMany({
        where: { tenantId, deletedAt: null, ...(contains && { number: contains }) },
        select: { id: true, number: true, status: true },
        orderBy: { createdAt: 'desc' },
        take,
      });
      return rows.map((row) => ({ id: row.id, label: row.number, detail: row.status }));
    }
    case EntityType.SALES_QUOTE: {
      const rows = await prisma.salesQuote.findMany({
        where: { tenantId, deletedAt: null, ...(contains && { number: contains }) },
        select: { id: true, number: true, status: true },
        orderBy: { createdAt: 'desc' },
        take,
      });
      return rows.map((row) => ({ id: row.id, label: row.number, detail: row.status }));
    }
    case EntityType.SALES_ORDER: {
      const rows = await prisma.salesOrder.findMany({
        where: { tenantId, deletedAt: null, ...(contains && { number: contains }) },
        select: { id: true, number: true, status: true },
        orderBy: { createdAt: 'desc' },
        take,
      });
      return rows.map((row) => ({ id: row.id, label: row.number, detail: row.status }));
    }
    case EntityType.PURCHASE_ORDER: {
      const rows = await prisma.purchaseOrder.findMany({
        where: { tenantId, deletedAt: null, ...(contains && { number: contains }) },
        select: { id: true, number: true, status: true },
        orderBy: { createdAt: 'desc' },
        take,
      });
      return rows.map((row) => ({ id: row.id, label: row.number, detail: row.status }));
    }
    case EntityType.PRODUCT: {
      const rows = await prisma.product.findMany({
        where: { tenantId, deletedAt: null, ...(contains && { OR: [{ name: contains }, { code: contains }] }) },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
        take,
      });
      return rows.map((row) => ({ id: row.id, label: `${row.code} - ${row.name}`, detail: null }));
    }
    case EntityType.SERVICE_REQUEST: {
      const rows = await prisma.serviceRequest.findMany({
        where: { tenantId, deletedAt: null, ...(contains && { OR: [{ number: contains }, { subject: contains }] }) },
        select: { id: true, number: true, subject: true },
        orderBy: { createdAt: 'desc' },
        take,
      });
      return rows.map((row) => ({ id: row.id, label: `${row.number} - ${row.subject}`, detail: null }));
    }
    case EntityType.WORK_ORDER: {
      const rows = await prisma.workOrder.findMany({
        where: { tenantId, ...(contains && { number: contains }) },
        select: { id: true, number: true, status: true },
        orderBy: { createdAt: 'desc' },
        take,
      });
      return rows.map((row) => ({ id: row.id, label: row.number, detail: row.status }));
    }
    case EntityType.DELIVERY_NOTE: {
      const rows = await prisma.deliveryNote.findMany({
        where: { tenantId, ...(contains && { number: contains }) },
        select: { id: true, number: true, status: true },
        orderBy: { createdAt: 'desc' },
        take,
      });
      return rows.map((row) => ({ id: row.id, label: row.number, detail: row.status }));
    }
    case EntityType.CUSTOMER_ASSET: {
      const rows = await prisma.customerAsset.findMany({
        where: { tenantId, deletedAt: null, ...(contains && { OR: [{ name: contains }, { serialNo: contains }] }) },
        select: { id: true, name: true, serialNo: true },
        orderBy: { name: 'asc' },
        take,
      });
      return rows.map((row) => ({ id: row.id, label: row.serialNo ? `${row.name} - ${row.serialNo}` : row.name, detail: null }));
    }
    case EntityType.CATEGORY:
    case EntityType.OTHER:
      return [];
  }
}

export function validateFile(file: File): { safeName: string; extension: string; mimeType: string } {
  const safeName = sanitizeFileName(file.name);
  const extension = extname(safeName).toLowerCase();
  const mimeType = file.type || 'application/octet-stream';

  if (file.size <= 0) {
    throw new ValidationError('Bos dosya yuklenemez.');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new ValidationError('Dosya boyutu 10MB sinirini asamaz.');
  }
  if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ValidationError('Bu dosya tipi desteklenmiyor.');
  }

  return { safeName, extension, mimeType };
}

export function getAttachmentIdFromAuditValues(value: Prisma.JsonValue | null): string | null {
  if (!isRecord(value)) return null;
  const attachmentId = value.attachmentId;
  return typeof attachmentId === 'string' ? attachmentId : null;
}
