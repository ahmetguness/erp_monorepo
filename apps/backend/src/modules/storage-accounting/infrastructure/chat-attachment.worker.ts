import { createHash } from 'node:crypto';
import { ChatAttachmentStatus, Prisma, StorageReservationStatus } from '@prisma/client';
import { prisma } from '../../../lib/prisma.js';
import { runWithTenantIsolationBypass, runWithTenantScope } from '../../../lib/tenant-isolation-context.js';
import { logger } from '../../../lib/logger.js';
import { storageService } from '../../../services/storage.service.js';
import { enforceFileSecurity, WorkerLoop } from '../../shared/index.js';
import { StorageReservationService } from '../application/storage-reservation.service.js';

const accounting = new StorageReservationService(prisma);
const loop = new WorkerLoop('ChatAttachmentWorker', 5_000, processBatch);

async function claimOne() {
  return runWithTenantIsolationBypass('storage-reservation-worker-claim', async () => {
    const candidate = await prisma.storageReservation.findFirst({
      where: {
        source: 'CHAT_ATTACHMENT',
        OR: [
          { status: StorageReservationStatus.UPLOADED },
          { status: StorageReservationStatus.SCANNING, updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } },
        ],
      },
      orderBy: { uploadedAt: 'asc' },
    });
    if (!candidate) return null;
    const claimed = await prisma.storageReservation.updateMany({
      where: { id: candidate.id, tenantId: candidate.tenantId, status: candidate.status, updatedAt: candidate.updatedAt },
      data: { status: StorageReservationStatus.SCANNING },
    });
    return claimed.count === 1 ? candidate : null;
  });
}

async function processReservation(reservation: NonNullable<Awaited<ReturnType<typeof claimOne>>>): Promise<void> {
  await runWithTenantScope(reservation.tenantId, async () => {
    const attachmentId = reservation.resourceId;
    if (!attachmentId) throw new Error('Chat upload reservation has no attachment resource.');
    try {
      await prisma.chatAttachment.update({
        where: { id: attachmentId, tenantId: reservation.tenantId },
        data: { status: ChatAttachmentStatus.SCANNING },
      });
      const object = await storageService.get(reservation.objectKey);
      if (!object) throw new Error('Uploaded object was not found.');
      if (BigInt(object.contentLength) !== reservation.expectedBytes) throw new Error('Uploaded object size does not match reservation.');
      if (storageService.driver !== 'local' && object.contentType.split(';')[0]?.trim() !== reservation.contentType) throw new Error('Uploaded object MIME type does not match reservation.');
      await enforceFileSecurity({ body: object.body, fileName: reservation.originalName, contentType: reservation.contentType });
      const sha256 = createHash('sha256').update(object.body).digest('hex');
      await prisma.$transaction(async (tx) => {
        const current = await tx.storageReservation.findFirst({
          where: { id: reservation.id, tenantId: reservation.tenantId, status: StorageReservationStatus.SCANNING },
        });
        if (!current) return;
        await tx.chatAttachment.update({
          where: { id: attachmentId, tenantId: reservation.tenantId },
          data: { status: ChatAttachmentStatus.READY, sha256, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000) },
        });
        await tx.tenantStorageUsage.update({
          where: { tenantId: reservation.tenantId },
          data: { reservedBytes: { decrement: current.expectedBytes }, usedBytes: { increment: current.expectedBytes }, version: { increment: 1 } },
        });
        await tx.storageReservation.update({
          where: { id: current.id },
          data: { status: StorageReservationStatus.COMMITTED, finalizedAt: new Date() },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      await accounting.recordTraffic(reservation.tenantId, 'upload', Number(reservation.expectedBytes));
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 500) : 'Unknown scan failure';
      await prisma.chatAttachment.updateMany({
        where: { id: attachmentId, tenantId: reservation.tenantId },
        data: { status: ChatAttachmentStatus.REJECTED, rejectionReason: reason },
      });
      await accounting.release(reservation.tenantId, reservation.id, 'REJECTED', reason);
      await storageService.delete(reservation.objectKey).catch(() => undefined);
      logger.warn('[ChatAttachmentWorker] Upload rejected', { reservationId: reservation.id, tenantId: reservation.tenantId, reason });
    }
  });
}

async function expireReservations(): Promise<void> {
  const expired = await runWithTenantIsolationBypass('storage-reservation-worker-expiry', async () => {
    return await prisma.storageReservation.findMany({
      where: { status: { in: [StorageReservationStatus.RESERVED, StorageReservationStatus.UPLOADED] }, expiresAt: { lte: new Date() } },
      take: 25,
      orderBy: { expiresAt: 'asc' },
    });
  });
  for (const reservation of expired) {
    await runWithTenantScope(reservation.tenantId, async () => {
      const released = await accounting.release(reservation.tenantId, reservation.id, 'EXPIRED', 'Upload reservation expired');
      if (!released) return;
      if (reservation.resourceId) await prisma.chatAttachment.updateMany({
        where: { id: reservation.resourceId, tenantId: reservation.tenantId },
        data: { status: ChatAttachmentStatus.EXPIRED, expiresAt: new Date() },
      });
      await storageService.delete(reservation.objectKey).catch(() => undefined);
    });
  }
}

async function processBatch(): Promise<void> {
  await expireReservations();
  for (let index = 0; index < 5; index += 1) {
    const reservation = await claimOne();
    if (!reservation) break;
    await processReservation(reservation);
  }
}

export const ChatAttachmentWorker = {
  start(): void { loop.start(); },
  stop(): Promise<void> { return loop.stop(); },
  processBatch,
};
