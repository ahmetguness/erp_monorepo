import { MovementType, type PrismaClient } from "@prisma/client";
import type {
  InventoryTruthGateCheck,
  InventoryTruthGateKey,
  InventoryTruthGateReport,
} from "../../application/truth-gate/index.js";

const EPSILON = 0.001;
const key = (productId: string, warehouseId: string): string =>
  `${productId}:${warehouseId}`;

interface LedgerMovement {
  productId: string;
  quantity: unknown;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
}

export function reconstructStockBalances(
  movements: readonly LedgerMovement[],
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const movement of movements) {
    const quantity = Number(movement.quantity);
    if (movement.fromWarehouseId) {
      const sourceKey = key(movement.productId, movement.fromWarehouseId);
      balances.set(sourceKey, (balances.get(sourceKey) ?? 0) - quantity);
    }
    if (movement.toWarehouseId) {
      const targetKey = key(movement.productId, movement.toWarehouseId);
      balances.set(targetKey, (balances.get(targetKey) ?? 0) + quantity);
    }
  }
  return balances;
}

export function isValidTransferMovement(movement: LedgerMovement): boolean {
  return Boolean(
    movement.fromWarehouseId &&
      movement.toWarehouseId &&
      movement.fromWarehouseId !== movement.toWarehouseId &&
      Number(movement.quantity) > 0,
  );
}

function sumByKey<T>(
  rows: readonly T[],
  getKey: (row: T) => string,
  getQuantity: (row: T) => number,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const rowKey = getKey(row);
    totals.set(rowKey, (totals.get(rowKey) ?? 0) + getQuantity(row));
  }
  return totals;
}

function countQuantityMismatches(
  expected: ReadonlyMap<string, number>,
  actual: ReadonlyMap<string, number>,
): number {
  const keys = new Set([...expected.keys(), ...actual.keys()]);
  return [...keys].filter(
    (rowKey) =>
      Math.abs((expected.get(rowKey) ?? 0) - (actual.get(rowKey) ?? 0)) >
      EPSILON,
  ).length;
}

function check(
  keyValue: InventoryTruthGateKey,
  label: string,
  evidenceCount: number,
  violationCount: number,
  passDetail: string,
): InventoryTruthGateCheck {
  const status =
    evidenceCount === 0 ? "NOT_TESTED" : violationCount === 0 ? "PASS" : "FAIL";
  return {
    key: keyValue,
    label,
    status,
    evidenceCount,
    violationCount,
    detail:
      status === "PASS"
        ? passDetail
        : status === "NOT_TESTED"
          ? "Bu hareket türü için henüz kanıt verisi yok."
          : `${violationCount} tutarsız kayıt bulundu.`,
  };
}

export class InventoryTruthGateService {
  constructor(private readonly db: PrismaClient) {}

