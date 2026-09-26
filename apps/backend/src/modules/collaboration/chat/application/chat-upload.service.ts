import { randomUUID } from 'node:crypto';
import { ChatAttachmentStatus, StorageReservationSource, type PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '../../../../errors/index.js';
import type { ObjectStorage } from '../../../shared/index.js';
import { StorageReservationService } from '../../../storage-accounting/index.js';
import { chatAttachmentKind, chatFileExtension, normalizeChatFileName, validateChatMimeType } from '../domain/chat-file.policy.js';

export interface CreateChatUploadInput {
  tenantId: string;
  userId: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}

export interface ChatUploadTicket {
  reservationId: string;
  attachmentId: string;
  expiresAt: string;
  upload: { method: 'PUT'; url: string; headers: Record<string, string>; direct: boolean };
}

export class ChatUploadService {
  private readonly reservations: StorageReservationService;

  constructor(private readonly db: PrismaClient, private readonly storage: ObjectStorage) {
    this.reservations = new StorageReservationService(db);
  }

  async createTicket(input: CreateChatUploadInput): Promise<ChatUploadTicket> {
    validateChatMimeType(input.contentType);
    const originalName = normalizeChatFileName(input.originalName);
    const attachmentId = randomUUID();
    const objectKey = `${input.tenantId}/chat/${attachmentId}${chatFileExtension(originalName)}`;
    const reservation = await this.reservations.reserve({
      tenantId: input.tenantId,
      source: StorageReservationSource.CHAT_ATTACHMENT,
      objectKey,
      originalName,
      contentType: input.contentType,
      createdById: input.userId,
      expectedBytes: input.sizeBytes,
    });
    try {
      await this.db.$transaction([
        this.db.chatAttachment.create({
          data: {
            id: attachmentId, tenantId: input.tenantId, uploaderId: input.userId,
            storageKey: objectKey, originalName, safeDisplayName: originalName,
            mimeType: input.contentType, sizeBytes: input.sizeBytes,
            kind: chatAttachmentKind(input.contentType), status: ChatAttachmentStatus.PENDING_UPLOAD,
            expiresAt: reservation.expiresAt,
          },
        }),
        this.db.storageReservation.update({
          where: { id: reservation.id, tenantId: input.tenantId },
          data: { resourceId: attachmentId },
        }),
      ]);
    } catch (error) {
      await this.reservations.release(input.tenantId, reservation.id, 'CANCELLED', 'Metadata creation failed');
      throw error;
    }
    const signed = await this.storage.createSignedPutUrl(objectKey, input.contentType, 15 * 60);
    return {
      reservationId: reservation.id,
      attachmentId,
      expiresAt: reservation.expiresAt.toISOString(),
      upload: signed
        ? { method: 'PUT', url: signed.url, headers: { 'Content-Type': input.contentType }, direct: true }
        : { method: 'PUT', url: `/api/chat/uploads/${reservation.id}/content`, headers: { 'Content-Type': input.contentType }, direct: false },
    };
  }

  async uploadProxy(tenantId: string, userId: string, reservationId: string, body: Buffer, contentType: string): Promise<void> {
    if (this.storage.driver !== 'local') throw new ValidationError('Proxy upload yalnızca local storage için kullanılabilir.');
    const reservation = await this.requireOwnedReservation(tenantId, userId, reservationId, 'RESERVED');
    if (body.byteLength !== Number(reservation.expectedBytes)) throw new ValidationError('Yüklenen dosya boyutu rezervasyonla eşleşmiyor.');
    if (contentType !== reservation.contentType) throw new ValidationError('Yüklenen dosyanın MIME tipi rezervasyonla eşleşmiyor.');
    await this.storage.put({ key: reservation.objectKey, body, contentType });
    await this.reservations.markUploaded(tenantId, reservationId);
  }

  async expectedProxyUpload(tenantId: string, userId: string, reservationId: string): Promise<{ sizeBytes: number; contentType: string }> {
    const reservation = await this.requireOwnedReservation(tenantId, userId, reservationId, 'RESERVED');
    return { sizeBytes: Number(reservation.expectedBytes), contentType: reservation.contentType };
  }

  async complete(tenantId: string, userId: string, reservationId: string): Promise<void> {
    const reservation = await this.requireOwnedReservation(tenantId, userId, reservationId, 'RESERVED');
    if (this.storage.driver === 'local') throw new ValidationError('Local upload içerik endpoint’i üzerinden tamamlanmalıdır.');
    await this.reservations.markUploaded(tenantId, reservation.id);
  }

  async status(tenantId: string, userId: string, reservationId: string) {
    const reservation = await this.db.storageReservation.findFirst({
      where: { id: reservationId, tenantId, createdById: userId },
      select: { status: true, resourceId: true, failureReason: true },
    });
    if (!reservation) throw new NotFoundError('Dosya yüklemesi', reservationId);
    const attachment = reservation.resourceId ? await this.db.chatAttachment.findFirst({
      where: { id: reservation.resourceId, tenantId },
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true, kind: true, status: true },
    }) : null;
    return { reservationStatus: reservation.status, failureReason: reservation.failureReason, attachment };
  }

  private async requireOwnedReservation(tenantId: string, userId: string, reservationId: string, status: 'RESERVED') {
    const reservation = await this.db.storageReservation.findFirst({
      where: { id: reservationId, tenantId, createdById: userId, status, expiresAt: { gt: new Date() } },
    });
    if (!reservation) throw new NotFoundError('Aktif yükleme rezervasyonu', reservationId);
    return reservation;
  }
}
