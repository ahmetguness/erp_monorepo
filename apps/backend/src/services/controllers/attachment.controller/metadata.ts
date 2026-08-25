import { Context } from 'hono';
import { AuditAction, EntityType, PermissionAction, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { basename, extname } from 'path';
import { prisma } from '../../../lib/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../errors';
import { requireTenantId, requireUserId, requireParam } from '../../../utils/context.js';
import { createAuditLog, getRequestMeta } from '../../../utils/audit.js';
import { bufferToArrayBuffer, storageService } from '../../storage.service.js';
import {
  DocumentCenterService,
  type DocumentCenterCategory,
  type DocumentConfidentiality,
  type DocumentKind,
  parseDocumentCenterCategory,
  parseDocumentCenterSource,
  parseDocumentConfidentiality,
  parseDocumentKind,
} from '../../document-center.service.js';
import { MAX_FILE_SIZE, ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS, ENTITY_TYPES, isEntityType, sanitizeFileName, sanitizeTag, readFormString, parseTagList, parseDateField, parsePositiveVersion, readRecord, isRecord, readBodyString, readStringArray, readStringArrayRequired, parseCategoryInput, parseKindInput, parseConfidentialityInput, validateDocumentDates, parseAttachmentMetadataUpdate, ensureEntityBelongsToTenant, canAccessConfidentialDocuments, ensureAttachmentConfidentialityAccess, countEntity, findEntityOptions, validateFile, getAttachmentIdFromAuditValues } from './shared.js';
import type { AttachmentMetadataUpdate, EntityOption } from './shared.js';

export const metadataAttachmentController = {
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
} as const;