  async evaluate(tenantId: string): Promise<InventoryTruthGateReport> {
    const [
      levels,
      movements,
      reservations,
      valuations,
      lots,
      purchaseItems,
      salesOrderItems,
      deliveryItems,
      workOrders,
    ] = await Promise.all([
      this.db.stockLevel.findMany({
        where: { tenantId },
        select: { productId: true, warehouseId: true, quantity: true },
      }),
      this.db.stockMovement.findMany({
        where: { tenantId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          productId: true,
          type: true,
          quantity: true,
          fromWarehouseId: true,
          toWarehouseId: true,
          refType: true,
          refId: true,
          lotId: true,
        },
      }),
      this.db.inventoryReservation.findMany({
        where: { tenantId },
        select: {
          productId: true,
          warehouseId: true,
          quantity: true,
          releasedAt: true,
        },
      }),
      this.db.stockValuation.findMany({
        where: { tenantId },
        select: {
          movementId: true,
          productId: true,
          warehouseId: true,
          qtyBalance: true,
        },
      }),
      this.db.lotSerialNumber.findMany({
        where: { tenantId },
        select: { id: true, isUsed: true },
      }),
      this.db.purchaseOrderItem.findMany({
        where: { tenantId },
        select: { orderId: true, productId: true, received: true },
      }),
      this.db.salesOrderItem.findMany({
        where: { tenantId },
        select: { orderId: true, productId: true, delivered: true },
      }),
      this.db.deliveryNoteItem.findMany({
        where: { tenantId },
        select: {
          deliveryNoteId: true,
          productId: true,
          deliveredQty: true,
          deliveryNote: { select: { type: true, salesOrderId: true } },
        },
      }),
      this.db.workOrder.findMany({
        where: { tenantId },
        select: {
          id: true,
          productId: true,
          producedQty: true,
          items: { select: { productId: true, consumedQty: true } },
        },
      }),
    ]);

    const actual = new Map<string, number>();
    for (const level of levels) {
      const levelKey = key(level.productId, level.warehouseId);
      actual.set(
        levelKey,
        (actual.get(levelKey) ?? 0) + Number(level.quantity),
      );
    }
    const expected = reconstructStockBalances(movements);
    const stockViolations = countQuantityMismatches(expected, actual);

    const activeReserved = new Map<string, number>();
    for (const reservation of reservations.filter(
      (row) => row.releasedAt === null,
    ))
      activeReserved.set(
        key(reservation.productId, reservation.warehouseId),
        (activeReserved.get(
          key(reservation.productId, reservation.warehouseId),
        ) ?? 0) + Number(reservation.quantity),
      );
    const reservationViolations = [...activeReserved].filter(
      ([item, quantity]) => quantity - (actual.get(item) ?? 0) > EPSILON,
    ).length;
    const valuedMovementIds = new Set(
      valuations
        .map((row) => row.movementId)
        .filter((value): value is string => value !== null),
    );
    const costedMovements = movements.filter(
      (row) => row.type !== MovementType.TRANSFER,
    );
    const valuationViolations = costedMovements.filter(
      (row) => !valuedMovementIds.has(row.id),
    ).length;
    const lotUsage = new Map<string, number>();
    for (const movement of movements.filter(
      (row) => row.lotId && row.fromWarehouseId,
    ))
      lotUsage.set(
        movement.lotId ?? "",
        (lotUsage.get(movement.lotId ?? "") ?? 0) + 1,
      );
    const lotViolations = lots.filter(
      (lot) =>
        (lotUsage.get(lot.id) ?? 0) > 1 ||
        (lot.isUsed && (lotUsage.get(lot.id) ?? 0) === 0),
    ).length;

    const byType = (type: MovementType) =>
      movements.filter((row) => row.type === type);
    const referencedQuantity = (
      refId: string,
      productId: string,
      inbound: boolean,
    ): number =>
      movements
        .filter(
          (row) =>
            row.refId === refId &&
            row.productId === productId &&
            (inbound
              ? row.toWarehouseId !== null
              : row.fromWarehouseId !== null),
        )
        .reduce((sum, row) => sum + Number(row.quantity), 0);
    const receivedByPurchaseProduct = sumByKey(
      purchaseItems,
      (row) => key(row.orderId, row.productId),
      (row) => Number(row.received),
    );
    const purchaseMovementTotals = new Map<string, number>();
    for (const rowKey of receivedByPurchaseProduct.keys()) {
      const separator = rowKey.indexOf(":");
      const orderId = rowKey.slice(0, separator);
      const productId = rowKey.slice(separator + 1);
      purchaseMovementTotals.set(
        rowKey,
        referencedQuantity(orderId, productId, true),
      );
    }
    const purchaseViolations = countQuantityMismatches(
      receivedByPurchaseProduct,
      purchaseMovementTotals,
    );
    const salesRows = deliveryItems.filter(
      (row) => row.deliveryNote.type === "OUTBOUND",
    );
    const deliveredByNoteProduct = sumByKey(
      salesRows,
      (row) => key(row.deliveryNoteId, row.productId),
      (row) => Number(row.deliveredQty),
    );
    const salesMovementTotals = new Map<string, number>();
    for (const rowKey of deliveredByNoteProduct.keys()) {
      const separator = rowKey.indexOf(":");
      const noteId = rowKey.slice(0, separator);
      const productId = rowKey.slice(separator + 1);
      salesMovementTotals.set(
        rowKey,
        referencedQuantity(noteId, productId, false),
      );
    }
    const deliveredBySalesOrderProduct = sumByKey(
      salesRows.filter((row) => row.deliveryNote.salesOrderId !== null),
      (row) => key(row.deliveryNote.salesOrderId ?? "", row.productId),
      (row) => Number(row.deliveredQty),
    );
    const salesOrderDeliveredTotals = sumByKey(
      salesOrderItems,
      (row) => key(row.orderId, row.productId),
      (row) => Number(row.delivered),
    );
    const salesViolations =
      countQuantityMismatches(deliveredByNoteProduct, salesMovementTotals) +
      countQuantityMismatches(
        salesOrderDeliveredTotals,
        deliveredBySalesOrderProduct,
      );
    const consumedByWorkOrderProduct = sumByKey(
      workOrders.flatMap((order) =>
        order.items.map((item) => ({ orderId: order.id, ...item })),
      ),
      (row) => key(row.orderId, row.productId),
      (row) => Number(row.consumedQty),
    );
    const consumptionMovementTotals = new Map<string, number>();
    for (const rowKey of consumedByWorkOrderProduct.keys()) {
      const separator = rowKey.indexOf(":");
      const orderId = rowKey.slice(0, separator);
      const productId = rowKey.slice(separator + 1);
      consumptionMovementTotals.set(
        rowKey,
        referencedQuantity(orderId, productId, false),
      );
    }
    const productionConsumptionViolations = countQuantityMismatches(
      consumedByWorkOrderProduct,
      consumptionMovementTotals,
    );
    const productionOutputViolations = workOrders.filter(
      (order) =>
        Math.abs(
          Number(order.producedQty) -
            referencedQuantity(order.id, order.productId, true),
        ) > EPSILON,
    ).length;
    const transferMovements = byType(MovementType.TRANSFER);
    const transferViolations = transferMovements.filter(
      (movement) => !isValidTransferMovement(movement),
    ).length;

    const checks: InventoryTruthGateCheck[] = [
      check(
        "opening_stock",
        "Opening Stock",
        byType(MovementType.OPENING).length,
        stockViolations,
        "Açılış ve sonraki hareketler stok seviyeleriyle mutabık.",
      ),
      check(
        "purchase_receipt",
        "Purchase Receipt",
        [...receivedByPurchaseProduct.values()].filter((value) => value > 0)
          .length,
        purchaseViolations,
        "Mal kabul miktarları stok girişleriyle eşleşiyor.",
      ),
      check(
        "sales_delivery",
        "Sales Delivery",
        deliveredByNoteProduct.size,
        salesViolations,
        "Sevkiyat miktarları stok çıkışlarıyla eşleşiyor.",
      ),
      check(
        "reservation",
        "Reservation",
        reservations.length,
        reservationViolations,
        "Kullanılabilir stok aktif rezervasyonlar düşülerek geçerli.",
      ),
      check(
        "reservation_release",
        "Reservation Release",
        reservations.filter((row) => row.releasedAt !== null).length,
        0,
        "Serbest bırakılan rezervasyonlar kullanılabilir stoğa dahil edilmiyor.",
      ),
      check(
        "production_consumption",
        "Production Consumption",
        workOrders
          .flatMap((row) => row.items)
          .filter((row) => Number(row.consumedQty) > 0).length,
        productionConsumptionViolations,
        "Üretim sarfları stok çıkışlarıyla eşleşiyor.",
      ),
      check(
        "production_output",
        "Production Output",
        workOrders.filter((row) => Number(row.producedQty) > 0).length,
        productionOutputViolations,
        "Üretim çıktıları mamul stok girişleriyle eşleşiyor.",
      ),
      check(
        "return",
        "Return",
        byType(MovementType.RETURN).length,
        byType(MovementType.RETURN).filter(
          (row) => !valuedMovementIds.has(row.id),
        ).length,
        "İade hareketlerinin değerleme kayıtları mevcut.",
      ),
      check(
        "adjustment",
        "Adjustment",
        byType(MovementType.ADJUSTMENT).length,
        stockViolations,
        "Sayım düzeltmeleri stok seviyesine yansımış.",
      ),
      check(
        "transfer",
        "Transfer",
        transferMovements.length,
        transferViolations,
        "Transferlerin depolar arası net miktarı sıfır.",
      ),
      check(
        "lot_serial",
        "Lot / Serial",
        lots.length,
        lotViolations,
        "Lot ve seri kullanımları tekil.",
      ),
      check(
        "cost_valuation",
        "Cost Valuation",
        costedMovements.length,
        valuationViolations,
        "Stok hareketlerinin değerleme izi eksiksiz.",
      ),
    ];
    const summary = {
      passed: checks.filter((row) => row.status === "PASS").length,
      failed: checks.filter((row) => row.status === "FAIL").length,
      notTested: checks.filter((row) => row.status === "NOT_TESTED").length,
      total: checks.length,
    };
    return {
      decision:
        summary.failed === 0 && summary.notTested === 0 ? "GO" : "NO_GO",
      checks,
      summary,
      generatedAt: new Date().toISOString(),
    };
  }
}
