import { describe, expect, it } from "vitest";
import {
  isValidTransferMovement,
  reconstructStockBalances,
} from "../../src/modules/inventory/infrastructure/services/inventory-truth-gate.service.js";

describe("inventory truth gate ledger", () => {
  it("applies adjustment movements as deltas", () => {
    const balances = reconstructStockBalances([
      { productId: "product-1", quantity: 10, fromWarehouseId: null, toWarehouseId: "warehouse-1" },
      { productId: "product-1", quantity: 3, fromWarehouseId: null, toWarehouseId: "warehouse-1" },
      { productId: "product-1", quantity: 2, fromWarehouseId: "warehouse-1", toWarehouseId: null },
    ]);

    expect(balances.get("product-1:warehouse-1")).toBe(11);
  });

  it("keeps a transfer net-zero across warehouses", () => {
    const movement = {
      productId: "product-1",
      quantity: 4,
      fromWarehouseId: "warehouse-1",
      toWarehouseId: "warehouse-2",
    };
    const balances = reconstructStockBalances([movement]);

    expect(isValidTransferMovement(movement)).toBe(true);
    expect(balances.get("product-1:warehouse-1")).toBe(-4);
    expect(balances.get("product-1:warehouse-2")).toBe(4);
    expect([...balances.values()].reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  it("rejects incomplete and same-warehouse transfers", () => {
    expect(isValidTransferMovement({ productId: "product-1", quantity: 1, fromWarehouseId: "warehouse-1", toWarehouseId: null })).toBe(false);
    expect(isValidTransferMovement({ productId: "product-1", quantity: 1, fromWarehouseId: "warehouse-1", toWarehouseId: "warehouse-1" })).toBe(false);
  });
});
