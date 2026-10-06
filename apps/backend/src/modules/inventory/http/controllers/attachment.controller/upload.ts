import { AuditAction, Prisma, StorageReservationSource } from "@prisma/client";
import { randomUUID } from "crypto";
import { Context } from "hono";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../../../errors/index.js";
import { prisma } from "../../../../../lib/prisma.js";
import { storageService } from "../../../../../services/storage.service.js";
import { enforceFileSecurity } from "../../../../shared/index.js";
import { AccountedObjectService } from "../../../../storage-accounting/index.js";
import { createAuditLog, getRequestMeta } from "../../../../../utils/audit.js";
import {
  requireParam,
  requireTenantId,
  requireUserId,
} from "../../../../../utils/context.js";
import {
  ensureAttachmentConfidentialityAccess,
  ensureEntityBelongsToTenant,
  isEntityType,
  parseCategoryInput,
  parseConfidentialityInput,
  parseDateField,
  parseKindInput,
  parsePositiveVersion,
  parseTagList,
  readFormString,
  validateDocumentDates,
  validateFile,
} from "./shared.js";

const accountedStorage = new AccountedObjectService(prisma, storageService);

function mapVersionConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    throw new ConflictError(
      "Bu dokumanin ayni versiyonu zaten mevcut. Listeyi yenileyip tekrar deneyin.",
    );
  }
  throw error;
}

