import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import { LocalObjectStorage } from "../../../src/modules/shared/index.js";
import type { StoredObjectInput } from "../../../src/modules/shared/index.js";
import { AccountedObjectService } from "../../../src/modules/storage-accounting/application/accounted-object.service.js";

const target = new URL(process.env.CROSS_MODULE_DATABASE_URL ?? "");
if (!/^phase3_[a-z0-9_]+_ci$/.test(target.pathname.slice(1)))
  throw new Error("Crash child requires disposable DB");
const input = z
  .object({
    tenantId: z.string(),
    userId: z.string(),
    productId: z.string(),
    key: z.string(),
    root: z.string(),
  })
  .parse(JSON.parse(process.env.PHASE82_CRASH_INPUT ?? ""));
class InterruptedStorage extends LocalObjectStorage {
  override async put(value: StoredObjectInput): Promise<void> {
    await super.put(value);
    process.send?.({ checkpoint: "provider-put" });
    await new Promise<void>(() => {});
  }
}
const db = new PrismaClient({ datasources: { db: { url: target.href } } });
void new AccountedObjectService(db, new InterruptedStorage(input.root, true))
  .store({
    tenantId: input.tenantId,
    userId: input.userId,
    source: "ERP_ATTACHMENT",
    originalName: "crash.txt",
    object: {
      key: input.key,
      body: Buffer.alloc(1024, 65),
      contentType: "text/plain",
    },
    persistMetadata: (tx) =>
      tx.attachment.create({
        data: {
          tenantId: input.tenantId,
          entityType: "PRODUCT",
          entityId: input.productId,
          fileName: "crash.txt",
          storagePath: input.key,
          mimeType: "text/plain",
          fileSize: 1024,
          uploadedById: input.userId,
        },
      }),
    resourceId: (row) => row.id,
  })
  .then(() => process.exit(1))
  .catch(() => process.exit(1));
