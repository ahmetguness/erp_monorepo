import { AuditAction } from '@prisma/client';
import { Context } from 'hono';
import { NotFoundError,ValidationError } from '../../../../../errors/index.js';
import { prisma } from '../../../../../lib/prisma.js';
import {
DocumentCenterService,
parseDocumentCenterCategory,
parseDocumentCenterSource
} from '../../../../../services/document-center.service.js';
import { bufferToArrayBuffer,storageService } from '../../../../../services/storage.service.js';
import { createAuditLog,getRequestMeta } from '../../../../../utils/audit.js';
import { requireParam,requireTenantId,requireUserId } from '../../../../../utils/context.js';
import { canAccessConfidentialDocuments,ensureAttachmentConfidentialityAccess,ensureEntityBelongsToTenant,findEntityOptions,getAttachmentIdFromAuditValues,isEntityType,sanitizeFileName } from './shared.js';

export const queryAttachmentController = {
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
  async signedDownloadUrl(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');
    const attachment = await prisma.attachment.findFirst({ where: { id, tenantId } });
    if (!attachment) return c.json(new NotFoundError('Dosya', id).toJSON(), 404);
    await ensureEntityBelongsToTenant(tenantId, attachment.entityType, attachment.entityId);
    await ensureAttachmentConfidentialityAccess(tenantId, userId, attachment.confidentiality);

    const configuredTtl = Number.parseInt(process.env.STORAGE_SIGNED_URL_TTL_SECONDS ?? '300', 10);
    const expiresInSeconds = Number.isFinite(configuredTtl) ? Math.min(3_600, Math.max(30, configuredTtl)) : 300;
    const signed = await storageService.createSignedGetUrl(attachment.storagePath, expiresInSeconds);
    const expiresAt = signed?.expiresAt ?? new Date(Date.now() + expiresInSeconds * 1_000);
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'attachments',
      entityType: attachment.entityType,
      entityId: attachment.entityId,
      action: AuditAction.OTHER,
      newValues: { attachmentId: attachment.id, signedDownloadIssued: Boolean(signed), expiresAt },
      ...getRequestMeta(c),
    });
    return c.json({
      data: {
        url: signed?.url ?? `/api/attachments/${encodeURIComponent(id)}/download`,
        direct: Boolean(signed),
        expiresAt: expiresAt.toISOString(),
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
} as const;
