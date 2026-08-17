import {
  ContactType,
  MarketplaceOrder,
  MarketplaceOrderItem,
  MarketplaceOrderStatus,
  OrderStatus,
  PrismaClient,
  Prisma,
  ReservationRefType,
} from '@prisma/client';
import { logger } from '../lib/logger.js';
import { TrendyolService, buildTrendyolCredentials } from './trendyol.service.js';

export interface MarketplaceAutomationPolicy {
  autoCreateContact: boolean;
  autoCreateSalesOrder: boolean;
  autoReserveStock: boolean;
  autoCreateInvoice: boolean;
  autoSyncErpStockToMarketplace: boolean;
}

export const DEFAULT_AUTOMATION_POLICY: MarketplaceAutomationPolicy = {
  autoCreateContact: true,
  autoCreateSalesOrder: true,
  autoReserveStock: true,
  autoCreateInvoice: false,
  autoSyncErpStockToMarketplace: true,
};

export interface OrderAutomationResult {
  marketplaceOrderId: string;
  externalId: string;
  contactId: string | null;
  contactCreated: boolean;
  matchedSkuCount: number;
  unmatchedSkuCount: number;
  salesOrderId: string | null;
  reservationIds: string[];
  statusSynced: boolean;
  errors: string[];
}

export interface MarketplaceAutomationSummary {
  policy: MarketplaceAutomationPolicy;
  totalMarketplaceOrders: number;
  matchedContactCount: number;
  salesOrderCount: number;
  reservationCount: number;
  unmatchedSkuCount: number;
}

const POLICY_PREFIX = '[MARKETPLACE_POLICY]:';

export class MarketplaceAutomationService {
  constructor(private readonly db: PrismaClient) {}

