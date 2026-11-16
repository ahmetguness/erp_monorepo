import type { Prisma } from '@prisma/client';
import type { WebhookOrderLine, WebhookOrderPackage } from './webhook-order.types.js';
import { mapTrendyolOrderStatus } from './provider-status.js';
type JsonObject = Prisma.InputJsonObject;

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractOrderPackages(payload: JsonObject): WebhookOrderPackage[] {
  const content = payload.content;

  if (Array.isArray(content)) {
    return content.filter(isJsonObject).map(parseOrderPackage).filter((item): item is WebhookOrderPackage => item !== null);
  }

  const singlePackage = parseOrderPackage(payload);
  return singlePackage ? [singlePackage] : [];
}

function parseOrderPackage(input: JsonObject): WebhookOrderPackage | null {
  const packageId = readString(input, 'shipmentPackageId') ?? readString(input, 'packageId');
  const rawStatus = readString(input, 'status') ?? readString(input, 'shipmentPackageStatus');
  const orderDate = readNumber(input, 'orderDate');

  if (!packageId || !rawStatus || orderDate === null) return null;
  const parsedOrderDate = new Date(orderDate);
  if (!Number.isFinite(parsedOrderDate.getTime())) return null;

  const shipmentAddress = readObject(input, 'shipmentAddress');
  const firstName = readString(input, 'customerFirstName');
  const lastName = readString(input, 'customerLastName');
  const customerName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
  const totalAmount = readNumber(input, 'packageTotalPrice') ?? readNumber(input, 'packageGrossAmount') ?? 0;

  return {
    packageId,
    status: mapTrendyolOrderStatus(rawStatus),
    customerName,
    customerEmail: readString(input, 'customerEmail'),
    customerPhone: shipmentAddress ? readString(shipmentAddress, 'phone') : null,
    shippingAddress: shipmentAddress ? readString(shipmentAddress, 'fullAddress') : null,
    totalAmount,
    orderDate: parsedOrderDate,
    lastModifiedDate: String(readNumber(input, 'lastModifiedDate') ?? orderDate),
    lines: readLines(input),
  };
}

function readLines(input: JsonObject): WebhookOrderLine[] {
  const lines = input.lines;
  if (!Array.isArray(lines)) return [];

  return lines.filter(isJsonObject).map((line) => {
    const unitPrice = readNumber(line, 'lineUnitPrice') ?? 0;
    const quantity = readNumber(line, 'quantity') ?? 0;
    return {
      contentId: readString(line, 'contentId') ?? readString(line, 'barcode') ?? '',
      productName: readString(line, 'productName') ?? 'Trendyol ürünü',
      quantity,
      unitPrice,
      lineTotal: readNumber(line, 'lineGrossAmount') ?? unitPrice * quantity,
    };
  });
}

function readObject(input: JsonObject, key: string): JsonObject | null {
  const value = input[key];
  return isJsonObject(value) ? value : null;
}

function readString(input: JsonObject, key: string): string | null {
  const value = input[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function readNumber(input: JsonObject, key: string): number | null {
  const value = input[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function buildEventId(orderPackage: WebhookOrderPackage): string {
  return `${orderPackage.packageId}:${orderPackage.status}:${orderPackage.lastModifiedDate}`;
}
