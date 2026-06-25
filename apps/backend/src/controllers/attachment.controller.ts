import { Context } from 'hono';
import { AuditAction, EntityType, PermissionAction, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { basename, extname } from 'path';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { requireTenantId, requireUserId, requireParam } from '../utils/context.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';
import { bufferToArrayBuffer, storageService } from '../services/storage.service.js';
import {
  DocumentCenterService,
  type DocumentCenterCategory,
  type DocumentConfidentiality,
  type DocumentKind,
  parseDocumentCenterCategory,
  parseDocumentCenterSource,
  parseDocumentConfidentiality,
  parseDocumentKind,
} from '../services/document-center.service.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const ALLOWED_EXTENSIONS = new Set([
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

const ENTITY_TYPES: readonly EntityType[] = Object.values(EntityType);

function isEntityType(value: string): value is EntityType {
  return ENTITY_TYPES.includes(value as EntityType);
}

function sanitizeFileName(fileName: string): string {
  return basename(fileName).replace(/[^\w.\- ]/g, '_').slice(0, 180) || 'file';
}

function sanitizeTag(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 40);
}

function readFormString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseTagList(value: string | undefined): string[] {
  if (!value) return [];
  return Array.from(new Set(value.split(',').map(sanitizeTag).filter(Boolean))).slice(0, 12);
}

function parseDateField(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError('Gecerli bir tarih girin.');
  }
  return date;
}

function parsePositiveVersion(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const version = Number.parseInt(value, 10);
  if (!Number.isInteger(version) || version < 1 || version > 999) {
    throw new ValidationError('Versiyon 1 ile 999 arasinda olmalidir.');
  }
  return version;
}

function readRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBodyString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringArray(body: Record<string, unknown>, key: string): string[] | undefined {
  const value = body[key];
  if (!Array.isArray(value)) return undefined;
  return Array.from(new Set(value.map((item) => (typeof item === 'string' ? sanitizeTag(item) : '')).filter(Boolean))).slice(0, 12);
}

function readStringArrayRequired(body: Record<string, unknown>, key: string): string[] {
  const value = body[key];
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))).slice(0, 100);
}

function parseCategoryInput(value: string | undefined): DocumentCenterCategory | null {
  if (!value) return null;
  const category = parseDocumentCenterCategory(value);
  if (!category) throw new ValidationError('Gecerli bir kategori secin.');
  return category;
}

function parseKindInput(value: string | undefined): DocumentKind | null {
  if (!value) return null;
  const documentKind = parseDocumentKind(value);
  if (!documentKind) throw new ValidationError('Gecerli bir dokuman tipi secin.');
  return documentKind;
}

function parseConfidentialityInput(value: string | undefined): DocumentConfidentiality | null {
  if (!value) return null;
  const confidentiality = parseDocumentConfidentiality(value);
  if (!confidentiality) throw new ValidationError('Gecerli bir gizlilik seviyesi secin.');
  return confidentiality;
}

function validateDocumentDates(validFrom: Date | null | undefined, validUntil: Date | null | undefined): void {
  if (validFrom && validUntil && validFrom > validUntil) {
    throw new ValidationError('Baslangic tarihi bitis tarihinden sonra olamaz.');
  }
}

interface AttachmentMetadataUpdate {
  data: Prisma.AttachmentUpdateInput;
  validFrom?: Date | null;
  validUntil?: Date | null;
}

