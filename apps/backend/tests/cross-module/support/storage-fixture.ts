import type {
  ObjectStorage,
  StoredObjectInput,
} from "../../../src/modules/shared/domain/storage/object-storage.js";
import type { Prisma } from "@prisma/client";
import type { TenantFixture } from "./fixtures.js";
import { randomUUID } from "node:crypto";

export class FixtureObjectStorage implements ObjectStorage {
  readonly driver = "local" as const;
  readonly objects = new Map<string, StoredObjectInput>();
  rejectPut = false;
  rejectDelete = false;
  async put(input: StoredObjectInput): Promise<void> {
    this.objects.set(input.key, input);
    if (this.rejectPut) throw new Error("Synthetic ambiguous provider put");
  }
  async get(key: string) {
    const row = this.objects.get(key);
    return row
      ? {
          body: row.body,
          contentType: row.contentType,
          contentLength: row.body.length,
        }
      : null;
  }
  async delete(key: string): Promise<void> {
    if (this.rejectDelete) throw new Error("Synthetic delete failure");
    this.objects.delete(key);
  }
  async createSignedGetUrl() {
    return null;
  }
  async createSignedPutUrl() {
    return null;
  }
}
export function storageInput(
  a: TenantFixture,
  key = `${a.tenant.id}/${randomUUID()}.txt`,
) {
  return {
    tenantId: a.tenant.id,
    userId: a.owner.id,
    source: "ERP_ATTACHMENT" as const,
    originalName: "probe.txt",
    object: { key, body: Buffer.alloc(1024, 65), contentType: "text/plain" },
    persistMetadata: (tx: Prisma.TransactionClient) =>
      tx.attachment.create({
        data: {
          tenantId: a.tenant.id,
          entityType: "PRODUCT",
          entityId: a.product.id,
          fileName: key,
          storagePath: key,
          mimeType: "text/plain",
          fileSize: 1024,
          uploadedById: a.owner.id,
        },
      }),
    resourceId: (row: { id: string }) => row.id,
  };
}
