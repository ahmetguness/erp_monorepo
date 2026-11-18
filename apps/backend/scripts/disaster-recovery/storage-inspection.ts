import type { PrismaClient } from "@prisma/client";
import type { ObjectStorage } from "../../src/modules/shared/domain/storage/object-storage.js";

// Read-only, exact metadata->object check. Provider-wide orphan detection still
// requires a versioned provider inventory; ObjectStorage intentionally has no list.
export async function inspectRestoredStorage(
  db: PrismaClient,
  objects: ObjectStorage,
) {
  const [attachments, chat, usage] = await Promise.all([
    db.attachment.findMany({
      select: { tenantId: true, storagePath: true, fileSize: true },
    }),
    db.chatAttachment.findMany({
      where: { status: "READY" },
      select: { tenantId: true, storageKey: true, sizeBytes: true },
    }),
    db.tenantStorageUsage.findMany(),
  ]);
  const references = [
    ...attachments.map((row) => ({
      tenantId: row.tenantId,
      key: row.storagePath,
      bytes: row.fileSize === null ? null : BigInt(row.fileSize),
    })),
    ...chat.map((row) => ({
      tenantId: row.tenantId,
      key: row.storageKey,
      bytes: BigInt(row.sizeBytes),
    })),
  ];
  const invalidMetadata = references.filter(
    (row) => row.bytes === null || row.bytes < 0n,
  ).length;
  let missing = 0;
  let inaccessible = 0;
  let sizeMismatch = 0;
  for (const row of references) {
    try {
      const object = await objects.get(row.key);
      if (!object) missing++;
      else if (row.bytes !== null && BigInt(object.body.length) !== row.bytes)
        sizeMismatch++;
    } catch {
      inaccessible++;
    }
  }
  let quotaMismatch = 0;
  const totals = new Map<string, bigint>();
  for (const row of references)
    totals.set(
      row.tenantId,
      (totals.get(row.tenantId) ?? 0n) + (row.bytes ?? 0n),
    );
  for (const row of usage) {
    if (row.usedBytes !== (totals.get(row.tenantId) ?? 0n)) quotaMismatch++;
    totals.delete(row.tenantId);
  }
  quotaMismatch += totals.size;
  return {
    passed:
      missing === 0 &&
      inaccessible === 0 &&
      sizeMismatch === 0 &&
      quotaMismatch === 0 &&
      invalidMetadata === 0,
    checked: references.length,
    missing,
    inaccessible,
    sizeMismatch,
    quotaMismatch,
    invalidMetadata,
  };
}
