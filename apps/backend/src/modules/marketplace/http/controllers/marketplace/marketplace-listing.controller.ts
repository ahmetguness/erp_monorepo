import { MarketplaceChannel,Prisma } from '@prisma/client';
import { Context } from 'hono';
import { ConflictError,NotFoundError,ValidationError } from '../../../../../errors/index.js';
import { prisma } from '../../../../../lib/prisma.js';
import {
TrendyolService,
buildTrendyolCredentials,
} from '../../../../../services/trendyol.service.js';
import { requireParam,requireTenantId } from '../../../../../utils/context.js';
import { getPaginationParams } from '../../../../../utils/pagination.js';
import type { MarketplaceListingActionResult,TrendyolListingProductDTO } from './shared.js';
import { toTrendyolProductItem } from './shared.js';

export const MarketplaceListingController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const { page, limit, skip } = getPaginationParams(c, 20);
    const integrationId = c.req.query('integrationId');

    const where = { tenantId, ...(integrationId && { integrationId }) };

    const [total, data] = await prisma.$transaction([
      prisma.marketplaceListing.count({ where }),
      prisma.marketplaceListing.findMany({
        where,
        include: {
          product: { select: { id: true, code: true, name: true, salesPrice: true } },
          integration: { select: { id: true, channel: true, name: true } },
        },
        orderBy: { lastSyncAt: 'desc' },
        skip: skip,
        take: limit,
      }),
    ]);

    return c.json({ data, meta: { total, page, pageSize: limit, totalPages: Math.ceil(total / limit) } });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{
      integrationId: string; productId: string; externalId: string;
      externalSku?: string; price: number; stock?: number;
    }>().catch(() => null);
    if (!body || typeof body.integrationId !== 'string' || typeof body.productId !== 'string' || typeof body.externalId !== 'string' || body.price == null) {
      return c.json(new ValidationError('integrationId, productId, externalId ve price zorunludur.').toJSON(), 400);
    }
    body.integrationId = body.integrationId.trim(); body.productId = body.productId.trim(); body.externalId = body.externalId.trim();
    if (!body.integrationId || !body.productId || !body.externalId || body.externalId.length > 255) return c.json(new ValidationError('Kimlik alanları boş olamaz; externalId en fazla 255 karakter olabilir.').toJSON(), 400);
    if (!isValidPrice(body.price) || (body.stock !== undefined && !isValidStock(body.stock))) return c.json(new ValidationError('price pozitif, stock negatif olmayan geçerli bir sayı olmalıdır.').toJSON(), 400);
    if (body.externalSku !== undefined && (typeof body.externalSku !== 'string' || body.externalSku.trim().length > 255)) return c.json(new ValidationError('externalSku en fazla 255 karakter olmalıdır.').toJSON(), 400);

    const [integration, product] = await prisma.$transaction([
      prisma.marketplaceIntegration.findFirst({ where: { id: body.integrationId, tenantId } }),
      prisma.product.findFirst({ where: { id: body.productId, tenantId } }),
    ]);
    if (!integration) return c.json(new NotFoundError('Entegrasyon', body.integrationId).toJSON(), 404);
    if (!product) return c.json(new NotFoundError('Ürün', body.productId).toJSON(), 404);
    if (!integration.isActive) return c.json(new ValidationError('Entegrasyon pasif.').toJSON(), 400);

    let listing;
    try {
      listing = await prisma.marketplaceListing.create({
        data: {
          tenantId, integrationId: body.integrationId, productId: body.productId,
          externalId: body.externalId, externalSku: body.externalSku?.trim() || null,
          price: body.price, stock: body.stock ?? 0,
        },
        include: { product: { select: { id: true, code: true, name: true } } },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return c.json(new ConflictError('Bu entegrasyonda externalId zaten kullanılıyor.').toJSON(), 409);
      throw error;
    }
    return c.json({ data: listing }, 201);
  },

  async publishToMarketplace(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const listing = await prisma.marketplaceListing.findFirst({
      where: { id, tenantId },
      include: {
        integration: true,
        product: {
          select: { code: true, name: true, barcode: true, description: true, imageUrl: true },
        },
      },
    });
    if (!listing) return c.json(new NotFoundError('Listeleme', id).toJSON(), 404);
    if (listing.integration.channel !== MarketplaceChannel.TRENDYOL) {
      return c.json(new ValidationError('Bu aksiyon şu anda sadece Trendyol entegrasyonu için desteklenir.').toJSON(), 400);
    }
    if (!listing.integration.isActive) return c.json(new ValidationError('Entegrasyon pasif.').toJSON(), 400);

    const body = await c.req.json<TrendyolListingProductDTO>().catch(() => null);
    if (!body) return c.json(new ValidationError('Geçersiz istek gövdesi.').toJSON(), 400);
    const validation = validateTrendyolBody(body);
    if (validation) return c.json(validation.toJSON(), 400);
    const item = toTrendyolProductItem(listing, body);

    try {
      const creds = buildTrendyolCredentials(listing.integration);
      const batch = await TrendyolService.createProducts(creds, [item]);
      const updated = await prisma.marketplaceListing.update({
        where: { id },
        data: {
          externalId: item.barcode,
          externalSku: item.stockCode,
          price: item.salePrice,
          stock: item.quantity,
          isActive: true,
          lastSyncAt: new Date(),
          syncError: null,
        },
        include: {
          product: { select: { id: true, code: true, name: true, salesPrice: true } },
          integration: { select: { id: true, channel: true, name: true } },
        },
      });
      const result: MarketplaceListingActionResult = { batchRequestId: batch.batchRequestId, listing: updated };
      return c.json({ data: result }, 202);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.marketplaceListing.update({ where: { id }, data: { syncError: message } });
      return c.json(new ValidationError(message).toJSON(), 502);
    }
  },

  async updateMarketplaceProduct(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const listing = await prisma.marketplaceListing.findFirst({
      where: { id, tenantId },
      include: {
        integration: true,
        product: {
          select: { code: true, name: true, barcode: true, description: true, imageUrl: true },
        },
      },
    });
    if (!listing) return c.json(new NotFoundError('Listeleme', id).toJSON(), 404);
    if (listing.integration.channel !== MarketplaceChannel.TRENDYOL) {
      return c.json(new ValidationError('Bu aksiyon şu anda sadece Trendyol entegrasyonu için desteklenir.').toJSON(), 400);
    }
    if (!listing.integration.isActive) return c.json(new ValidationError('Entegrasyon pasif.').toJSON(), 400);

    const body = await c.req.json<TrendyolListingProductDTO>().catch(() => null);
    if (!body) return c.json(new ValidationError('Geçersiz istek gövdesi.').toJSON(), 400);
    const validation = validateTrendyolBody(body);
    if (validation) return c.json(validation.toJSON(), 400);
    const item = toTrendyolProductItem(listing, body);

    try {
      const creds = buildTrendyolCredentials(listing.integration);
      const batch = await TrendyolService.updateProducts(creds, [item]);
      const updated = await prisma.marketplaceListing.update({
        where: { id },
        data: {
          externalId: item.barcode,
          externalSku: item.stockCode,
          price: item.salePrice,
          stock: item.quantity,
          lastSyncAt: new Date(),
          syncError: null,
        },
        include: {
          product: { select: { id: true, code: true, name: true, salesPrice: true } },
          integration: { select: { id: true, channel: true, name: true } },
        },
      });
      const result: MarketplaceListingActionResult = { batchRequestId: batch.batchRequestId, listing: updated };
      return c.json({ data: result }, 202);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.marketplaceListing.update({ where: { id }, data: { syncError: message } });
      return c.json(new ValidationError(message).toJSON(), 502);
    }
  },

  async deleteMarketplaceProduct(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const listing = await prisma.marketplaceListing.findFirst({
      where: { id, tenantId },
      include: { integration: true, product: { select: { barcode: true } } },
    });
    if (!listing) return c.json(new NotFoundError('Listeleme', id).toJSON(), 404);
    if (listing.integration.channel !== MarketplaceChannel.TRENDYOL) {
      return c.json(new ValidationError('Bu aksiyon şu anda sadece Trendyol entegrasyonu için desteklenir.').toJSON(), 400);
    }
    if (!listing.integration.isActive) return c.json(new ValidationError('Entegrasyon pasif.').toJSON(), 400);

    const body = await c.req.json<{ barcode?: string }>().catch((): { barcode?: string } => ({}));
    const barcode = (body.barcode ?? listing.externalId ?? listing.product.barcode ?? '').trim();
    if (!barcode || barcode.length > 255) return c.json(new ValidationError('Geçerli bir barcode zorunludur.').toJSON(), 400);

    try {
      const creds = buildTrendyolCredentials(listing.integration);
      const batch = await TrendyolService.deleteProducts(creds, [{ barcode }]);
      const updated = await prisma.marketplaceListing.update({
        where: { id },
        data: { isActive: false, lastSyncAt: new Date(), syncError: null },
        include: {
          product: { select: { id: true, code: true, name: true, salesPrice: true } },
          integration: { select: { id: true, channel: true, name: true } },
        },
      });
      const result: MarketplaceListingActionResult = { batchRequestId: batch.batchRequestId, listing: updated };
      return c.json({ data: result }, 202);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await prisma.marketplaceListing.update({ where: { id }, data: { syncError: message } });
      return c.json(new ValidationError(message).toJSON(), 502);
    }
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.marketplaceListing.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Listeleme', id).toJSON(), 404);

    const body = await c.req.json<{ price?: number; stock?: number; isActive?: boolean; externalSku?: string }>().catch(() => null);
    if (!body || !['price', 'stock', 'isActive', 'externalSku'].some((key) => key in body)) return c.json(new ValidationError('Güncellenecek alan zorunludur.').toJSON(), 400);
    if (body.price !== undefined && !isValidPrice(body.price)) return c.json(new ValidationError('price pozitif ve en fazla 2 ondalıklı olmalıdır.').toJSON(), 400);
    if (body.stock !== undefined && !isValidStock(body.stock)) return c.json(new ValidationError('stock negatif olamaz ve en fazla 3 ondalıklı olabilir.').toJSON(), 400);
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') return c.json(new ValidationError('isActive boolean olmalıdır.').toJSON(), 400);
    if (body.externalSku !== undefined && (typeof body.externalSku !== 'string' || body.externalSku.trim().length > 255)) return c.json(new ValidationError('externalSku en fazla 255 karakter olmalıdır.').toJSON(), 400);
    const updated = await prisma.marketplaceListing.update({
      where: { id },
      data: {
        ...(body.price !== undefined && { price: body.price }),
        ...(body.stock !== undefined && { stock: body.stock }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.externalSku !== undefined && { externalSku: body.externalSku.trim() || null }),
      },
    });
    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');

    const existing = await prisma.marketplaceListing.findFirst({ where: { id, tenantId } });
    if (!existing) return c.json(new NotFoundError('Listeleme', id).toJSON(), 404);

    await prisma.marketplaceListing.delete({ where: { id } });
    return c.json({ data: { success: true } });
  },
};

function isValidPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 9999999999999999 && Math.round(value * 100) === value * 100;
}

function isValidStock(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 999999999999999 && Math.round(value * 1000) === value * 1000;
}

function validateTrendyolBody(body: TrendyolListingProductDTO): ValidationError | null {
  if (!Number.isInteger(body.brandId) || body.brandId <= 0 || !Number.isInteger(body.categoryId) || body.categoryId <= 0 || !Number.isInteger(body.cargoCompanyId) || body.cargoCompanyId <= 0) return new ValidationError('brandId, categoryId ve cargoCompanyId pozitif tam sayı olmalıdır.');
  for (const [key, value] of [['quantity', body.quantity], ['dimensionalWeight', body.dimensionalWeight], ['listPrice', body.listPrice], ['salePrice', body.salePrice], ['vatRate', body.vatRate]] as const) {
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return new ValidationError(`${key} negatif olmayan geçerli bir sayı olmalıdır.`);
  }
  if (body.salePrice !== undefined && body.salePrice <= 0) return new ValidationError('salePrice pozitif olmalıdır.');
  if (body.listPrice !== undefined && body.salePrice !== undefined && body.listPrice < body.salePrice) return new ValidationError('listPrice salePrice değerinden küçük olamaz.');
  return null;
}

// ─────────────────────────────────────────────
// Marketplace Order Controller
// ─────────────────────────────────────────────
