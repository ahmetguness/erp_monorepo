import {
  MovementType,
  OrderStatus,
  PurchaseOrderStatus,
  type PrismaClient,
} from "@prisma/client";
import type {
  ReplenishmentPolicy,
  ReplenishmentRepository,
  ReplenishmentSourceRow,
} from "../../application/replenishment/index.js";

const KEYS = {
  lookback: "procurement.planning.lookback_days",
  horizon: "procurement.planning.horizon_days",
  service: "procurement.planning.target_service_level",
  drafts: "procurement.planning.auto_create_drafts",
  limit: "procurement.planning.maximum_draft_value",
} as const;
const DEFAULT_POLICY: ReplenishmentPolicy = {
  lookbackDays: 90,
  horizonDays: 30,
  targetServiceLevel: 95,
  autoCreateDrafts: false,
  maximumDraftValue: 50_000,
};
const numeric = (value: string | undefined, fallback: number): number =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

export class PrismaReplenishmentRepository implements ReplenishmentRepository {
  constructor(private readonly db: PrismaClient) {}
  async getPolicy(tenantId: string): Promise<ReplenishmentPolicy> {
    const rows = await this.db.tenantSetting.findMany({
      where: { tenantId, key: { in: Object.values(KEYS) } },
      select: { key: true, value: true },
    });
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return {
      lookbackDays: numeric(values[KEYS.lookback], 90),
      horizonDays: numeric(values[KEYS.horizon], 30),
      targetServiceLevel: numeric(values[KEYS.service], 95),
      autoCreateDrafts: values[KEYS.drafts] === "true",
      maximumDraftValue: numeric(values[KEYS.limit], 50_000),
    };
  }
  async savePolicy(
    tenantId: string,
    policy: ReplenishmentPolicy,
  ): Promise<void> {
    const entries = [
      [KEYS.lookback, policy.lookbackDays],
      [KEYS.horizon, policy.horizonDays],
      [KEYS.service, policy.targetServiceLevel],
      [KEYS.drafts, policy.autoCreateDrafts],
      [KEYS.limit, policy.maximumDraftValue],
    ] as const;
    await this.db.$transaction(
      entries.map(([key, value]) =>
        this.db.tenantSetting.upsert({
          where: { tenantId_key: { tenantId, key } },
          create: { tenantId, key, value: String(value) },
          update: { value: String(value) },
        }),
      ),
    );
  }
  async loadPlanningRows(
    tenantId: string,
    policy: ReplenishmentPolicy,
    now: Date,
  ): Promise<ReplenishmentSourceRow[]> {
    const since = new Date(now);
    since.setDate(since.getDate() - policy.lookbackDays);
    const recentSince = new Date(now);
    recentSince.setDate(
      recentSince.getDate() - Math.ceil(policy.lookbackDays / 3),
    );
    const openStatuses: PurchaseOrderStatus[] = [
      PurchaseOrderStatus.DRAFT,
      PurchaseOrderStatus.SENT,
      PurchaseOrderStatus.PARTIALLY_RECEIVED,
    ];
    const purchaseHistorySince = new Date(now);
    purchaseHistorySince.setFullYear(purchaseHistorySince.getFullYear() - 1);
    const [products, movements, purchaseItems, salesItems] =
      await this.db.$transaction([
        this.db.product.findMany({
          where: { tenantId, isActive: true, deletedAt: null },
          select: {
            id: true,
            code: true,
            name: true,
            purchasePrice: true,
            minStockLevel: true,
            stockLevels: { select: { quantity: true } },
            reservations: {
              where: { releasedAt: null },
              select: { quantity: true },
            },
          },
        }),
        this.db.stockMovement.findMany({
          where: {
            tenantId,
            type: MovementType.OUT,
            createdAt: { gte: since },
          },
          select: { productId: true, quantity: true, createdAt: true },
        }),
        this.db.purchaseOrderItem.findMany({
          where: {
            tenantId,
            order: { deletedAt: null, date: { gte: purchaseHistorySince } },
          },
          select: {
            productId: true,
            quantity: true,
            received: true,
            unitPrice: true,
            order: {
              select: {
                contactId: true,
                contact: { select: { name: true } },
                status: true,
                date: true,
                dueDate: true,
              },
            },
          },
          orderBy: { order: { date: "desc" } },
        }),
        this.db.salesOrderItem.findMany({
          where: {
            tenantId,
            order: {
              deletedAt: null,
              status: { notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] },
            },
          },
          select: { productId: true, quantity: true, delivered: true },
        }),
      ]);
    return products.map((product) => {
      const demand = movements.filter(
        (movement) => movement.productId === product.id,
      );
      const history = purchaseItems.filter(
        (item) => item.productId === product.id,
      );
      const latest = history[0];
      const supplierOrders = latest
        ? history.filter(
            (item) => item.order.contactId === latest.order.contactId,
          )
        : [];
      const completed = supplierOrders.filter(
        (item) => item.order.status === PurchaseOrderStatus.RECEIVED,
      );
      const cancelled = supplierOrders.filter(
        (item) => item.order.status === PurchaseOrderStatus.CANCELLED,
      );
      const leadTimes = completed.flatMap((item) =>
        item.order.dueDate
          ? [
              Math.max(
                1,
                Math.ceil(
                  (item.order.dueDate.getTime() - item.order.date.getTime()) /
                    86_400_000,
                ),
              ),
            ]
          : [],
      );
      const samples = Array.from(
        { length: Math.min(policy.lookbackDays, 30) },
        (_, index) => {
          const end = new Date(now);
          end.setDate(end.getDate() - index);
          return demand
            .filter(
              (item) => item.createdAt.toDateString() === end.toDateString(),
            )
            .reduce((sum, item) => sum + Number(item.quantity), 0);
        },
      );
      return {
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        purchasePrice: Number(product.purchasePrice),
        minimumStock: Number(product.minStockLevel),
        onHand: product.stockLevels.reduce(
          (sum, item) => sum + Number(item.quantity),
          0,
        ),
        reserved: product.reservations.reduce(
          (sum, item) => sum + Number(item.quantity),
          0,
        ),
        incoming: history
          .filter((item) => openStatuses.includes(item.order.status))
          .reduce(
            (sum, item) =>
              sum + Math.max(0, Number(item.quantity) - Number(item.received)),
            0,
          ),
        openSales: salesItems
          .filter((item) => item.productId === product.id)
          .reduce(
            (sum, item) =>
              sum + Math.max(0, Number(item.quantity) - Number(item.delivered)),
            0,
          ),
        recentDemand: demand
          .filter((item) => item.createdAt >= recentSince)
          .reduce((sum, item) => sum + Number(item.quantity), 0),
        previousDemand: demand
          .filter((item) => item.createdAt < recentSince)
          .reduce((sum, item) => sum + Number(item.quantity), 0),
        demandSamples: samples,
        supplierId: latest?.order.contactId ?? null,
        supplierName: latest?.order.contact.name ?? null,
        supplierUnitPrice: latest ? Number(latest.unitPrice) : null,
        supplierLeadTimeDays:
          leadTimes.length > 0
            ? Math.round(
                leadTimes.reduce((sum, days) => sum + days, 0) /
                  leadTimes.length,
              )
            : null,
        supplierReliability:
          supplierOrders.length > 0
            ? Math.round(
                (completed.length /
                  Math.max(1, completed.length + cancelled.length)) *
                  100,
              )
            : null,
        minimumOrderQuantity:
          history.length > 0
            ? Math.max(
                1,
                Math.min(...history.map((item) => Number(item.quantity))),
              )
            : 1,
        packageSize: 1,
      };
    });
  }
  async createDraft(
    tenantId: string,
    userId: string,
    input: {
      productId: string;
      supplierId: string;
      quantity: number;
      unitPrice: number;
    },
  ): Promise<{ purchaseOrderId: string; purchaseOrderNumber: string }> {
    return this.db.$transaction(async (tx) => {
      const number = `PO-PLAN-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const total = input.quantity * input.unitPrice;
      const order = await tx.purchaseOrder.create({
        data: {
          tenantId,
          contactId: input.supplierId,
          number,
          date: new Date(),
          status: PurchaseOrderStatus.DRAFT,
          notes:
            "Talep tahmini tarafından oluşturulan onay bekleyen ikmal taslağı",
          totalNet: total,
          totalGross: total,
          createdById: userId,
          items: {
            create: {
              tenantId,
              productId: input.productId,
              quantity: input.quantity,
              unitPrice: input.unitPrice,
              lineTotal: total,
            },
          },
        },
        select: { id: true, number: true },
      });
      return { purchaseOrderId: order.id, purchaseOrderNumber: order.number };
    });
  }
}
