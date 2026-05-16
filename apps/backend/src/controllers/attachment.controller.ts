import { Context } from 'hono';
import { AuditAction, EntityType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { basename, extname, join, resolve } from 'path';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { requireTenantId, requireUserId } from '../utils/context.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';

const UPLOAD_DIR = resolve(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const LOCAL_UPLOADS_ALLOWED_IN_PRODUCTION = process.env.ALLOW_LOCAL_UPLOADS_IN_PRODUCTION === 'true';

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

function validateLocalStoragePolicy(): void {
  if (IS_PRODUCTION && !LOCAL_UPLOADS_ALLOWED_IN_PRODUCTION) {
    throw new ValidationError('Production ortamında local dosya yükleme kapalı. Object storage/AV entegrasyonu yapılandırılmalı.');
  }
}

async function ensureEntityBelongsToTenant(tenantId: string, entityType: EntityType, entityId: string): Promise<void> {
  const count = await countEntity(tenantId, entityType, entityId);
  if (count === 0) {
    throw new ValidationError('Ek dosya bağlanacak kayıt bu tenant içinde bulunamadı.');
  }
}

async function countEntity(tenantId: string, entityType: EntityType, entityId: string): Promise<number> {
  switch (entityType) {
    case EntityType.INVOICE:
      return prisma.invoice.count({ where: { id: entityId, tenantId } });
    case EntityType.PRODUCT:
      return prisma.product.count({ where: { id: entityId, tenantId } });
    case EntityType.CONTACT:
      return prisma.contact.count({ where: { id: entityId, tenantId } });
    case EntityType.EMPLOYEE:
      return prisma.employee.count({ where: { id: entityId, tenantId } });
    case EntityType.SERVICE_REQUEST:
      return prisma.serviceRequest.count({ where: { id: entityId, tenantId } });
    case EntityType.PURCHASE_ORDER:
      return prisma.purchaseOrder.count({ where: { id: entityId, tenantId } });
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

function validateFile(file: File): { safeName: string; extension: string; mimeType: string } {
  const safeName = sanitizeFileName(file.name);
  const extension = extname(safeName).toLowerCase();
  const mimeType = file.type || 'application/octet-stream';

  if (file.size <= 0) {
    throw new ValidationError('Boş dosya yüklenemez.');
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new ValidationError('Dosya boyutu 10MB sınırını aşamaz.');
  }
  if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new ValidationError('Bu dosya tipi desteklenmiyor.');
  }

  return { safeName, extension, mimeType };
}

export const AttachmentController = {
  async listByEntity(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const rawEntityType = c.req.query('entityType');
    const entityId = c.req.query('entityId');

    if (!rawEntityType || !isEntityType(rawEntityType) || !entityId) {
      return c.json(new ValidationError('Geçerli entityType ve entityId zorunludur.').toJSON(), 400);
    }

    await ensureEntityBelongsToTenant(tenantId, rawEntityType, entityId);

    const attachments = await prisma.attachment.findMany({
      where: { tenantId, entityType: rawEntityType, entityId },
      orderBy: { createdAt: 'desc' },
    });

    return c.json({ data: attachments });
  },

  async upload(c: Context): Promise<Response> {
    validateLocalStoragePolicy();

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
      return c.json(new ValidationError('Geçersiz entityType.').toJSON(), 400);
    }

    await ensureEntityBelongsToTenant(tenantId, rawEntityType, rawEntityId);
    const { safeName, extension, mimeType } = validateFile(fileValue);

    const tenantDir = resolve(UPLOAD_DIR, tenantId);
    if (!tenantDir.startsWith(UPLOAD_DIR)) {
      return c.json(new ValidationError('Geçersiz dosya yolu.').toJSON(), 400);
    }

    await mkdir(tenantDir, { recursive: true });

    const storageName = `${randomUUID()}${extension}`;
    const storagePath = resolve(tenantDir, storageName);
    if (!storagePath.startsWith(tenantDir)) {
      return c.json(new ValidationError('Geçersiz dosya yolu.').toJSON(), 400);
    }

    const buffer = Buffer.from(await fileValue.arrayBuffer());
    await writeFile(storagePath, buffer, { flag: 'wx' });

    const attachment = await prisma.attachment.create({
      data: {
        tenantId,
        entityType: rawEntityType,
        entityId: rawEntityId,
        fileName: safeName,
        storagePath: `uploads/${tenantId}/${storageName}`,
        mimeType,
        fileSize: fileValue.size,
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
      newValues: { attachmentId: attachment.id, fileName: safeName, mimeType, fileSize: fileValue.size },
      ...getRequestMeta(c),
    });

    return c.json({ data: attachment }, 201);
  },

  async download(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = c.req.param('id')!;

    const attachment = await prisma.attachment.findFirst({ where: { id, tenantId } });
    if (!attachment) return c.json(new NotFoundError('Dosya', id).toJSON(), 404);

    await ensureEntityBelongsToTenant(tenantId, attachment.entityType, attachment.entityId);

    const filePath = resolve(process.cwd(), attachment.storagePath);
    if (!filePath.startsWith(UPLOAD_DIR)) {
      return c.json(new ValidationError('Geçersiz dosya yolu.').toJSON(), 400);
    }

    try {
      const buffer = await readFile(filePath);
      return new Response(buffer, {
        headers: {
          'Content-Type': attachment.mimeType ?? 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${sanitizeFileName(attachment.fileName)}"`,
          'Content-Length': String(buffer.length),
        },
      });
    } catch {
      return c.json(new NotFoundError('Dosya', id).toJSON(), 404);
    }
  },

  async rename(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = c.req.param('id')!;

    const attachment = await prisma.attachment.findFirst({ where: { id, tenantId } });
    if (!attachment) return c.json(new NotFoundError('Dosya', id).toJSON(), 404);
    await ensureEntityBelongsToTenant(tenantId, attachment.entityType, attachment.entityId);

    const body = await c.req.json<unknown>().catch(() => null);
    const fileName = typeof body === 'object' && body !== null && 'fileName' in body && typeof body.fileName === 'string'
      ? sanitizeFileName(body.fileName.trim())
      : '';
    if (!fileName) {
      return c.json(new ValidationError('fileName zorunludur.').toJSON(), 400);
    }

    const updated = await prisma.attachment.update({
      where: { id },
      data: { fileName },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'attachments',
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      action: AuditAction.UPDATE,
      oldValues: { attachmentId: id, fileName: attachment.fileName },
      newValues: { attachmentId: id, fileName },
      ...getRequestMeta(c),
    });

    return c.json({ data: updated });
  },

  async delete(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = c.req.param('id')!;

    const attachment = await prisma.attachment.findFirst({ where: { id, tenantId } });
    if (!attachment) return c.json(new NotFoundError('Dosya', id).toJSON(), 404);
    await ensureEntityBelongsToTenant(tenantId, attachment.entityType, attachment.entityId);

    const filePath = resolve(process.cwd(), attachment.storagePath);
    if (filePath.startsWith(UPLOAD_DIR)) {
      try {
        await unlink(filePath);
      } catch {
        // File may already be deleted; DB ownership has already been verified.
      }
    }

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