export const uploadAttachmentController = {
  async upload(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const formData = await c.req.formData();
    const fileValue = formData.get("file");
    const rawEntityType = formData.get("entityType");
    const rawEntityId = formData.get("entityId");

    if (
      !(fileValue instanceof File) ||
      typeof rawEntityType !== "string" ||
      typeof rawEntityId !== "string"
    ) {
      return c.json(
        new ValidationError(
          "file, entityType ve entityId zorunludur.",
        ).toJSON(),
        400,
      );
    }
    if (!isEntityType(rawEntityType)) {
      return c.json(new ValidationError("Gecersiz entityType.").toJSON(), 400);
    }

    await ensureEntityBelongsToTenant(tenantId, rawEntityType, rawEntityId);
    const { safeName, extension, mimeType } = validateFile(fileValue);
    const category = parseCategoryInput(readFormString(formData, "category"));
    const tags = parseTagList(readFormString(formData, "tags"));
    const documentKind = parseKindInput(
      readFormString(formData, "documentKind"),
    );
    const confidentiality = parseConfidentialityInput(
      readFormString(formData, "confidentiality"),
    );
    await ensureAttachmentConfidentialityAccess(
      tenantId,
      userId,
      confidentiality,
    );
    const validFrom = parseDateField(readFormString(formData, "validFrom"));
    const validUntil = parseDateField(readFormString(formData, "validUntil"));
    const version =
      parsePositiveVersion(readFormString(formData, "version")) ?? 1;
    validateDocumentDates(validFrom, validUntil);

    const storageName = `${randomUUID()}${extension}`;
    const storagePath = `${tenantId}/${storageName}`;
    const buffer = Buffer.from(await fileValue.arrayBuffer());
    await enforceFileSecurity({
      body: buffer,
      fileName: safeName,
      contentType: mimeType,
    });
    const attachment = await accountedStorage
      .store({
        tenantId,
        userId,
        source: StorageReservationSource.ERP_ATTACHMENT,
        originalName: safeName,
        object: { key: storagePath, body: buffer, contentType: mimeType },
        persistMetadata: () =>
          prisma.attachment.create({
            data: {
              tenantId,
              entityType: rawEntityType,
              entityId: rawEntityId,
              fileName: safeName,
              storagePath,
              mimeType,
              fileSize: fileValue.size,
              category,
              tags,
              documentKind,
              confidentiality,
              validFrom,
              validUntil,
              version,
              uploadedById: userId,
            },
          }),
        rollbackMetadata: async (value) => {
          await prisma.attachment.deleteMany({
            where: { id: value.id, tenantId },
          });
        },
        resourceId: (value) => value.id,
      })
      .catch(mapVersionConflict);

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: "attachments",
      entityType: rawEntityType,
      entityId: rawEntityId,
      action: AuditAction.CREATE,
      newValues: {
        attachmentId: attachment.id,
        fileName: safeName,
        mimeType,
        fileSize: fileValue.size,
        category,
        tags,
        documentKind,
        confidentiality,
        validFrom,
        validUntil,
        version,
      },
      ...getRequestMeta(c),
    });

    return c.json({ data: attachment }, 201);
  },
  async uploadVersion(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, "id");

    const current = await prisma.attachment.findFirst({
      where: { id, tenantId },
    });
    if (!current) return c.json(new NotFoundError("Dosya", id).toJSON(), 404);
    await ensureEntityBelongsToTenant(
      tenantId,
      current.entityType,
      current.entityId,
    );
    await ensureAttachmentConfidentialityAccess(
      tenantId,
      userId,
      current.confidentiality,
    );

    const formData = await c.req.formData();
    const formKeys = new Set(Array.from(formData.keys()));
    const fileValue = formData.get("file");
    if (!(fileValue instanceof File)) {
      return c.json(new ValidationError("file zorunludur.").toJSON(), 400);
    }

    const { safeName, extension, mimeType } = validateFile(fileValue);
    const category = formKeys.has("category")
      ? parseCategoryInput(readFormString(formData, "category"))
      : current.category;
    const tags = readFormString(formData, "tags")
      ? parseTagList(readFormString(formData, "tags"))
      : current.tags;
    const documentKind = formKeys.has("documentKind")
      ? parseKindInput(readFormString(formData, "documentKind"))
      : current.documentKind;
    const confidentiality = formKeys.has("confidentiality")
      ? parseConfidentialityInput(readFormString(formData, "confidentiality"))
      : current.confidentiality;
    await ensureAttachmentConfidentialityAccess(
      tenantId,
      userId,
      confidentiality,
    );
    const validFrom = formKeys.has("validFrom")
      ? (parseDateField(readFormString(formData, "validFrom")) ?? null)
      : current.validFrom;
    const validUntil = formKeys.has("validUntil")
      ? (parseDateField(readFormString(formData, "validUntil")) ?? null)
      : current.validUntil;
    const requestedVersion = parsePositiveVersion(
      readFormString(formData, "version"),
    );
    const version = requestedVersion ?? current.version + 1;
    validateDocumentDates(validFrom, validUntil);

    const storageName = `${randomUUID()}${extension}`;
    const storagePath = `${tenantId}/${storageName}`;
    const buffer = Buffer.from(await fileValue.arrayBuffer());
    await enforceFileSecurity({
      body: buffer,
      fileName: safeName,
      contentType: mimeType,
    });
    const attachment = await accountedStorage
      .store({
        tenantId,
        userId,
        source: StorageReservationSource.ERP_ATTACHMENT,
        originalName: safeName,
        object: { key: storagePath, body: buffer, contentType: mimeType },
        persistMetadata: () =>
          prisma.attachment.create({
            data: {
              tenantId,
              entityType: current.entityType,
              entityId: current.entityId,
              fileName: current.fileName,
              storagePath,
              mimeType,
              fileSize: fileValue.size,
              category,
              tags,
              documentKind,
              confidentiality,
              validFrom,
              validUntil,
              version,
              uploadedById: userId,
            },
          }),
        rollbackMetadata: async (value) => {
          await prisma.attachment.deleteMany({
            where: { id: value.id, tenantId },
          });
        },
        resourceId: (value) => value.id,
      })
      .catch(mapVersionConflict);

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: "attachments",
      entityType: current.entityType,
      entityId: current.entityId,
      action: AuditAction.CREATE,
      oldValues: {
        attachmentId: current.id,
        fileName: current.fileName,
        version: current.version,
      },
      newValues: {
        attachmentId: attachment.id,
        fileName: current.fileName,
        uploadedFileName: safeName,
        version,
        previousAttachmentId: current.id,
      },
      ...getRequestMeta(c),
    });

    return c.json({ data: attachment }, 201);
  },
} as const;
