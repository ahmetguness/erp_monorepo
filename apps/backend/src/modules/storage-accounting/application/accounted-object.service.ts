import type { PrismaClient, Prisma } from "@prisma/client";
import { logger } from "../../../lib/logger.js";
import type { ObjectStorage, StoredObjectInput } from "../../shared/index.js";
import { StorageReservationService } from "./storage-reservation.service.js";

export interface StoreAccountedObjectInput<T> {
  tenantId: string;
  userId: string;
  source: 'ERP_ATTACHMENT';
  object: StoredObjectInput;
  originalName: string;
  persistMetadata: (tx: Prisma.TransactionClient) => Promise<T>;
  resourceId: (value: T) => string;
}

export class AccountedObjectService {
  private readonly reservations: StorageReservationService;

  constructor(
    private readonly db: PrismaClient,
    private readonly storage: ObjectStorage,
  ) {
    this.reservations = new StorageReservationService(db);
  }

  async store<T>(input: StoreAccountedObjectInput<T>): Promise<T> {
    let persistedMetadata: { value: T } | undefined;
    const reservation = await this.reservations.reserve({
      tenantId: input.tenantId,
      source: input.source,
      objectKey: input.object.key,
      originalName: input.originalName,
      contentType: input.object.contentType,
      createdById: input.userId,
      expectedBytes: input.object.body.byteLength,
    });
    try {
      await this.storage.put(input.object);
      return await this.reservations.commitObject(
        input.tenantId,
        reservation.id,
        async (tx) => {
          const value = await input.persistMetadata(tx);
          persistedMetadata = { value };
          return value;
        },
        input.resourceId,
      );
    } catch (error) {
      try {
        const released = await this.reservations.release(
          input.tenantId,
          reservation.id,
          "CANCELLED",
          "Object persistence failed",
        );
        if (released) {
          // The durable cleanup marker remains even after an immediate best-effort delete.
          try {
            await this.storage.delete(input.object.key);
          } catch {
            logger.warn(
              "[StorageCleanup] Immediate object deletion deferred to recovery",
            );
          }
        } else {
          const committed = await this.db.storageReservation.findFirst({
            where: {
              id: reservation.id,
              tenantId: input.tenantId,
              status: "COMMITTED",
            },
          });
          if (
            committed &&
            persistedMetadata &&
            committed.resourceId === input.resourceId(persistedMetadata.value)
          )
            return persistedMetadata.value;
        }
      } catch {
        // Commit outcome may be unknown. Never delete a potentially committed object.
        logger.warn(
          "[StorageCleanup] Cleanup deferred; durable reservation retained",
        );
      }
      throw error;
    }
  }
}
