import { Prisma, StorageReservationSource, StorageReservationStatus, type PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '../../../errors/index.js';
import { StoragePlanResolver } from '../domain/storage-plan.js';

const RESERVATION_TTL_MS = 30 * 60 * 1_000;

export interface ReserveStorageInput {
  tenantId: string;
  source: StorageReservationSource;
  objectKey: string;
  originalName: string;
  contentType: string;
  createdById: string;
  expectedBytes: number;
}

export interface StorageReservationView {
  id: string;
  objectKey: string;
  expiresAt: Date;
  expectedBytes: number;
}

interface LockedUsageRow { usedBytes: bigint; reservedBytes: bigint }

async function serializableTransaction<T>(
  db: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
      if (!retryable || attempt === 2) throw error;
    }
  }
  throw new ConflictError('Depolama işlemi eşzamanlı güncelleme nedeniyle tamamlanamadı.');
}

export class StorageReservationService {
  private readonly plans: StoragePlanResolver;

  constructor(private readonly db: PrismaClient) {
    this.plans = new StoragePlanResolver(db);
  }

  async reserve(input: ReserveStorageInput): Promise<StorageReservationView> {
    const limits = await this.plans.resolve(input.tenantId);
    if (input.source === StorageReservationSource.CHAT_ATTACHMENT && !limits.enabled) throw new ValidationError('Sohbet bu planda kullanılamıyor.');
    if (!Number.isSafeInteger(input.expectedBytes) || input.expectedBytes <= 0) throw new ValidationError('Dosya boyutu geçersiz.');
    if (input.source === StorageReservationSource.CHAT_ATTACHMENT && input.expectedBytes > limits.chatFileMaxBytes) {
      throw new ValidationError(`Dosya boyutu plan limitini aşıyor (${limits.chatFileMaxBytes} byte).`);
    }
    const expectedBytes = BigInt(input.expectedBytes);
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

    return serializableTransaction(this.db, async (tx) => {
      await tx.tenantStorageUsage.upsert({
        where: { tenantId: input.tenantId },
        create: { tenantId: input.tenantId },
        update: {},
      });
      const rows = await tx.$queryRaw<LockedUsageRow[]>(Prisma.sql`
        SELECT "usedBytes", "reservedBytes"
        FROM "tenant_storage_usage"
        WHERE "tenantId" = ${input.tenantId}
        FOR UPDATE
      `);
      const usage = rows[0];
      if (!usage) throw new ConflictError('Depolama kullanım kaydı kilitlenemedi.');
      if (usage.usedBytes + usage.reservedBytes + expectedBytes > limits.storageLimitBytes) {
        throw new ConflictError('Ortak depolama kotası doldu.');
      }
      await tx.tenantStorageUsage.update({
        where: { tenantId: input.tenantId },
        data: { reservedBytes: { increment: expectedBytes }, version: { increment: 1 } },
      });
      const reservation = await tx.storageReservation.create({
        data: { ...input, expectedBytes, expiresAt },
        select: { id: true, objectKey: true, expiresAt: true, expectedBytes: true },
      });
      return { ...reservation, expectedBytes: Number(reservation.expectedBytes) };
    });
  }

  async markUploaded(tenantId: string, reservationId: string): Promise<void> {
    const result = await this.db.storageReservation.updateMany({
      where: { id: reservationId, tenantId, status: StorageReservationStatus.RESERVED, expiresAt: { gt: new Date() } },
      data: { status: StorageReservationStatus.UPLOADED, uploadedAt: new Date() },
    });
    if (result.count !== 1) throw new NotFoundError('Aktif yükleme rezervasyonu', reservationId);
  }

  async commit(tenantId: string, reservationId: string, resourceId: string): Promise<void> {
    await serializableTransaction(this.db, async (tx) => {
      const reservation = await tx.storageReservation.findFirst({
        where: { id: reservationId, tenantId, status: StorageReservationStatus.SCANNING },
      });
      if (!reservation) throw new NotFoundError('Tarama rezervasyonu', reservationId);
      await tx.tenantStorageUsage.update({
        where: { tenantId },
        data: {
          reservedBytes: { decrement: reservation.expectedBytes },
          usedBytes: { increment: reservation.expectedBytes },
          version: { increment: 1 },
        },
      });
      await tx.storageReservation.update({
        where: { id: reservation.id },
        data: { status: StorageReservationStatus.COMMITTED, resourceId, finalizedAt: new Date() },
      });
    });
  }

  async release(tenantId: string, reservationId: string, status: 'REJECTED' | 'EXPIRED' | 'CANCELLED', reason?: string): Promise<boolean> {
    return serializableTransaction(this.db, async (tx) => {
      const reservation = await tx.storageReservation.findFirst({
        where: { id: reservationId, tenantId, status: { in: [StorageReservationStatus.RESERVED, StorageReservationStatus.UPLOADED, StorageReservationStatus.SCANNING] } },
      });
      if (!reservation) return false;
      await tx.tenantStorageUsage.update({
        where: { tenantId },
        data: { reservedBytes: { decrement: reservation.expectedBytes }, version: { increment: 1 } },
      });
      await tx.storageReservation.update({
        where: { id: reservation.id },
        data: { status, failureReason: reason, finalizedAt: new Date() },
      });
      return true;
    });
  }

  async recordTraffic(tenantId: string, direction: 'upload' | 'download', bytes: number): Promise<void> {
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    const amount = BigInt(bytes);
    await this.db.storageTrafficDaily.upsert({
      where: { tenantId_day: { tenantId, day } },
      create: { tenantId, day, ...(direction === 'upload' ? { uploadedBytes: amount, uploadCount: 1 } : { downloadedBytes: amount, downloadCount: 1 }) },
      update: direction === 'upload' ? { uploadedBytes: { increment: amount }, uploadCount: { increment: 1 } } : { downloadedBytes: { increment: amount }, downloadCount: { increment: 1 } },
    });
  }

  async releaseUsedBytes(tenantId: string, bytes: number): Promise<void> {
    if (!Number.isSafeInteger(bytes) || bytes <= 0) return;
    const amount = BigInt(bytes);
    await this.db.$executeRaw(Prisma.sql`
      UPDATE "tenant_storage_usage"
      SET "usedBytes" = GREATEST(0, "usedBytes" - ${amount}),
          "version" = "version" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "tenantId" = ${tenantId}
    `);
  }
}
