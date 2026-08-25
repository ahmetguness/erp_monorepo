import { MarketplaceChannel,Prisma } from '@prisma/client';
import { ValidationError } from '../../../../../errors/index.js';
import { prisma } from '../../../../../lib/prisma.js';
import { MarketplaceAutomationService } from '../../../../../services/marketplace-automation.service.js';
import { MarketplaceMonitoringService } from '../../../../../services/marketplace-monitoring.service.js';
import type { JobParams } from '../../../../../services/trendyol-worker.service.js';
import type { TrendyolProductItemInput } from '../../../../../services/trendyol.service.js';

export const marketplaceMonitoringService = new MarketplaceMonitoringService(prisma);
export const marketplaceAutomationService = new MarketplaceAutomationService(prisma);

export type IntegrationWithSecrets = {
  apiKey: string | null;
  apiSecret: string | null;
};

export interface TrendyolListingProductDTO {
  barcode?: string;
  title?: string;
  productMainId?: string;
  brandId: number;
  categoryId: number;
  quantity?: number;
  stockCode?: string;
  dimensionalWeight?: number;
  description?: string;
  listPrice?: number;
  salePrice?: number;
  vatRate?: number;
  cargoCompanyId: number;
  shipmentAddressId?: number;
  returningAddressId?: number;
  images?: string[];
  attributes?: Array<{
    attributeId: number;
    attributeValueId?: number;
    customAttributeValue?: string;
  }>;
}

export type MarketplaceListingActionListing = Prisma.MarketplaceListingGetPayload<{
  include: {
    product: { select: { id: true; code: true; name: true; salesPrice: true } };
    integration: { select: { id: true; channel: true; name: true } };
  };
}>;

export interface MarketplaceListingActionResult {
  batchRequestId: string;
  listing: MarketplaceListingActionListing;
}

export function hideIntegrationSecrets<T extends IntegrationWithSecrets>(
  integration: T,
): Omit<T, 'apiKey' | 'apiSecret'> & {
  apiKey: null;
  apiSecret: null;
  hasApiKey: boolean;
  hasApiSecret: boolean;
} {
  const { apiKey, apiSecret, ...rest } = integration;
  return {
    ...rest,
    apiKey: null,
    apiSecret: null,
    hasApiKey: Boolean(apiKey),
    hasApiSecret: Boolean(apiSecret),
  };
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isMarketplaceChannel(value: unknown): value is MarketplaceChannel {
  return typeof value === 'string' && Object.values(MarketplaceChannel).includes(value as MarketplaceChannel);
}

export interface CreateIntegrationBody {
  channel: MarketplaceChannel;
  name: string;
  apiKey?: string;
  apiSecret?: string;
  storeId?: string;
}

export interface UpdateIntegrationBody {
  name?: string;
  apiKey?: string;
  apiSecret?: string;
  storeId?: string | null;
  isActive?: boolean;
}

export function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' ? value.trim() : undefined;
}

export function parseCreateIntegrationBody(value: unknown): CreateIntegrationBody | ValidationError {
  if (!isJsonObject(value)) return new ValidationError('Geçersiz istek gövdesi.');
  const channel = value.channel;
  const name = readOptionalString(value, 'name') ?? '';
  if (!isMarketplaceChannel(channel) || !name) return new ValidationError('channel ve name zorunludur.');
  return {
    channel,
    name,
    apiKey: readOptionalString(value, 'apiKey'),
    apiSecret: readOptionalString(value, 'apiSecret'),
    storeId: readOptionalString(value, 'storeId'),
  };
}

export function parseUpdateIntegrationBody(value: unknown): UpdateIntegrationBody | ValidationError {
  if (!isJsonObject(value)) return new ValidationError('Geçersiz istek gövdesi.');
  const body: UpdateIntegrationBody = {};
  if ('name' in value) body.name = readOptionalString(value, 'name') ?? '';
  if ('apiKey' in value) body.apiKey = readOptionalString(value, 'apiKey') ?? '';
  if ('apiSecret' in value) body.apiSecret = readOptionalString(value, 'apiSecret') ?? '';
  if ('storeId' in value) body.storeId = readOptionalString(value, 'storeId') ?? null;
  if ('isActive' in value && typeof value.isActive === 'boolean') body.isActive = value.isActive;
  if (body.name !== undefined && body.name.length === 0) return new ValidationError('name boş olamaz.');
  return body;
}

export function toJobParams(value: Prisma.JsonValue): JobParams {
  return isJsonObject(value) ? value : {};
}

export function parsePositiveNumber(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function toTrendyolProductItem(
  listing: {
    externalId: string;
    externalSku: string | null;
    price: Prisma.Decimal;
    stock: Prisma.Decimal;
    product: {
      code: string;
      name: string;
      barcode: string | null;
      description: string | null;
      imageUrl: string | null;
    };
  },
  body: TrendyolListingProductDTO,
): TrendyolProductItemInput {
  const barcode = (body.barcode ?? listing.externalId ?? listing.product.barcode ?? '').trim();
  const title = (body.title ?? listing.product.name).trim();
  const productMainId = (body.productMainId ?? listing.product.code).trim();
  const stockCode = (body.stockCode ?? listing.externalSku ?? listing.product.code).trim();
  const description = (body.description ?? listing.product.description ?? title).trim();
  const salePrice = parsePositiveNumber(body.salePrice, Number(listing.price));
  const listPrice = parsePositiveNumber(body.listPrice, salePrice);
  const quantity = parsePositiveNumber(body.quantity, Number(listing.stock));
  const dimensionalWeight = parsePositiveNumber(body.dimensionalWeight, 1);
  const vatRate = parsePositiveNumber(body.vatRate, 20);
  const imageUrls = body.images?.filter((url) => url.trim().length > 0)
    ?? (listing.product.imageUrl ? [listing.product.imageUrl] : []);

  return {
    barcode,
    title,
    productMainId,
    brandId: body.brandId,
    categoryId: body.categoryId,
    quantity,
    stockCode,
    dimensionalWeight,
    description,
    currencyType: 'TRY',
    listPrice,
    salePrice,
    vatRate,
    cargoCompanyId: body.cargoCompanyId,
    ...(body.shipmentAddressId !== undefined && { shipmentAddressId: body.shipmentAddressId }),
    ...(body.returningAddressId !== undefined && { returningAddressId: body.returningAddressId }),
    images: imageUrls.map((url) => ({ url })),
    attributes: body.attributes ?? [],
  };
}

// ─────────────────────────────────────────────
// Marketplace Controller — Entegrasyon, Listeleme, Sipariş
// ─────────────────────────────────────────────
