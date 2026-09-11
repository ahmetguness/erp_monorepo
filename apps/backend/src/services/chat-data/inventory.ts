import { prisma } from '../../lib/prisma';
import { PurchaseRequestStatus } from '@prisma/client';
import { generateDocumentNumber } from '../../utils/generate-number.js';
import type { LowStockPurchaseRequestOptions } from './shared.js';

export const inventoryChatDataService = {
  async getStock(tenantId: string) {
    const stockLevels = await prisma.stockLevel.findMany({
      where: { tenantId, quantity: { gt: 0 } },
      include: {
        product: { select: { code: true, name: true, minStockLevel: true, averageCost: true } },
        warehouse: { select: { name: true } },
      },
      take: 50,
    });

    const belowMin = stockLevels.filter(
      (sl) => Number(sl.quantity) < Number(sl.product.minStockLevel),
    );

    return {
      data: {
        totalItems: stockLevels.length,
        belowMinStockCount: belowMin.length,
        totalStockValue: stockLevels.reduce(
          (s, sl) => s + Number(sl.quantity) * Number(sl.product.averageCost), 0,
        ),
        belowMinStock: belowMin.map((sl) => ({
          product: sl.product.name, warehouse: sl.warehouse.name,
          quantity: Number(sl.quantity), minLevel: Number(sl.product.minStockLevel),
        })),
      },
    };
  },

  /** Belirli cari için son faturaları özetler */
  async createPurchaseRequestFromLowStock(tenantId: string, options: LowStockPurchaseRequestOptions = {}) {
    const safeLimit = Math.max(1, Math.min(options.limit ?? 10, 25));

    const stockLevels = await prisma.stockLevel.findMany({
      where: {
        tenantId,
        product: {
          tenantId,
          deletedAt: null,
          isActive: true,
          minStockLevel: { gt: 0 },
        },
      },
      select: {
        productId: true,
        quantity: true,
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            minStockLevel: true,
            purchasePrice: true,
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: 250,
    });

    const byProduct = new Map<
      string,
      {
        productId: string;
        code: string;
        name: string;
        minStockLevel: number;
        purchasePrice: number;
        quantity: number;
      }
    >();

    for (const level of stockLevels) {
      const current = byProduct.get(level.productId);
      const quantity = Number(level.quantity);
      if (current) {
        current.quantity += quantity;
      } else {
        byProduct.set(level.productId, {
          productId: level.product.id,
          code: level.product.code,
          name: level.product.name,
          minStockLevel: Number(level.product.minStockLevel),
          purchasePrice: Number(level.product.purchasePrice),
          quantity,
        });
      }
    }

    const quantityOverrides = new Map(
      (options.adjustments ?? [])
        .filter((adjustment) => adjustment.productCode.trim() && Number.isFinite(adjustment.quantity))
        .map((adjustment) => [adjustment.productCode.trim().toLowerCase(), Math.max(0, Math.ceil(adjustment.quantity))]),
    );

    const items = [...byProduct.values()]
      .map((item) => ({
        ...item,
        suggestedQuantity: quantityOverrides.get(item.code.toLowerCase()) ?? Math.max(0, Math.ceil(item.minStockLevel - item.quantity)),
      }))
      .filter((item) => item.suggestedQuantity > 0)
      .sort((a, b) => b.suggestedQuantity - a.suggestedQuantity)
      .slice(0, safeLimit);

    if (items.length === 0) {
      return {
        created: false,
        message: 'Minimum stok seviyesinin altında ürün bulunamadı; satın alma talebi oluşturulmadı.',
      };
    }

    const totalEstimated = items.reduce((sum, item) => sum + item.purchasePrice * item.suggestedQuantity, 0);
    const previewItems = items.map((item) => ({
      product: item.name,
      code: item.code,
      currentQuantity: item.quantity,
      minStockLevel: item.minStockLevel,
      suggestedQuantity: item.suggestedQuantity,
      unitPrice: item.purchasePrice,
      lineEstimated: item.purchasePrice * item.suggestedQuantity,
    }));

    if (!options.confirmed) {
      return {
        created: false,
        confirmationRequired: true,
        summary: {
          itemCount: items.length,
          totalEstimated: totalEstimated > 0 ? totalEstimated : null,
        },
        items: previewItems,
        message:
          `${items.length} kalem icin toplam tahmini ${totalEstimated.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })} tutarinda taslak satin alma talebi hazirlanacak. ` +
          'Olusturmadan once onaylayin; isterseniz kalem sayisini veya urun adetlerini degistirebilirsiniz.',
        nextAction: 'Onayliyorsaniz "Onayla ve taslagi olustur" yazin. Degisiklik icin ornek: "Ilk 4 kalem olsun" veya "P004 adetini 6 yap".',
      };
    }

    const number = await generateDocumentNumber(tenantId, 'purchase_request', 'PR-', 'purchaseRequest');

    const request = await prisma.purchaseRequest.create({
      data: {
        tenantId,
        number,
        date: new Date(),
        status: PurchaseRequestStatus.DRAFT,
        notes: options.note?.trim() || 'AI önerisi: kritik stok seviyesinin altındaki ürünler için otomatik taslak.',
        totalEstimated: totalEstimated > 0 ? totalEstimated : null,
        items: {
          create: items.map((item) => ({
            tenantId,
            productId: item.productId,
            description: `${item.code} - ${item.name}`,
            quantity: item.suggestedQuantity,
            unitPrice: item.purchasePrice > 0 ? item.purchasePrice : null,
          })),
        },
      },
      include: {
        items: {
          include: {
            product: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    return {
      created: true,
      request: {
        id: request.id,
        number: request.number,
        status: request.status,
        itemCount: request.items.length,
        totalEstimated: request.totalEstimated ? Number(request.totalEstimated) : null,
      },
      items: previewItems,
      nextAction: 'Satın alma talepleri ekranında taslağı inceleyip onay akışına gönderebilirsiniz.',
    };
  },

  /** Satış siparişleri */
  async getProducts(tenantId: string, search?: string) {
    const products = await prisma.product.findMany({
      where: {
        tenantId, deletedAt: null, isActive: true,
        ...(search && { OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { code: { contains: search, mode: 'insensitive' as const } },
        ] }),
      },
      select: {
        code: true, name: true, salesPrice: true, purchasePrice: true,
        minStockLevel: true,
        category: { select: { name: true } },
        unit: { select: { code: true } },
      },
      orderBy: { name: 'asc' },
      take: 30,
    });
    return { data: products, count: products.length };
  },

  /** Cari hesap detayı (isimle arama) */
  async getStockMovements(tenantId: string, productName?: string) {
    const movements = await prisma.stockMovement.findMany({
      where: {
        tenantId,
        ...(productName && { product: { name: { contains: productName, mode: 'insensitive' as const } } }),
      },
      select: {
        type: true, quantity: true, unitCost: true, notes: true, createdAt: true,
        product: { select: { name: true, code: true } },
        fromWarehouse: { select: { name: true } },
        toWarehouse: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return { data: movements, count: movements.length };
  },

  // ── PROFESSIONAL — Ek tool'lar ─────────────

  /** Satış teklifleri */
} as const;
