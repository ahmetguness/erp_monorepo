import type {
  ReplenishmentPolicy,
  ReplenishmentSourceRow,
} from "./replenishment.types.js";

export interface ReplenishmentRepository {
  getPolicy(tenantId: string): Promise<ReplenishmentPolicy>;
  savePolicy(tenantId: string, policy: ReplenishmentPolicy): Promise<void>;
  loadPlanningRows(
    tenantId: string,
    policy: ReplenishmentPolicy,
    now: Date,
  ): Promise<ReplenishmentSourceRow[]>;
  createDraft(
    tenantId: string,
    userId: string,
    recommendation: {
      productId: string;
      supplierId: string;
      quantity: number;
      unitPrice: number;
    },
  ): Promise<{ purchaseOrderId: string; purchaseOrderNumber: string }>;
}
