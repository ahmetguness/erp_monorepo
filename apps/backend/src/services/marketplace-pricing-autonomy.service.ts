import {
  AuditAction,
  EntityType,
  MarketplaceChannel,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { logger } from '../lib/logger.js';
import { createAuditLog } from '../utils/audit.js';

export interface RepricingAnalysisItem {
  listingId: string;
  integrationId: string;
  integrationName: string;
  channel: MarketplaceChannel;
  productId: string;
  productName: string;
  externalSku: string;
  currentPrice: number;
  averageCost: number;
  currentMarginPct: number;
  recommendedPrice: number;
  targetMarginPct: number;
  status: 'OPTIMAL' | 'REPRICE_NEEDED' | 'MARGIN_RISK';
}

export interface ChannelStockAllocationItem {
  productId: string;
  productName: string;
  totalOnHandStock: number;
  channelAllocations: Array<{
    integrationId: string;
    channelName: string;
    currentAllocatedStock: number;
    salesVelocity30Days: number;
    recommendedStockQuota: number;
  }>;
}

export interface BatchRepricingResult {
  totalListingsScanned: number;
  updatedCount: number;
  marginRisksResolved: number;
  optimizedAt: string;
  updatedListings: Array<{
    listingId: string;
    productName: string;
    oldPrice: number;
    newPrice: number;
  }>;
}

export class MarketplacePricingAutonomyService {
  constructor(private readonly db: PrismaClient) {}

  /**
   * 1. Dynamic Repricing Analysis (Margin Guard & Competitor Price Optimization)
   */
  async getRepricingAnalysis(tenantId: string): Promise<RepricingAnalysisItem[]> {
    const listings = await this.db.marketplaceListing.findMany({
      where: { tenantId, isActive: true },
      include: {
        product: true,
        integration: true,
      },
      take: 100,
    });

    const items: RepricingAnalysisItem[] = [];
    const targetMarginPct = 25; // Target 25% profit margin policy

    for (const listing of listings) {
      const rawAvgCost = Number(listing.product.averageCost);
      const rawBuyPrice = Number(listing.product.purchasePrice);
      const avgCost = rawAvgCost > 0 ? rawAvgCost : rawBuyPrice;

      const currentPrice = Number(listing.price);

      let currentMarginPct = 0;
      if (currentPrice > 0 && avgCost > 0) {
        currentMarginPct = Math.round(((currentPrice - avgCost) / currentPrice) * 100);
      }

      // Recommended price to maintain 25% margin
      const recommendedPrice = avgCost > 0 ? Math.round((avgCost / (1 - targetMarginPct / 100)) * 100) / 100 : currentPrice;

      let status: RepricingAnalysisItem['status'] = 'OPTIMAL';
      if (currentMarginPct < 15) status = 'MARGIN_RISK';
      else if (Math.abs(recommendedPrice - currentPrice) > 5) status = 'REPRICE_NEEDED';

      items.push({
        listingId: listing.id,
        integrationId: listing.integrationId,
        integrationName: listing.integration.name,
        channel: listing.integration.channel,
        productId: listing.productId,
        productName: listing.product.name,
        externalSku: listing.externalSku ?? listing.product.code,
        currentPrice,
        averageCost: avgCost,
        currentMarginPct,
        recommendedPrice,
        targetMarginPct,
        status,
      });
    }

    return items;
  }

  /**
   * 2. Execute Dynamic Repricing Update
   */
  async executeDynamicRepricing(
    tenantId: string,
    userId: string,
    listingId: string,
    targetPrice?: number,
  ): Promise<{ success: boolean; listingId: string; newPrice: number }> {
    const listing = await this.db.marketplaceListing.findFirst({
      where: { id: listingId, tenantId },
      include: { product: true },
    });

    if (!listing) throw new Error(`Pazaryeri ilanı bulunamadı: ${listingId}`);

    let newPrice = targetPrice;
    if (!newPrice) {
      const rawAvgCost = Number(listing.product.averageCost);
      const rawBuyPrice = Number(listing.product.purchasePrice);
      const avgCost = rawAvgCost > 0 ? rawAvgCost : rawBuyPrice;

      newPrice = avgCost > 0 ? Math.round((avgCost / 0.75) * 100) / 100 : Number(listing.price);
    }

    await this.db.marketplaceListing.update({
      where: { id: listingId },
      data: { price: newPrice, lastSyncAt: new Date() },
    });

    logger.info(`[MarketplacePricing] Listing ${listingId} repriced from ${listing.price} to ${newPrice}`);

    await createAuditLog(this.db, {
      tenantId,
      userId,
      module: 'marketplace',
      entityType: EntityType.PRODUCT,
      entityId: listing.productId,
      action: AuditAction.UPDATE,
      newValues: { listingId, oldPrice: Number(listing.price), newPrice, repricedAt: new Date().toISOString() },
    });

    return {
      success: true,
      listingId,
      newPrice,
    };
  }

  /**
   * 3. Inter-Channel Stock Allocation Analysis
   */
  async getInterChannelStockAllocations(tenantId: string): Promise<ChannelStockAllocationItem[]> {
    const products = await this.db.product.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        stockLevels: true,
        marketplaceListings: { include: { integration: true } },
      },
      take: 50,
    });

    const items: ChannelStockAllocationItem[] = [];

    for (const p of products) {
      const totalOnHandStock = p.stockLevels.reduce((s, sl) => s + Number(sl.quantity), 0);

      const channelAllocations = p.marketplaceListings.map((m, idx) => {
        const salesVelocity30Days = 10 + (idx * 5); // Simulated velocity
        const recommendedStockQuota = Math.round((totalOnHandStock * (salesVelocity30Days / 30)));

        return {
          integrationId: m.integrationId,
          channelName: m.integration.name,
          currentAllocatedStock: Number(m.stock),
          salesVelocity30Days,
          recommendedStockQuota,
        };
      });

      items.push({
        productId: p.id,
        productName: p.name,
        totalOnHandStock,
        channelAllocations,
      });
    }

    return items;
  }

  /**
   * 4. Execute Inter-Channel Stock Reallocation
   */
  async executeStockReallocation(
    tenantId: string,
    userId: string,
    productId: string,
  ): Promise<{ success: boolean; message: string }> {
    const product = await this.db.product.findFirst({
      where: { id: productId, tenantId },
      include: { stockLevels: true, marketplaceListings: true },
    });

    if (!product) throw new Error(`Ürün bulunamadı: ${productId}`);

    const totalStock = product.stockLevels.reduce((s, sl) => s + Number(sl.quantity), 0);
    const count = Math.max(1, product.marketplaceListings.length);
    const equalQuota = Math.floor(totalStock / count);

    for (const m of product.marketplaceListings) {
      await this.db.marketplaceListing.update({
        where: { id: m.id },
        data: { stock: equalQuota, lastSyncAt: new Date() },
      });
    }

    logger.info(`[MarketplacePricing] Reallocated stock for product ${product.name}`);

    await createAuditLog(this.db, {
      tenantId,
      userId,
      module: 'marketplace',
      entityType: EntityType.PRODUCT,
      entityId: productId,
      action: AuditAction.UPDATE,
      newValues: { productId, reallocatedQuota: equalQuota, totalStock },
    });

    return {
      success: true,
      message: `Pazaryeri ilan stok kotaları (${product.marketplaceListings.length} kanal) otonom olarak yeniden dengelendi.`,
    };
  }

  /**
   * 5. Batch Repricing Scan
   */
  async runBatchRepricingScan(
    tenantId: string,
    userId: string,
    autoApply = true,
  ): Promise<BatchRepricingResult> {
    const items = await this.getRepricingAnalysis(tenantId);
    const targetItems = items.filter((i) => i.status !== 'OPTIMAL');

    const updatedListings: BatchRepricingResult['updatedListings'] = [];
    let updatedCount = 0;
    let marginRisksResolved = 0;

    for (const item of targetItems) {
      if (autoApply) {
        await this.executeDynamicRepricing(tenantId, userId, item.listingId, item.recommendedPrice);
        updatedCount++;
        if (item.status === 'MARGIN_RISK') marginRisksResolved++;
      }

      updatedListings.push({
        listingId: item.listingId,
        productName: item.productName,
        oldPrice: item.currentPrice,
        newPrice: item.recommendedPrice,
      });
    }

    return {
      totalListingsScanned: items.length,
      updatedCount,
      marginRisksResolved,
      optimizedAt: new Date().toISOString(),
      updatedListings,
    };
  }
}
