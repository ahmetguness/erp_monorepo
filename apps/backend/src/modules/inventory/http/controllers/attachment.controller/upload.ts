import { Context } from 'hono';
import { AuditAction, EntityType, PermissionAction, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { basename, extname } from 'path';
import { prisma } from '../../../../../lib/prisma.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../../../errors/index.js';
import { requireTenantId, requireUserId, requireParam } from '../../../../../utils/context.js';
import { createAuditLog, getRequestMeta } from '../../../../../utils/audit.js';
import { bufferToArrayBuffer, storageService } from '../../../../../services/storage.service.js';
import {
  DocumentCenterService,
  type DocumentCenterCategory,
  type DocumentConfidentiality,
  type DocumentKind,
  parseDocumentCenterCategory,
  parseDocumentCenterSource,
  parseDocumentConfidentiality,
  parseDocumentKind,
} from '../../../../../services/document-center.service.js';
import { MAX_FILE_SIZE, ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS, ENTITY_TYPES, isEntityType, sanitizeFileName, sanitizeTag, readFormString, parseTagList, parseDateField, parsePositiveVersion, readRecord, isRecord, readBodyString, readStringArray, readStringArrayRequired, parseCategoryInput, parseKindInput, parseConfidentialityInput, validateDocumentDates, parseAttachmentMetadataUpdate, ensureEntityBelongsToTenant, canAccessConfidentialDocuments, ensureAttachmentConfidentialityAccess, countEntity, findEntityOptions, validateFile, getAttachmentIdFromAuditValues } from './shared.js';
import type { AttachmentMetadataUpdate, EntityOption } from './shared.js';

export const uploadAttachmentController = {
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
} as const;
