import { WorkOrderStatus } from "@prisma/client";

export { WorkOrderStatus };

import { ValidationError } from "../../../errors/index.js";

export interface WorkOrderMaterialItem {
  productId: string;
  requiredQty: unknown;
  consumedQty: unknown;
  sourceWarehouseId: string | null;
}

export interface MaterialRequirement {
  productId: string;
  warehouseId: string;
  quantity: number;
}

const STATUS_TRANSITIONS = {
  [WorkOrderStatus.PLANNED]: [
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.IN_PROGRESS]: [
    WorkOrderStatus.PAUSED,
    WorkOrderStatus.COMPLETED,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.PAUSED]: [
    WorkOrderStatus.IN_PROGRESS,
    WorkOrderStatus.CANCELLED,
  ],
  [WorkOrderStatus.COMPLETED]: [],
  [WorkOrderStatus.CANCELLED]: [],
} as const satisfies Record<WorkOrderStatus, readonly WorkOrderStatus[]>;

export function assertWorkOrderStatusTransition(
  currentStatus: WorkOrderStatus,
  nextStatus: WorkOrderStatus,
): void {
  const allowedStatuses: readonly WorkOrderStatus[] =
    STATUS_TRANSITIONS[currentStatus];
  if (!allowedStatuses.includes(nextStatus)) {
    throw new ValidationError(
      `${currentStatus} → ${nextStatus} geçişi yapılamaz.`,
    );
  }
}

export function requirePositiveQuantity(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`${field} pozitif olmalıdır.`);
  }
}

export function buildMaterialRequirements(
  items: readonly WorkOrderMaterialItem[],
  inputWarehouseId: string | null,
): MaterialRequirement[] {
  const requirements = new Map<string, MaterialRequirement>();

  for (const item of items) {
    const warehouseId = item.sourceWarehouseId ?? inputWarehouseId;
    if (!warehouseId) continue;
    const remainingQuantity = Math.max(
      0,
      Number(item.requiredQty ?? 0) - Number(item.consumedQty ?? 0),
    );
    if (remainingQuantity <= 0) continue;

    const key = `${item.productId}:${warehouseId}`;
    const current = requirements.get(key);
    requirements.set(key, {
      productId: item.productId,
      warehouseId,
      quantity: (current?.quantity ?? 0) + remainingQuantity,
    });
  }

  return [...requirements.values()];
}
