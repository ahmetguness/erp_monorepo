import type { Context } from 'hono';
import { z } from 'zod';
import { NotFoundError, ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { storageService } from '../../../../services/storage.service.js';
import { requireParam, requireTenantId, requireUserId } from '../../../../utils/context.js';
import { ChatUploadService } from '../application/chat-upload.service.js';
import { StorageReservationService } from '../../../storage-accounting/index.js';
import { parseBody } from './chat.schemas.js';

const uploadService = new ChatUploadService(prisma, storageService);
const storageAccounting = new StorageReservationService(prisma);
const reservationSchema = z.object({
  originalName: z.string().min(1).max(255),
  contentType: z.string().min(1).max(160),
  sizeBytes: z.number().int().positive(),
}).strict();

async function requireAttachmentAccess(tenantId: string, userId: string, attachmentId: string) {
  const attachment = await prisma.chatAttachment.findFirst({
    where: {
      tenantId, id: attachmentId, status: 'READY', deletedAt: null,
      OR: [
        { uploaderId: userId, messageId: null },
        { message: { conversation: { members: { some: { userId, leftAt: null } } } } },
      ],
    },
    include: { message: { select: { createdAt: true, conversation: { select: { members: { where: { userId, leftAt: null }, select: { visibleFrom: true, clearedAt: true } } } } } } },
  });
  const membership = attachment?.message?.conversation.members[0];
  const visibleFrom = membership?.clearedAt && membership.clearedAt > membership.visibleFrom ? membership.clearedAt : membership?.visibleFrom;
  if (!attachment || (attachment.message && (!visibleFrom || attachment.message.createdAt < visibleFrom))) throw new NotFoundError('Sohbet dosyası', attachmentId);
  return attachment;
}

export const ChatUploadController = {
  async reserve(c: Context): Promise<Response> {
    const body = parseBody(reservationSchema, await c.req.json<unknown>());
    const data = await uploadService.createTicket({ tenantId: requireTenantId(c), userId: requireUserId(c), ...body });
    return c.json({ data }, 201);
  },
  async uploadContent(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c); const userId = requireUserId(c); const reservationId = requireParam(c, 'reservationId');
    const expected = await uploadService.expectedProxyUpload(tenantId, userId, reservationId);
    const declaredLength = Number(c.req.header('Content-Length'));
    if (Number.isFinite(declaredLength) && declaredLength !== expected.sizeBytes) throw new ValidationError('Content-Length rezervasyonla eşleşmiyor.');
    const contentType = c.req.header('Content-Type')?.split(';')[0]?.trim() ?? '';
    if (contentType !== expected.contentType) throw new ValidationError('Content-Type rezervasyonla eşleşmiyor.');
    const body = Buffer.from(await c.req.arrayBuffer());
    await uploadService.uploadProxy(tenantId, userId, reservationId, body, contentType);
    return c.json({ data: { accepted: true } }, 202);
  },
  async complete(c: Context): Promise<Response> {
    await uploadService.complete(requireTenantId(c), requireUserId(c), requireParam(c, 'reservationId'));
    return c.json({ data: { accepted: true } }, 202);
  },
  async status(c: Context): Promise<Response> {
    return c.json({ data: await uploadService.status(requireTenantId(c), requireUserId(c), requireParam(c, 'reservationId')) });
  },
  async url(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const attachment = await requireAttachmentAccess(tenantId, requireUserId(c), requireParam(c, 'attachmentId'));
    const signed = await storageService.createSignedGetUrl(attachment.storageKey, 300);
    if (signed) await storageAccounting.recordTraffic(tenantId, 'download', attachment.sizeBytes);
    return c.json({ data: signed ? { url: signed.url, expiresAt: signed.expiresAt.toISOString() } : { url: `/api/chat/attachments/${attachment.id}/download`, expiresAt: new Date(Date.now() + 300_000).toISOString() } });
  },
  async download(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const attachment = await requireAttachmentAccess(tenantId, requireUserId(c), requireParam(c, 'attachmentId'));
    const object = await storageService.get(attachment.storageKey);
    if (!object) throw new NotFoundError('Dosya içeriği', attachment.id);
    await storageAccounting.recordTraffic(tenantId, 'download', object.contentLength);
    return new Response(new Uint8Array(object.body), { headers: {
      'Content-Type': object.contentType, 'Content-Length': String(object.contentLength),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(attachment.safeDisplayName)}`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  },
};
