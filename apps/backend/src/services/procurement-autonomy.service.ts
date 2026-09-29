import {
  AuditAction,
  ContactType,
  EntityType,
  PrismaClient,
  PurchaseOrderStatus,
} from '@prisma/client';
import { logger } from '../lib/logger.js';
import { createAuditLog } from '../utils/audit.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/index.js';

export interface ProcurementProjectionItem {
  productId: string;
  productName: string;
  productSku: string;
  onHandQty: number;
  reservedQty: number;
  incomingQty: number;
  projectedStock: number;
  minStockLevel: number;
  dailyBurnRate: number;
  daysOfSupply: number;
  reorderStatus: 'OK' | 'REORDER_NEEDED' | 'CRITICAL_REORDER';
  preferredSupplierId?: string;
  preferredSupplierName?: string;
}

export interface SupplierReliabilityItem {
  supplierId: string;
  supplierName: string;
  totalOrders: number;
  onTimeDeliveryRatePct: number;
  priceStabilityScore: number;
  reliabilityScore: number; // 0 - 100
  riskCategory: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ZeroTouchPoDispatchResult {
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  supplierName: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  status: string;
  dispatchedAt: string;
}

export class ProcurementAutonomyService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * 1. Stock Projections & Reorder Analysis (Days of Supply)
   */
  async getProcurementProjections(tenantId: string): Promise<ProcurementProjectionItem[]> {
    const lookback = new Date();
    lookback.setDate(lookback.getDate() - 30);
    const products = await this.db.product.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        stockLevels: true,
        reservations: { where: { releasedAt: null } },
        movements: { where: { type: 'OUT', createdAt: { gte: lookback } }, select: { quantity: true } },
        purchaseItems: {
          where: { order: { deletedAt: null, status: { in: ['DRAFT', 'SENT', 'PARTIALLY_RECEIVED'] } } },
          select: { quantity: true, received: true },
        },
      },
      take: 100,
    });

    // Default supplier fallback
    const suppliers = await this.db.contact.findMany({
      where: { tenantId, deletedAt: null, type: ContactType.SUPPLIER },
      select: { id: true, name: true },
      take: 5,
    });

    const items: ProcurementProjectionItem[] = [];

    for (const p of products) {
      const onHandQty = p.stockLevels.reduce((s, sl) => s + Number(sl.quantity), 0);
      const reservedQty = p.reservations.reduce((s, r) => s + Number(r.quantity), 0);
      const incomingQty = p.purchaseItems.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) - Number(item.received)), 0);
      const projectedStock = onHandQty - reservedQty + incomingQty;
      const minStockLevel = Number(p.minStockLevel ?? 10);

      const dailyBurnRate = Math.round((p.movements.reduce((sum, movement) => sum + Number(movement.quantity), 0) / 30) * 10) / 10;
      const daysOfSupply = dailyBurnRate > 0 ? Math.max(0, Math.round(projectedStock / dailyBurnRate)) : 999;

      let reorderStatus: ProcurementProjectionItem['reorderStatus'] = 'OK';
      if (projectedStock <= 0) reorderStatus = 'CRITICAL_REORDER';
      else if (projectedStock < minStockLevel) reorderStatus = 'REORDER_NEEDED';

      const prefSupplier = suppliers[0];

      items.push({
        productId: p.id,
        productName: p.name,
        productSku: p.code,
        onHandQty,
        reservedQty,
        incomingQty,
        projectedStock,
        minStockLevel,
        dailyBurnRate,
        daysOfSupply,
        reorderStatus,
        preferredSupplierId: prefSupplier?.id,
        preferredSupplierName: prefSupplier?.name ?? 'Varsayılan Tedarikçi',
      });
    }

    return items;
  }

  /**
   * 2. Supplier Reliability Index (0 - 100 Scoreboard)
   */
  async getSupplierReliabilityScores(tenantId: string): Promise<SupplierReliabilityItem[]> {
    const suppliers = await this.db.contact.findMany({
      where: { tenantId, deletedAt: null, type: ContactType.SUPPLIER },
      select: {
        id: true,
        name: true,
        purchaseOrders: {
          where: { deletedAt: null },
          select: {
            dueDate: true,
            status: true,
            items: { select: { unitPrice: true } },
            history: { where: { toStatus: PurchaseOrderStatus.RECEIVED }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
          },
        },
      },
      take: 20,
    });

    const results: SupplierReliabilityItem[] = [];

    for (const sup of suppliers) {
      const poCount = sup.purchaseOrders.length;
      const measurableDeliveries = sup.purchaseOrders.filter((order) => order.status === PurchaseOrderStatus.RECEIVED && order.dueDate && order.history[0]);
      const onTimeDeliveryRatePct = measurableDeliveries.length === 0 ? 0 : Math.round((measurableDeliveries.filter((order) => order.history[0]!.createdAt <= order.dueDate!).length / measurableDeliveries.length) * 100);
      const prices = sup.purchaseOrders.flatMap((order) => order.items.map((item) => Number(item.unitPrice))).filter((price) => price > 0);
      const averagePrice = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : 0;
      const deviation = prices.length > 1 ? Math.sqrt(prices.reduce((sum, price) => sum + (price - averagePrice) ** 2, 0) / prices.length) : 0;
      const priceStabilityScore = prices.length === 0 ? 0 : Math.round(Math.max(0, Math.min(100, 100 * (1 - deviation / averagePrice))));

      const reliabilityScore = Math.round(onTimeDeliveryRatePct * 0.6 + priceStabilityScore * 0.4);

      let riskCategory: SupplierReliabilityItem['riskCategory'] = 'LOW';
      if (reliabilityScore < 60) riskCategory = 'HIGH';
      else if (reliabilityScore < 80) riskCategory = 'MEDIUM';

      results.push({
        supplierId: sup.id,
        supplierName: sup.name,
        totalOrders: poCount,
        onTimeDeliveryRatePct,
        priceStabilityScore,
        reliabilityScore,
        riskCategory,
      });
    }

    return results;
  }

  /**
   * 3. Zero-Touch Purchase Order Dispatch
   */
  async dispatchZeroTouchPurchaseOrder(
    tenantId: string,
    userId: string,
    productId: string,
    autoDispatch = true,
  ): Promise<ZeroTouchPoDispatchResult> {
    if (autoDispatch) throw new ValidationError('Otonom satın alma yalnızca taslak oluşturabilir; gönderim kullanıcı onayı gerektirir.');
    const created = await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${productId}))`;
      const product = await tx.product.findFirst({ where: { id: productId, tenantId, deletedAt: null } });
      if (!product) throw new NotFoundError('Ürün', productId);
      const existingOrder = await tx.purchaseOrder.findFirst({ where: { tenantId, deletedAt: null, status: { in: [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.SENT, PurchaseOrderStatus.PARTIALLY_RECEIVED] }, items: { some: { productId } } }, select: { number: true } });
      if (existingOrder) throw new ConflictError(`${product.name} için açık satın alma siparişi zaten mevcut: ${existingOrder.number}`);
      const latestSupply = await tx.purchaseOrderItem.findFirst({ where: { tenantId, productId, order: { deletedAt: null, contact: { deletedAt: null, type: ContactType.SUPPLIER } } }, orderBy: { order: { date: 'desc' } }, select: { order: { select: { contact: true } } } });
      const supplier = latestSupply?.order.contact;
      if (!supplier) throw new ValidationError('Ürün için satın alma geçmişinden doğrulanmış tedarikçi bulunamadı.');
      const stock = await tx.stockLevel.aggregate({ where: { tenantId, productId }, _sum: { quantity: true } });
      const reorderQty = Math.max(1, Number(product.minStockLevel) - Number(stock._sum.quantity ?? 0));
      const unitPrice = Number(product.purchasePrice ?? 100);
      const totalAmount = reorderQty * unitPrice;
      const poNumber = `PO-AUTO-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const po = await tx.purchaseOrder.create({
      data: {
        tenantId,
        contactId: supplier.id,
        number: poNumber,
        date: new Date(),
        status: PurchaseOrderStatus.DRAFT,
        currencyCode: 'TRY',
        exchangeRate: 1,
        totalGross: totalAmount,
        totalNet: totalAmount,
        notes: `Phase 18 Otonom Tedarik Ajanı tarafından ${product.name} için otomatik üretildi.`,
        createdById: userId,
        items: {
          create: [
            {
              tenantId,
              productId: product.id,
              quantity: reorderQty,
              unitPrice,
              lineTotal: totalAmount,
            },
          ],
        },
      },
      });
      return { po, product, supplier, reorderQty, unitPrice, totalAmount };
    });
    const { po, product, supplier, reorderQty, unitPrice, totalAmount } = created;

    logger.info(`[ProcurementAutonomy] Zero-Touch PO ${po.number} dispatched for product ${product.name}`);

    await createAuditLog(this.db, {
      tenantId,
      userId,
      module: 'accounting',
      entityType: EntityType.PURCHASE_ORDER,
      entityId: po.id,
      action: AuditAction.CREATE,
      newValues: { poNumber: po.number, productId, totalAmount, autoDispatched: autoDispatch },
    });

    return {
      purchaseOrderId: po.id,
      purchaseOrderNumber: po.number,
      supplierName: supplier.name,
      productName: product.name,
      quantity: reorderQty,
      unitPrice,
      totalAmount,
      status: po.status,
      dispatchedAt: new Date().toISOString(),
    };
  }

  /**
   * 4. Run Batch Autonomous Procurement Scan
   */
  async runAutonomousProcurementScan(
    tenantId: string,
    userId: string,
    autoDispatch = true,
  ): Promise<{ scannedProducts: number; dispatchedOrders: ZeroTouchPoDispatchResult[] }> {
    const projections = await this.getProcurementProjections(tenantId);
    const reorderNeeded = projections.filter((p) => p.reorderStatus !== 'OK');

    const dispatchedOrders: ZeroTouchPoDispatchResult[] = [];

    for (const item of reorderNeeded.slice(0, 5)) {
      try {
        const res = await this.dispatchZeroTouchPurchaseOrder(tenantId, userId, item.productId, autoDispatch);
        dispatchedOrders.push(res);
      } catch (err) {
        logger.error(`[ProcurementAutonomy] Failed auto-dispatch for product ${item.productId}: ${err}`);
      }
    }

    return {
      scannedProducts: projections.length,
      dispatchedOrders,
    };
  }
}