function parseAttachmentMetadataUpdate(body: Record<string, unknown>): AttachmentMetadataUpdate {
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

async function ensureEntityBelongsToTenant(tenantId: string, entityType: EntityType, entityId: string): Promise<void> {
  const count = await countEntity(tenantId, entityType, entityId);
  if (count === 0) {
    throw new ValidationError('Ek dosya baglanacak kayit bu tenant icinde bulunamadi.');
  }
}

async function canAccessConfidentialDocuments(tenantId: string, userId: string): Promise<boolean> {
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

async function ensureAttachmentConfidentialityAccess(tenantId: string, userId: string, confidentiality: string | null): Promise<void> {
  if (confidentiality !== 'CONFIDENTIAL') return;
  if (await canAccessConfidentialDocuments(tenantId, userId)) return;
  throw new ForbiddenError('Gizli dokumanlara erisim icin attachments:UPDATE yetkisi gereklidir.');
}

async function countEntity(tenantId: string, entityType: EntityType, entityId: string): Promise<number> {
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

interface EntityOption {
  id: string;
  label: string;
  detail: string | null;
}

async function findEntityOptions(tenantId: string, entityType: EntityType, search: string | undefined): Promise<EntityOption[]> {
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

function validateFile(file: File): { safeName: string; extension: string; mimeType: string } {
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

function getAttachmentIdFromAuditValues(value: Prisma.JsonValue | null): string | null {
  if (!isRecord(value)) return null;
  const attachmentId = value.attachmentId;
  return typeof attachmentId === 'string' ? attachmentId : null;
}

export const AttachmentController = {
  async library(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '30', 10)));
    const rawEntityType = c.req.query('entityType');
    const entityType = rawEntityType && isEntityType(rawEntityType) ? rawEntityType : undefined;
    const category = parseDocumentCenterCategory(c.req.query('category'));
    const source = parseDocumentCenterSource(c.req.query('source'));

    const service = new DocumentCenterService(prisma);
    const includeConfidential = await canAccessConfidentialDocuments(tenantId, userId);
    const result = await service.list({
      tenantId,
      userId,
      includeConfidential,
      page,
      limit,
      search: c.req.query('search'),
      category,
      source,
      entityType,
    });

    return c.json(result);
  },

  async entityOptions(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const rawEntityType = c.req.query('entityType');
    const search = c.req.query('search')?.trim() || undefined;

    if (!rawEntityType || !isEntityType(rawEntityType)) {
      return c.json(new ValidationError('Gecerli entityType zorunludur.').toJSON(), 400);
    }

    const data = await findEntityOptions(tenantId, rawEntityType, search);
    return c.json({ data });
  },

  async listByEntity(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const rawEntityType = c.req.query('entityType');
    const entityId = c.req.query('entityId');

    if (!rawEntityType || !isEntityType(rawEntityType) || !entityId) {
      return c.json(new ValidationError('Gecerli entityType ve entityId zorunludur.').toJSON(), 400);
    }

    await ensureEntityBelongsToTenant(tenantId, rawEntityType, entityId);
    const includeConfidential = await canAccessConfidentialDocuments(tenantId, userId);

    const attachments = await prisma.attachment.findMany({
      where: {
        tenantId,
        entityType: rawEntityType,
        entityId,
        ...(!includeConfidential && {
          OR: [{ confidentiality: null }, { confidentiality: { not: 'CONFIDENTIAL' } }],
        }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return c.json({ data: attachments });
  },

  async upload(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const formData = await c.req.formData();
    const fileValue = formData.get('file');
    const rawEntityType = formData.get('entityType');
    const rawEntityId = formData.get('entityId');

    if (!(fileValue instanceof File) || typeof rawEntityType !== 'string' || typeof rawEntityId !== 'string') {
      return c.json(new ValidationError('file, entityType ve entityId zorunludur.').toJSON(), 400);
    }
    if (!isEntityType(rawEntityType)) {
      return c.json(new ValidationError('Gecersiz entityType.').toJSON(), 400);
    }

    await ensureEntityBelongsToTenant(tenantId, rawEntityType, rawEntityId);
    const { safeName, extension, mimeType } = validateFile(fileValue);
    const category = parseCategoryInput(readFormString(formData, 'category'));
    const tags = parseTagList(readFormString(formData, 'tags'));
    const documentKind = parseKindInput(readFormString(formData, 'documentKind'));
    const confidentiality = parseConfidentialityInput(readFormString(formData, 'confidentiality'));
    const validFrom = parseDateField(readFormString(formData, 'validFrom'));
    const validUntil = parseDateField(readFormString(formData, 'validUntil'));
    const version = parsePositiveVersion(readFormString(formData, 'version')) ?? 1;
    validateDocumentDates(validFrom, validUntil);

    const storageName = `${randomUUID()}${extension}`;
    const storagePath = `${tenantId}/${storageName}`;
    const buffer = Buffer.from(await fileValue.arrayBuffer());
    await storageService.put({ key: storagePath, body: buffer, contentType: mimeType });

    const attachment = await prisma.attachment.create({
      data: {
        tenantId,
        entityType: rawEntityType,
        entityId: rawEntityId,
        fileName: safeName,
        storagePath,
        mimeType,
        fileSize: fileValue.size,
        category,
        tags,
        documentKind,
        confidentiality,
        validFrom,
        validUntil,
        version,
        uploadedById: userId,
      },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'attachments',
      entityType: rawEntityType,
      entityId: rawEntityId,
      action: AuditAction.CREATE,
      newValues: { attachmentId: attachment.id, fileName: safeName, mimeType, fileSize: fileValue.size, category, tags, documentKind, confidentiality, validFrom, validUntil, version },
      ...getRequestMeta(c),
    });

    return c.json({ data: attachment }, 201);
  },

  async download(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const attachment = await prisma.attachment.findFirst({ where: { id, tenantId } });
    if (!attachment) return c.json(new NotFoundError('Dosya', id).toJSON(), 404);

    await ensureEntityBelongsToTenant(tenantId, attachment.entityType, attachment.entityId);
    await ensureAttachmentConfidentialityAccess(tenantId, userId, attachment.confidentiality);

    const storedObject = await storageService.get(attachment.storagePath);
    if (!storedObject) return c.json(new NotFoundError('Dosya', id).toJSON(), 404);

    const body = new Blob([bufferToArrayBuffer(storedObject.body)]);

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'attachments',
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      action: AuditAction.OTHER,
      newValues: { attachmentId: attachment.id, fileName: attachment.fileName, fileSize: attachment.fileSize },
      ...getRequestMeta(c),
    });

    return new Response(body, {
      headers: {
        'Content-Type': attachment.mimeType ?? storedObject.contentType,
        'Content-Disposition': `attachment; filename="${sanitizeFileName(attachment.fileName)}"`,
        'Content-Length': String(storedObject.contentLength),
      },
    });
  },

  async accessLog(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const attachment = await prisma.attachment.findFirst({ where: { id, tenantId } });
    if (!attachment) return c.json(new NotFoundError('Dosya', id).toJSON(), 404);
    await ensureEntityBelongsToTenant(tenantId, attachment.entityType, attachment.entityId);
    await ensureAttachmentConfidentialityAccess(tenantId, userId, attachment.confidentiality);

    const logs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        module: 'attachments',
        entityType: attachment.entityType,
        entityId: attachment.entityId,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        userId: true,
        action: true,
        oldValues: true,
        newValues: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
      },
    });

    const data = logs
      .filter((log) => getAttachmentIdFromAuditValues(log.oldValues) === id || getAttachmentIdFromAuditValues(log.newValues) === id)
      .map((log) => ({
        id: log.id,
        userId: log.userId,
        action: log.action,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        createdAt: log.createdAt,
      }));

    return c.json({ data });
  },

  async uploadVersion(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const current = await prisma.attachment.findFirst({ where: { id, tenantId } });
    if (!current) return c.json(new NotFoundError('Dosya', id).toJSON(), 404);
    await ensureEntityBelongsToTenant(tenantId, current.entityType, current.entityId);

    const formData = await c.req.formData();
    const formKeys = new Set(Array.from(formData.keys()));
    const fileValue = formData.get('file');
    if (!(fileValue instanceof File)) {
      return c.json(new ValidationError('file zorunludur.').toJSON(), 400);
    }

    const { safeName, extension, mimeType } = validateFile(fileValue);
    const category = formKeys.has('category')
      ? parseCategoryInput(readFormString(formData, 'category'))
      : current.category;
    const tags = readFormString(formData, 'tags') ? parseTagList(readFormString(formData, 'tags')) : current.tags;
    const documentKind = formKeys.has('documentKind')
      ? parseKindInput(readFormString(formData, 'documentKind'))
      : current.documentKind;
    const confidentiality = formKeys.has('confidentiality')
      ? parseConfidentialityInput(readFormString(formData, 'confidentiality'))
      : current.confidentiality;
    const validFrom = formKeys.has('validFrom')
      ? parseDateField(readFormString(formData, 'validFrom')) ?? null
      : current.validFrom;
    const validUntil = formKeys.has('validUntil')
      ? parseDateField(readFormString(formData, 'validUntil')) ?? null
      : current.validUntil;
    const requestedVersion = parsePositiveVersion(readFormString(formData, 'version'));
    const version = requestedVersion ?? current.version + 1;
    validateDocumentDates(validFrom, validUntil);

    const storageName = `${randomUUID()}${extension}`;
    const storagePath = `${tenantId}/${storageName}`;
    const buffer = Buffer.from(await fileValue.arrayBuffer());
    await storageService.put({ key: storagePath, body: buffer, contentType: mimeType });

    const attachment = await prisma.attachment.create({
      data: {
        tenantId,
        entityType: current.entityType,
        entityId: current.entityId,
        fileName: current.fileName,
        storagePath,
        mimeType,
        fileSize: fileValue.size,
        category,
        tags,
        documentKind,
        confidentiality,
        validFrom,
        validUntil,
        version,
        uploadedById: userId,
      },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'attachments',
      entityType: current.entityType,
      entityId: current.entityId,
      action: AuditAction.CREATE,
      oldValues: { attachmentId: current.id, fileName: current.fileName, version: current.version },
      newValues: {
        attachmentId: attachment.id,
        fileName: current.fileName,
        uploadedFileName: safeName,
        version,
        previousAttachmentId: current.id,
      },
      ...getRequestMeta(c),
    });

    return c.json({ data: attachment }, 201);
  },

  async rename(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const attachment = await prisma.attachment.findFirst({ where: { id, tenantId } });
    if (!attachment) return c.json(new NotFoundError('Dosya', id).toJSON(), 404);
    await ensureEntityBelongsToTenant(tenantId, attachment.entityType, attachment.entityId);

    const body = readRecord(await c.req.json<unknown>().catch(() => null));
    const rawFileName = readBodyString(body, 'fileName');
    const fileName = rawFileName ? sanitizeFileName(rawFileName) : undefined;
    const category = 'category' in body ? parseCategoryInput(readBodyString(body, 'category')) : undefined;
    const tags = 'tags' in body ? readStringArray(body, 'tags') ?? [] : undefined;
    const documentKind = 'documentKind' in body ? parseKindInput(readBodyString(body, 'documentKind')) : undefined;
    const confidentiality = 'confidentiality' in body ? parseConfidentialityInput(readBodyString(body, 'confidentiality')) : undefined;
    const validFrom = 'validFrom' in body ? parseDateField(readBodyString(body, 'validFrom')) ?? null : undefined;
    const validUntil = 'validUntil' in body ? parseDateField(readBodyString(body, 'validUntil')) ?? null : undefined;
    const version = 'version' in body ? parsePositiveVersion(readBodyString(body, 'version')) ?? 1 : undefined;

    validateDocumentDates(
      validFrom !== undefined ? validFrom : attachment.validFrom,
      validUntil !== undefined ? validUntil : attachment.validUntil,
    );

    const data: Prisma.AttachmentUpdateInput = {};
    if (fileName) data.fileName = fileName;
    if (category !== undefined) data.category = category;
    if (tags !== undefined) data.tags = tags;
    if (documentKind !== undefined) data.documentKind = documentKind;
    if (confidentiality !== undefined) data.confidentiality = confidentiality;
    if (validFrom !== undefined) data.validFrom = validFrom;
    if (validUntil !== undefined) data.validUntil = validUntil;
    if (version !== undefined) data.version = version;

    if (Object.keys(data).length === 0) {
      return c.json(new ValidationError('Guncellenecek en az bir alan gonderilmelidir.').toJSON(), 400);
    }

    await prisma.attachment.updateMany({
      where: { id, tenantId },
      data,
    });

    const updated = await prisma.attachment.findFirst({ where: { id, tenantId } });
    if (!updated) return c.json(new NotFoundError('Dosya', id).toJSON(), 404);

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'attachments',
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      action: AuditAction.UPDATE,
      oldValues: {
        attachmentId: id,
        fileName: attachment.fileName,
        category: attachment.category,
        tags: attachment.tags,
        documentKind: attachment.documentKind,
        confidentiality: attachment.confidentiality,
        validFrom: attachment.validFrom,
        validUntil: attachment.validUntil,
        version: attachment.version,
      },
      newValues: {
        attachmentId: id,
        fileName: updated.fileName,
        category: updated.category,
        tags: updated.tags,
        documentKind: updated.documentKind,
        confidentiality: updated.confidentiality,
        validFrom: updated.validFrom,
        validUntil: updated.validUntil,
        version: updated.version,
      },
      ...getRequestMeta(c),
    });

    return c.json({ data: updated });
  },

  async bulkMetadata(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = readRecord(await c.req.json<unknown>().catch(() => null));
    const ids = readStringArrayRequired(body, 'ids');
    if (ids.length === 0) {
      return c.json(new ValidationError('Güncellenecek dosya seçilmelidir.').toJSON(), 400);
    }

    const metadata = isRecord(body.metadata) ? body.metadata : body;
    const metadataUpdate = parseAttachmentMetadataUpdate(metadata);
    const { data } = metadataUpdate;
    if (Object.keys(data).length === 0) {
      return c.json(new ValidationError('Güncellenecek en az bir metadata alanı gönderilmelidir.').toJSON(), 400);
    }

    const attachments = await prisma.attachment.findMany({
      where: { tenantId, id: { in: ids } },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        fileName: true,
        category: true,
        tags: true,
        documentKind: true,
        confidentiality: true,
        validFrom: true,
        validUntil: true,
        version: true,
      },
    });

    if (attachments.length === 0) {
      return c.json(new NotFoundError('Dosya').toJSON(), 404);
    }

    attachments.forEach((attachment) => {
      validateDocumentDates(
        metadataUpdate.validFrom !== undefined ? metadataUpdate.validFrom : attachment.validFrom,
        metadataUpdate.validUntil !== undefined ? metadataUpdate.validUntil : attachment.validUntil,
      );
    });

    const requestMeta = getRequestMeta(c);
    await prisma.$transaction(async (tx) => {
      await tx.attachment.updateMany({
        where: { tenantId, id: { in: attachments.map((attachment) => attachment.id) } },
        data,
      });

      await Promise.all(attachments.map((attachment) =>
        createAuditLog(tx, {
          tenantId,
          userId,
          module: 'attachments',
          entityType: attachment.entityType,
          entityId: attachment.entityId,
          action: AuditAction.UPDATE,
          oldValues: {
            attachmentId: attachment.id,
            fileName: attachment.fileName,
            category: attachment.category,
            tags: attachment.tags,
            documentKind: attachment.documentKind,
            confidentiality: attachment.confidentiality,
            validFrom: attachment.validFrom,
            validUntil: attachment.validUntil,
            version: attachment.version,
          },
          newValues: {
            attachmentId: attachment.id,
            bulkMetadataUpdate: true,
            ...metadata,
          },
          ...requestMeta,
        }),
      ));
    });

    return c.json({
      data: {
        updatedCount: attachments.length,
        skippedCount: ids.length - attachments.length,
      },
    });
  },

  async delete(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const attachment = await prisma.attachment.findFirst({ where: { id, tenantId } });
    if (!attachment) return c.json(new NotFoundError('Dosya', id).toJSON(), 404);
    await ensureEntityBelongsToTenant(tenantId, attachment.entityType, attachment.entityId);

    await storageService.delete(attachment.storagePath);

    await prisma.attachment.delete({ where: { id } });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'attachments',
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      action: AuditAction.DELETE,
      oldValues: { attachmentId: id, fileName: attachment.fileName, mimeType: attachment.mimeType, fileSize: attachment.fileSize },
      ...getRequestMeta(c),
    });

    return c.json({ data: { success: true } });
  },
};
