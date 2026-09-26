import { StorageReservationSource, type PrismaClient } from '@prisma/client';
import type { ObjectStorage, StoredObjectInput } from '../../shared/index.js';
import { StorageReservationService } from './storage-reservation.service.js';

export interface StoreAccountedObjectInput<T> {
  tenantId: string;
  userId: string;
  source: StorageReservationSource;
  object: StoredObjectInput;
  originalName: string;
  persistMetadata: () => Promise<T>;
  rollbackMetadata?: (value: T) => Promise<void>;
  resourceId: (value: T) => string;
}

export class AccountedObjectService {
  private readonly reservations: StorageReservationService;

  constructor(private readonly db: PrismaClient, private readonly storage: ObjectStorage) {
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
      const metadata = await input.persistMetadata();
      persistedMetadata = { value: metadata };
      await this.db.storageReservation.update({
        where: { id: reservation.id, tenantId: input.tenantId },
        data: { status: 'SCANNING', uploadedAt: new Date(), resourceId: input.resourceId(metadata) },
      });
      await this.reservations.commit(input.tenantId, reservation.id, input.resourceId(metadata));
      await this.reservations.recordTraffic(input.tenantId, 'upload', input.object.body.byteLength);
      return metadata;
    } catch (error) {
      await this.reservations.release(input.tenantId, reservation.id, 'CANCELLED', 'Object persistence failed').catch(() => undefined);
      await this.storage.delete(input.object.key).catch(() => undefined);
      if (persistedMetadata && input.rollbackMetadata) {
        await input.rollbackMetadata(persistedMetadata.value).catch(() => undefined);
      }
      throw error;
    }
  }
}
