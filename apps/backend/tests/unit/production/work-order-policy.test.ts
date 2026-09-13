import { WorkOrderStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  assertWorkOrderStatusTransition,
  buildMaterialRequirements,
  requirePositiveQuantity,
} from "../../../src/modules/production/domain/index.js";

describe("work order policy", () => {
  it("accepts a supported status transition", () => {
    expect(() =>
      assertWorkOrderStatusTransition(
        WorkOrderStatus.PLANNED,
        WorkOrderStatus.IN_PROGRESS,
      ),
    ).not.toThrow();
  });

  it("rejects terminal and backwards status transitions", () => {
    expect(() =>
      assertWorkOrderStatusTransition(
        WorkOrderStatus.COMPLETED,
        WorkOrderStatus.IN_PROGRESS,
      ),
    ).toThrow();
    expect(() =>
      assertWorkOrderStatusTransition(
        WorkOrderStatus.IN_PROGRESS,
        WorkOrderStatus.PLANNED,
      ),
    ).toThrow();
  });

  it("aggregates remaining material by product and warehouse", () => {
    expect(
      buildMaterialRequirements(
        [
          {
            productId: "p-1",
            requiredQty: 5,
            consumedQty: 2,
            sourceWarehouseId: null,
          },
          {
            productId: "p-1",
            requiredQty: 4,
            consumedQty: 1,
            sourceWarehouseId: "w-1",
          },
          {
            productId: "p-2",
            requiredQty: 1,
            consumedQty: 1,
            sourceWarehouseId: null,
          },
        ],
        "w-1",
      ),
    ).toEqual([{ productId: "p-1", warehouseId: "w-1", quantity: 6 }]);
  });

  it("requires finite positive quantities", () => {
    expect(() => requirePositiveQuantity(0, "quantity")).toThrow();
    expect(() => requirePositiveQuantity(Number.NaN, "quantity")).toThrow();
    expect(() => requirePositiveQuantity(0.001, "quantity")).not.toThrow();
  });
});