  async getPolicy(tenantId: string): Promise<MarketplaceAutomationPolicy> {
    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
      select: { notes: true },
    });

    if (!tenant?.notes) {
      return { ...DEFAULT_AUTOMATION_POLICY };
    }

    const match = tenant.notes.split('\n').find((line) => line.startsWith(POLICY_PREFIX));
    if (!match) {
      return { ...DEFAULT_AUTOMATION_POLICY };
    }

    try {
      const raw = JSON.parse(match.slice(POLICY_PREFIX.length));
      return {
        autoCreateContact: typeof raw.autoCreateContact === 'boolean' ? raw.autoCreateContact : DEFAULT_AUTOMATION_POLICY.autoCreateContact,
        autoCreateSalesOrder: typeof raw.autoCreateSalesOrder === 'boolean' ? raw.autoCreateSalesOrder : DEFAULT_AUTOMATION_POLICY.autoCreateSalesOrder,
        autoReserveStock: typeof raw.autoReserveStock === 'boolean' ? raw.autoReserveStock : DEFAULT_AUTOMATION_POLICY.autoReserveStock,
        autoCreateInvoice: typeof raw.autoCreateInvoice === 'boolean' ? raw.autoCreateInvoice : DEFAULT_AUTOMATION_POLICY.autoCreateInvoice,
        autoSyncErpStockToMarketplace: typeof raw.autoSyncErpStockToMarketplace === 'boolean' ? raw.autoSyncErpStockToMarketplace : DEFAULT_AUTOMATION_POLICY.autoSyncErpStockToMarketplace,
      };
    } catch {
      return { ...DEFAULT_AUTOMATION_POLICY };
    }
  }

  async updatePolicy(tenantId: string, input: Partial<MarketplaceAutomationPolicy>): Promise<MarketplaceAutomationPolicy> {
    const current = await this.getPolicy(tenantId);
    const updated: MarketplaceAutomationPolicy = { ...current, ...input };

    const tenant = await this.db.tenant.findUnique({
      where: { id: tenantId },
      select: { notes: true },
    });

    const existingNotes = tenant?.notes ?? '';
    const lines = existingNotes.split('\n').filter((l) => !l.startsWith(POLICY_PREFIX));
    lines.push(`${POLICY_PREFIX}${JSON.stringify(updated)}`);

    await this.db.tenant.update({
      where: { id: tenantId },
      data: { notes: lines.join('\n').trim() },
    });

    return updated;
  }

  /**
   * Complete Pipeline for Marketplace Order Processing:
   * MarketplaceOrder -> Contact Match/Create -> SKU Match -> SalesOrder -> Reservation -> Status Sync
   */
  async processOrderAutomation(tenantId: string, marketplaceOrderId: string): Promise<OrderAutomationResult> {
    const policy = await this.getPolicy(tenantId);
    const errors: string[] = [];

    const order = await this.db.marketplaceOrder.findFirst({
      where: { id: marketplaceOrderId, tenantId },
      include: {
        items: true,
        integration: true,
      },
    });

    if (!order) {
      throw new Error(`Marketplace order not found: ${marketplaceOrderId}`);
    }

    const result: OrderAutomationResult = {
      marketplaceOrderId: order.id,
      externalId: order.externalId,
      contactId: null,
      contactCreated: false,
      matchedSkuCount: 0,
      unmatchedSkuCount: 0,
      salesOrderId: null,
      reservationIds: [],
      statusSynced: false,
      errors,
    };

    // Step 1: Contact Matching / Creation
    let contactId: string | null = null;
    try {
      contactId = await this.matchOrCreateContact(tenantId, order, policy.autoCreateContact);
      result.contactId = contactId;
      result.contactCreated = Boolean(contactId && !order.customerEmail);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Cari eşleştirme hatası: ${msg}`);
      logger.error(`[MarketplaceAutomation] Contact match failed for order ${order.externalId}: ${msg}`);
    }

    // Step 2: SKU / Product Matching
    let matchedItems: Array<{ item: MarketplaceOrderItem; productId: string; price: number }> = [];
    try {
      const matchRes = await this.matchOrderSkus(tenantId, order.items);
      result.matchedSkuCount = matchRes.matchedCount;
      result.unmatchedSkuCount = matchRes.unmatchedCount;
      matchedItems = matchRes.matchedItems;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`SKU eşleştirme hatası: ${msg}`);
      logger.error(`[MarketplaceAutomation] SKU match failed for order ${order.externalId}: ${msg}`);
    }

    // Step 3: Sales Order Creation
    if (policy.autoCreateSalesOrder && contactId && matchedItems.length > 0) {
      try {
        const salesOrder = await this.ensureSalesOrder(tenantId, order, contactId, matchedItems);
        result.salesOrderId = salesOrder.id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Satış siparişi oluşturma hatası: ${msg}`);
        logger.error(`[MarketplaceAutomation] Sales order creation failed for order ${order.externalId}: ${msg}`);
      }
    }

    // Step 4: Inventory Reservation
    if (policy.autoReserveStock && matchedItems.length > 0 && result.salesOrderId) {
      try {
        const reservationIds = await this.ensureInventoryReservations(tenantId, order, result.salesOrderId, matchedItems);
        result.reservationIds = reservationIds;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Stok rezervasyon hatası: ${msg}`);
        logger.error(`[MarketplaceAutomation] Stock reservation failed for order ${order.externalId}: ${msg}`);
      }
    }

    // Step 5: Sync Status changes to ERP
    try {
      await this.syncOrderStatusToErp(tenantId, order);
      result.statusSynced = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Sipariş durum senkronizasyon hatası: ${msg}`);
      logger.error(`[MarketplaceAutomation] Status sync failed for order ${order.externalId}: ${msg}`);
    }

    return result;
  }

  /**
   * Two-Way Sync: ERP Stock Change -> Push Stock Update to Marketplace
   */
  async syncErpStockToMarketplaces(tenantId: string, productId: string): Promise<{ syncedListings: number; errors: string[] }> {
    const policy = await this.getPolicy(tenantId);
    if (!policy.autoSyncErpStockToMarketplace) {
      return { syncedListings: 0, errors: [] };
    }

    const errors: string[] = [];
    const product = await this.db.product.findFirst({
      where: { id: productId, tenantId },
      select: {
        id: true,
        code: true,
        barcode: true,
        name: true,
        salesPrice: true,
        stockLevels: { select: { quantity: true } },
      },
    });

    if (!product) return { syncedListings: 0, errors: ['Product not found'] };

    const totalStock = product.stockLevels.reduce((sum, sl) => sum + Number(sl.quantity), 0);

    const listings = await this.db.marketplaceListing.findMany({
      where: {
        tenantId,
        productId: product.id,
        integration: { isActive: true },
      },
      include: {
        integration: true,
      },
    });

    if (listings.length === 0) {
      return { syncedListings: 0, errors: [] };
    }

    let syncedCount = 0;

    for (const listing of listings) {
      const barcode = product.barcode ?? listing.externalSku ?? listing.externalId;
      if (!barcode) continue;

      try {
        const creds = buildTrendyolCredentials(listing.integration);
        if (!creds) continue;

        const salePrice = Number(listing.price ?? product.salesPrice ?? 0);
        const listPrice = salePrice;

        const batchRes = await TrendyolService.updatePriceAndInventory(creds, [
          {
            barcode,
            quantity: Math.max(0, totalStock),
            salePrice,
            listPrice,
          },
        ]);

        // Update Snapshot
        await this.db.marketplaceListingSnapshot.upsert({
          where: { listingId: listing.id },
          create: {
            tenantId,
            listingId: listing.id,
            lastSentQty: new Prisma.Decimal(totalStock),
            lastSentSalePrice: new Prisma.Decimal(salePrice),
            lastSentListPrice: new Prisma.Decimal(listPrice),
            lastSentAt: new Date(),
            batchRequestId: batchRes.batchRequestId,
          },
          update: {
            lastSentQty: new Prisma.Decimal(totalStock),
            lastSentSalePrice: new Prisma.Decimal(salePrice),
            lastSentListPrice: new Prisma.Decimal(listPrice),
            lastSentAt: new Date(),
            batchRequestId: batchRes.batchRequestId,
          },
        });

        syncedCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Listing ${listing.id} (${barcode}) sync error: ${msg}`);
        logger.error(`[MarketplaceAutomation] Stock sync error for listing ${listing.id}: ${msg}`);
      }
    }

    return { syncedListings: syncedCount, errors };
  }

  async getAutomationSummary(tenantId: string): Promise<MarketplaceAutomationSummary> {
    const policy = await this.getPolicy(tenantId);

    const [totalMarketplaceOrders, matchedContactCount, salesOrderCount, reservationCount, unmatchedItems] = await Promise.all([
      this.db.marketplaceOrder.count({ where: { tenantId } }),
      this.db.contact.count({ where: { tenantId, notes: { contains: 'PAZARYERİ' } } }),
      this.db.salesOrder.count({ where: { tenantId, notes: { contains: 'Pazaryeri Siparişi' } } }),
      this.db.inventoryReservation.count({ where: { tenantId, notes: { contains: 'Pazaryeri' } } }),
      this.db.marketplaceOrderItem.count({ where: { tenantId, productId: null } }),
    ]);

    return {
      policy,
      totalMarketplaceOrders,
      matchedContactCount,
      salesOrderCount,
      reservationCount,
      unmatchedSkuCount: unmatchedItems,
    };
  }

  // ── Helper Methods ──────────────────────────────

  private async matchOrCreateContact(
    tenantId: string,
    order: MarketplaceOrder,
    autoCreate: boolean,
  ): Promise<string | null> {
    const name = order.customerName?.trim() || `Pazaryeri Müşterisi (${order.externalId})`;
    const email = order.customerEmail?.trim() || null;
    const phone = order.customerPhone?.trim() || null;

    let contact = await this.db.contact.findFirst({
      where: {
        tenantId,
        OR: [
          ...(email ? [{ email }] : []),
          ...(phone ? [{ phone }] : []),
          { name: { equals: name, mode: 'insensitive' as Prisma.QueryMode } },
        ],
      },
      select: { id: true },
    });

    if (contact) return contact.id;

    if (!autoCreate) return null;

    const count = await this.db.contact.count({ where: { tenantId } });
    const code = `CARİ-PAZAR-${String(count + 1).padStart(5, '0')}`;

    const newContact = await this.db.contact.create({
      data: {
        tenantId,
        code,
        name,
        type: ContactType.CUSTOMER,
        email,
        phone,
        address: order.shippingAddress,
        notes: `Otomatik Pazaryeri Carisi (${order.channel} - Sipariş #${order.externalId})`,
      },
      select: { id: true },
    });

    return newContact.id;
  }

  private async matchOrderSkus(
    tenantId: string,
    items: MarketplaceOrderItem[],
  ): Promise<{
    matchedCount: number;
    unmatchedCount: number;
    matchedItems: Array<{ item: MarketplaceOrderItem; productId: string; price: number }>;
  }> {
    let matchedCount = 0;
    let unmatchedCount = 0;
    const matchedItems: Array<{ item: MarketplaceOrderItem; productId: string; price: number }> = [];

    for (const item of items) {
      if (item.productId) {
        matchedCount++;
        matchedItems.push({ item, productId: item.productId, price: Number(item.unitPrice) });
        continue;
      }

      const sku = item.externalProductId.trim();
      const product = await this.db.product.findFirst({
        where: {
          tenantId,
          OR: [
            { barcode: sku },
            { code: sku },
            { name: { equals: item.name, mode: 'insensitive' as Prisma.QueryMode } },
          ],
        },
        select: { id: true },
      });

      if (product) {
        matchedCount++;
        matchedItems.push({ item, productId: product.id, price: Number(item.unitPrice) });

        await this.db.marketplaceOrderItem.update({
          where: { id: item.id },
          data: { productId: product.id },
        });
      } else {
        unmatchedCount++;
      }
    }

    return { matchedCount, unmatchedCount, matchedItems };
  }

  private async ensureSalesOrder(
    tenantId: string,
    order: MarketplaceOrder,
    contactId: string,
    matchedItems: Array<{ item: MarketplaceOrderItem; productId: string; price: number }>,
  ): Promise<{ id: string }> {
    const existingRef = `Pazaryeri Siparişi #${order.externalId}`;
    const existing = await this.db.salesOrder.findFirst({
      where: { tenantId, notes: { contains: existingRef } },
      select: { id: true },
    });

    if (existing) return existing;

    const count = await this.db.salesOrder.count({ where: { tenantId } });
    const number = `SIP-PAZAR-${String(count + 1).padStart(5, '0')}`;

    const items = matchedItems.map(({ item, productId, price }) => {
      const qty = item.quantity;
      const total = price * qty;
      const vatAmount = total * 0.2;
      return {
        tenantId,
        productId,
        quantity: new Prisma.Decimal(qty),
        unitPrice: new Prisma.Decimal(price),
        taxRate: new Prisma.Decimal(20),
        taxAmount: new Prisma.Decimal(vatAmount),
        lineTotal: new Prisma.Decimal(total),
      };
    });

    const totalNet = items.reduce((sum, i) => sum + Number(i.lineTotal), 0);
    const totalTax = items.reduce((sum, i) => sum + Number(i.taxAmount), 0);
    const totalGross = totalNet + totalTax;

    const created = await this.db.salesOrder.create({
      data: {
        tenantId,
        contactId,
        number,
        date: order.orderDate,
        status: OrderStatus.CONFIRMED,
        totalNet: new Prisma.Decimal(totalNet),
        totalTax: new Prisma.Decimal(totalTax),
        totalGross: new Prisma.Decimal(totalGross),
        notes: `${existingRef} (${order.channel})`,
        items: {
          create: items,
        },
      },
      select: { id: true },
    });

    return created;
  }

  private async ensureInventoryReservations(
    tenantId: string,
    order: MarketplaceOrder,
    salesOrderId: string,
    matchedItems: Array<{ item: MarketplaceOrderItem; productId: string; price: number }>,
  ): Promise<string[]> {
    const warehouse = await this.db.warehouse.findFirst({
      where: { tenantId },
      select: { id: true },
    });

    if (!warehouse) return [];

    const reservationIds: string[] = [];

    for (const { item, productId } of matchedItems) {
      const note = `Pazaryeri Rezerve (#${order.externalId})`;
      const existing = await this.db.inventoryReservation.findFirst({
        where: { tenantId, productId, refId: salesOrderId },
        select: { id: true },
      });

      if (existing) {
        reservationIds.push(existing.id);
        continue;
      }

      const created = await this.db.inventoryReservation.create({
        data: {
          tenantId,
          productId,
          warehouseId: warehouse.id,
          quantity: new Prisma.Decimal(item.quantity),
          refType: ReservationRefType.SALES_ORDER,
          refId: salesOrderId,
          notes: note,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        select: { id: true },
      });

      reservationIds.push(created.id);
    }

    return reservationIds;
  }

  private async syncOrderStatusToErp(tenantId: string, order: MarketplaceOrder): Promise<void> {
    const existingRef = `Pazaryeri Siparişi #${order.externalId}`;
    const salesOrder = await this.db.salesOrder.findFirst({
      where: { tenantId, notes: { contains: existingRef } },
      select: { id: true, status: true },
    });

    if (!salesOrder) return;

    if (order.status === MarketplaceOrderStatus.CANCELLED) {
      if (salesOrder.status !== OrderStatus.CANCELLED) {
        await this.db.salesOrder.update({
          where: { id: salesOrder.id },
          data: { status: OrderStatus.CANCELLED },
        });

        await this.db.inventoryReservation.updateMany({
          where: { tenantId, refId: salesOrder.id },
          data: { releasedAt: new Date() },
        });
      }
    } else if (order.status === MarketplaceOrderStatus.DELIVERED) {
      if (salesOrder.status !== OrderStatus.DELIVERED) {
        await this.db.salesOrder.update({
          where: { id: salesOrder.id },
          data: { status: OrderStatus.DELIVERED },
        });
      }
    }
  }
}
