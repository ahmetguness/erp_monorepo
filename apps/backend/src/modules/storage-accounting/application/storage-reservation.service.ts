import {
  Prisma,
  StorageReservationSource,
  StorageReservationStatus,
  type PrismaClient,
  type StorageReservation,
} from "@prisma/client";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../errors/index.js";
import { assertRawQueryTenant } from "../../../lib/tenant-isolation-context.js";
import { StoragePlanResolver } from "../domain/storage-plan.js";
import { storageTransaction } from "./storage-transaction.js";
import type { StorageStep } from "./storage-transaction-telemetry.js";

const RESERVATION_TTL_MS = 30 * 60 * 1000;
export const STORAGE_CLEANUP_DELAY_MS = 60_000;
type Step = (value: StorageStep) => void;
interface Usage {
  usedBytes: bigint;
  reservedBytes: bigint;
}
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

export class StorageReservationService {
  private readonly plans: StoragePlanResolver;
  constructor(private readonly db: PrismaClient) {
    this.plans = new StoragePlanResolver(db);
  }

  private async lockUsage(
    tx: Prisma.TransactionClient,
    tenantId: string,
    step: Step,
    initialize = false,
  ): Promise<Usage> {
    assertRawQueryTenant(tenantId);
    if (initialize) {
      step("usage_init");
      await tx.$executeRaw`INSERT INTO tenant_storage_usage ("tenantId","updatedAt") VALUES (${tenantId},CURRENT_TIMESTAMP) ON CONFLICT ("tenantId") DO NOTHING`;
    }
    step("usage_lock");
    const [usage] = await tx.$queryRaw<
      Usage[]
    >`SELECT "usedBytes","reservedBytes" FROM tenant_storage_usage WHERE "tenantId"=${tenantId} FOR UPDATE`;
    if (!usage)
      throw new ConflictError("Depolama kullanım kaydı kilitlenemedi.");
    return usage;
  }
  private async lockReservation(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
    step: Step,
  ): Promise<StorageReservation> {
    step("reservation_read");
    await tx.$queryRaw`SELECT id FROM storage_reservations WHERE "tenantId"=${tenantId} AND id=${id} FOR UPDATE`;
    const row = await tx.storageReservation.findFirst({
      where: { tenantId, id },
    });
    if (!row) throw new NotFoundError("Yükleme rezervasyonu", id);
    return row;
  }
  async reserve(input: ReserveStorageInput): Promise<StorageReservationView> {
    assertRawQueryTenant(input.tenantId);
    const limits = await this.plans.resolve(input.tenantId);
    if (
      input.source === StorageReservationSource.CHAT_ATTACHMENT &&
      !limits.enabled
    )
      throw new ValidationError("Sohbet bu planda kullanılamıyor.");
    if (!Number.isSafeInteger(input.expectedBytes) || input.expectedBytes <= 0)
      throw new ValidationError("Dosya boyutu geçersiz.");
    if (
      input.source === StorageReservationSource.CHAT_ATTACHMENT &&
      input.expectedBytes > limits.chatFileMaxBytes
    )
      throw new ValidationError(
        `Dosya boyutu plan limitini aşıyor (${limits.chatFileMaxBytes} byte).`,
      );
    const expectedBytes = BigInt(input.expectedBytes);
    return storageTransaction(this.db, "reserve", async (tx, step) => {
      const usage = await this.lockUsage(tx, input.tenantId, step, true);
      if (
        usage.usedBytes + usage.reservedBytes + expectedBytes >
        limits.storageLimitBytes
      )
        throw new ConflictError("Ortak depolama kotası doldu.");
      step("usage_update");
      await tx.tenantStorageUsage.update({
        where: { tenantId: input.tenantId },
        data: {
          reservedBytes: { increment: expectedBytes },
          version: { increment: 1 },
        },
      });
      step("reservation_write");
      const row = await tx.storageReservation.create({
        data: {
          tenantId: input.tenantId,
          source: input.source,
          objectKey: input.objectKey,
          originalName: input.originalName,
          contentType: input.contentType,
          createdById: input.createdById,
          expectedBytes,
          expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
        },
        select: {
          id: true,
          objectKey: true,
          expiresAt: true,
          expectedBytes: true,
        },
      });
      return { ...row, expectedBytes: Number(row.expectedBytes) };
    });
  }
  async markUploaded(tenantId: string, reservationId: string): Promise<void> {
    const result = await this.db.storageReservation.updateMany({
      where: {
        id: reservationId,
        tenantId,
        status: "RESERVED",
        expiresAt: { gt: new Date() },
      },
      data: { status: "UPLOADED", uploadedAt: new Date() },
    });
    if (result.count !== 1)
      throw new NotFoundError("Aktif yükleme rezervasyonu", reservationId);
  }
  private async finalize(
    tx: Prisma.TransactionClient,
    row: StorageReservation,
    resourceId: string,
    step: Step,
  ): Promise<void> {
    step("usage_update");
    const updated = await tx.tenantStorageUsage.updateMany({
      where: {
        tenantId: row.tenantId,
        reservedBytes: { gte: row.expectedBytes },
      },
      data: {
        reservedBytes: { decrement: row.expectedBytes },
        usedBytes: { increment: row.expectedBytes },
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1)
      throw new ConflictError("Depolama rezervasyonu sayacı tutarsız.");
    step("reservation_write");
    await tx.storageReservation.update({
      where: { id: row.id, tenantId: row.tenantId },
      data: {
        status: "COMMITTED",
        resourceId,
        uploadedAt: row.uploadedAt ?? new Date(),
        finalizedAt: new Date(),
        cleanupAfter: null,
      },
    });
    step("traffic");
    await this.traffic(tx, row.tenantId, "upload", row.expectedBytes);
  }
  /** ERP metadata and accounting become visible together, after provider IO completes. */
  async commitObject<T>(
    tenantId: string,
    reservationId: string,
    persist: (tx: Prisma.TransactionClient) => Promise<T>,
    resourceId: (value: T) => string,
  ): Promise<T> {
    return storageTransaction(this.db, "commit", async (tx, step) => {
      await this.lockUsage(tx, tenantId, step);
      const row = await this.lockReservation(tx, tenantId, reservationId, step);
      if (
        row.source !== "ERP_ATTACHMENT" ||
        row.status !== "RESERVED" ||
        row.expiresAt <= new Date()
      )
        throw new ConflictError("Aktif dosya rezervasyonu bulunamadı.");
      step("metadata");
      const metadata = await persist(tx);
      await this.finalize(tx, row, resourceId(metadata), step);
      return metadata;
    });
  }
  /** Callback contains DB writes only. A repeated finalization has no second byte/traffic effect. */
  async commit(
    tenantId: string,
    reservationId: string,
    resourceId: string,
    persist?: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<boolean> {
    return storageTransaction(this.db, "commit", async (tx, step) => {
      await this.lockUsage(tx, tenantId, step);
      const row = await this.lockReservation(tx, tenantId, reservationId, step);
      if (row.status === "COMMITTED") {
        if (row.resourceId !== resourceId)
          throw new ConflictError("Rezervasyon farklı bir dosyaya bağlandı.");
        return false;
      }
      if (row.status !== "SCANNING")
        throw new NotFoundError("Tarama rezervasyonu", reservationId);
      if (persist) {
        step("metadata");
        await persist(tx);
      }
      await this.finalize(tx, row, resourceId, step);
      return true;
    });
  }
  async release(
    tenantId: string,
    reservationId: string,
    status: "REJECTED" | "EXPIRED" | "CANCELLED",
    reason?: string,
  ): Promise<boolean> {
    assertRawQueryTenant(tenantId);
    const candidate = await this.db.storageReservation.findFirst({where:{id:reservationId,tenantId},select:{status:true}});
    if (!candidate || !(['RESERVED','UPLOADED','SCANNING'] as StorageReservationStatus[]).includes(candidate.status)) return false;
    return storageTransaction(this.db, "release", async (tx, step) => {
      await this.lockUsage(tx, tenantId, step);
      const row = await this.lockReservation(tx, tenantId, reservationId, step);
      if (
        !(
          ["RESERVED", "UPLOADED", "SCANNING"] as StorageReservationStatus[]
        ).includes(row.status)
      )
        return false;
      step("usage_update");
      const updated = await tx.tenantStorageUsage.updateMany({
        where: { tenantId, reservedBytes: { gte: row.expectedBytes } },
        data: {
          reservedBytes: { decrement: row.expectedBytes },
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1)
        throw new ConflictError("Depolama rezervasyonu sayacı tutarsız.");
      // Pre-upgrade ERP metadata could exist before accounting. Remove only this reservation's object.
      if (row.source === "ERP_ATTACHMENT" && row.resourceId) {
        step("metadata");
        await tx.attachment.deleteMany({
          where: { id: row.resourceId, tenantId, storagePath: row.objectKey },
        });
      }
      step("reservation_write");
      await tx.storageReservation.update({
        where: { id: row.id, tenantId },
        data: {
          status,
          failureReason: reason,
          finalizedAt: new Date(),
          cleanupAfter: new Date(Date.now() + STORAGE_CLEANUP_DELAY_MS),
        },
      });
      return true;
    });
  }
  private async traffic(
    tx: Prisma.TransactionClient,
    tenantId: string,
    direction: "upload" | "download",
    amount: bigint,
  ): Promise<void> {
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    await tx.storageTrafficDaily.upsert({
      where: { tenantId_day: { tenantId, day } },
      create: {
        tenantId,
        day,
        ...(direction === "upload"
          ? { uploadedBytes: amount, uploadCount: 1 }
          : { downloadedBytes: amount, downloadCount: 1 }),
      },
      update:
        direction === "upload"
          ? {
              uploadedBytes: { increment: amount },
              uploadCount: { increment: 1 },
            }
          : {
              downloadedBytes: { increment: amount },
              downloadCount: { increment: 1 },
            },
    });
  }
  async recordTraffic(
    tenantId: string,
    direction: "upload" | "download",
    bytes: number,
  ): Promise<void> {
    await this.traffic(this.db, tenantId, direction, BigInt(bytes));
  }
  async releaseUsedBytes(tenantId: string, bytes: number): Promise<void> {
    assertRawQueryTenant(tenantId);
    if (!Number.isSafeInteger(bytes) || bytes <= 0) return;
    await this.db
      .$executeRaw`UPDATE tenant_storage_usage SET "usedBytes"=GREATEST(0,"usedBytes"-${BigInt(bytes)}),version=version+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "tenantId"=${tenantId}`;
  }
}
