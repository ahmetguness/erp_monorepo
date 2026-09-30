import {
  MANUAL_INVENTORY_MOVEMENT_TYPES,
  INVENTORY_RESERVATION_REF_TYPES,
  type ConfirmGoodsReceiptCommand,
  type ManualInventoryMovementType,
  type InventoryReservationRefType,
  type RecordStockMovementCommand,
  type ReleaseReservationCommand,
  type ReserveStockCommand,
} from "@repo/types";
import { ValidationError } from "../../../../errors/index.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${field} zorunludur.`);
  }
  return value.trim();
}

function positiveNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`${field} 0'dan buyuk sonlu bir sayi olmalidir.`);
  }
  return value;
}

function reservationQuantity(value: unknown): number {
  const quantity = positiveNumber(Number(value), "quantity");
  if (quantity >= 1e15) throw new ValidationError("quantity desteklenen sayisal araligi asiyor.");
  const scaled = quantity * 1000;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-7) throw new ValidationError("quantity en fazla 3 ondalik basamak icerebilir.");
  return quantity;
}

function reservationExpiry(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:59.999Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError("expiresAt gecersiz.");
  if (date <= new Date()) throw new ValidationError("expiresAt gelecekte olmalidir.");
  return date.toISOString();
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string")
    throw new ValidationError(`${field} metin olmalidir.`);
  return value;
}

function isMovementType(value: string): value is ManualInventoryMovementType {
  return MANUAL_INVENTORY_MOVEMENT_TYPES.some((candidate) => candidate === value);
}

function isReservationRefType(
  value: string,
): value is InventoryReservationRefType {
  return INVENTORY_RESERVATION_REF_TYPES.some(
    (candidate) => candidate === value,
  );
}

export function parseRecordStockMovement(
  value: unknown,
): RecordStockMovementCommand {
  if (!isRecord(value))
    throw new ValidationError("Gecersiz stok hareketi govdesi.");
  const type = requiredString(value.type, "type");
  if (!isMovementType(type)) {
    throw new ValidationError("Gecersiz stok hareketi tipi.");
  }
  const unitCost =
    value.unitCost === undefined ? undefined : Number(value.unitCost);
  if (unitCost !== undefined && (!Number.isFinite(unitCost) || unitCost < 0)) {
    throw new ValidationError(
      "unitCost negatif olmayan sonlu bir sayi olmalidir.",
    );
  }
  return {
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey"),
    productId: requiredString(value.productId, "productId"),
    warehouseId: requiredString(value.warehouseId, "warehouseId"),
    type,
    quantity: type === "ADJUSTMENT"
      ? (() => {
          const quantity = Number(value.quantity);
          if (!Number.isFinite(quantity) || quantity < 0) throw new ValidationError("quantity negatif olmayan sonlu bir sayi olmalidir.");
          return quantity;
        })()
      : positiveNumber(Number(value.quantity), "quantity"),
    ...(unitCost !== undefined ? { unitCost } : {}),
    ...(optionalString(value.lotId, "lotId")
      ? { lotId: String(value.lotId) }
      : {}),
    ...(optionalString(value.batchId, "batchId")
      ? { batchId: String(value.batchId) }
      : {}),
    ...(optionalString(value.notes, "notes")
      ? { notes: String(value.notes) }
      : {}),
  };
}

export function parseReserveStock(value: unknown): ReserveStockCommand {
  if (!isRecord(value))
    throw new ValidationError("Gecersiz rezervasyon govdesi.");
  const refType = requiredString(value.refType, "refType");
  if (!isReservationRefType(refType)) {
    throw new ValidationError("Gecersiz rezervasyon referans tipi.");
  }
  const expiresAt = reservationExpiry(optionalString(value.expiresAt, "expiresAt"));
  if (
    value.allowPartial !== undefined &&
    typeof value.allowPartial !== "boolean"
  ) {
    throw new ValidationError("allowPartial boolean olmalidir.");
  }
  const refId = requiredString(value.refId, "refId");
  if (refId.length > 200) throw new ValidationError("refId en fazla 200 karakter olabilir.");
  const notes = optionalString(value.notes, "notes")?.trim();
  if (notes && notes.length > 2000) throw new ValidationError("notes en fazla 2000 karakter olabilir.");
  return {
    productId: requiredString(value.productId, "productId"),
    warehouseId: requiredString(value.warehouseId, "warehouseId"),
    quantity: reservationQuantity(value.quantity),
    refType,
    refId,
    ...(notes ? { notes } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(typeof value.allowPartial === "boolean"
      ? { allowPartial: value.allowPartial }
      : {}),
  };
}

export function parseReleaseReservation(
  reservationId: unknown,
): ReleaseReservationCommand {
  return { reservationId: requiredString(reservationId, "reservationId") };
}

export function parseConfirmGoodsReceipt(
  purchaseOrderId: unknown,
  value: unknown,
): ConfirmGoodsReceiptCommand {
  if (
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    value.items.length === 0
  ) {
    throw new ValidationError(
      "warehouseId ve en az bir teslim kalemi zorunludur.",
    );
  }
  const seen = new Set<string>();
  const items = value.items.map((item) => {
    if (!isRecord(item)) throw new ValidationError("Gecersiz teslim kalemi.");
    const itemId = requiredString(item.itemId, "itemId");
    if (seen.has(itemId))
      throw new ValidationError(`Ayni teslim kalemi tekrar edemez: ${itemId}`);
    seen.add(itemId);
    return {
      itemId,
      receivedQty: positiveNumber(Number(item.receivedQty), "receivedQty"),
    };
  });
  return {
    purchaseOrderId: requiredString(purchaseOrderId, "purchaseOrderId"),
    warehouseId: requiredString(value.warehouseId, "warehouseId"),
    idempotencyKey: requiredString(value.idempotencyKey, "idempotencyKey"),
    items,
  };
}
