import { DeliveryNoteStatus, DeliveryNoteType, InvoiceStatus, InvoiceType, type Prisma, type PrismaClient } from '@prisma/client';
import { NotFoundError } from '../errors';

type PurchaseThreeWayMatchDbClient = PrismaClient | Prisma.TransactionClient;

export type ThreeWayMatchStatus = 'AUTO_APPROVED' | 'EXCEPTION' | 'PENDING';
export type ThreeWayMatchIssueSeverity = 'INFO' | 'WARNING' | 'ERROR';

export interface ThreeWayMatchIssue {
  code: string;
  severity: ThreeWayMatchIssueSeverity;
  message: string;
}

export interface ThreeWayMatchLine {
  productId: string;
  productCode: string | null;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  invoicedQuantity: number;
  orderedUnitPrice: number;
  invoicedUnitPrice: number | null;
  orderedDiscount: number;
  invoicedDiscount: number | null;
  orderedTaxRate: number;
  invoicedTaxRate: number | null;
  orderedTotal: number;
  invoicedTotal: number;
  quantityDifference: number;
  priceDifferencePercent: number | null;
  totalDifference: number;
  status: ThreeWayMatchStatus;
  issues: ThreeWayMatchIssue[];
}

export interface ThreeWayMatchSummary {
  status: ThreeWayMatchStatus;
  orderedTotal: number;
  invoicedTotal: number;
  totalDifference: number;
  orderedQuantity: number;
  receivedQuantity: number;
  invoicedQuantity: number;
  deliveryNoteCount: number;
  invoiceCount: number;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  priceTolerancePercent: number;
  quantityTolerancePercent: number;
}

export interface ThreeWayMatchResult {
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  supplierId: string;
  supplierName: string | null;
  currencyCode: string;
  generatedAt: string;
  summary: ThreeWayMatchSummary;
  lines: ThreeWayMatchLine[];
  issues: ThreeWayMatchIssue[];
}

interface InvoiceLineAggregate {
  quantity: number;
  total: number;
  weightedUnitPriceTotal: number;
  weightedDiscountTotal: number;
  taxAmount: number;
}

const PRICE_TOLERANCE_PERCENT = 2;
const QUANTITY_TOLERANCE_PERCENT = 0;
const MATCH_DELIVERY_STATUSES = [
  DeliveryNoteStatus.CONFIRMED,
  DeliveryNoteStatus.SHIPPED,
  DeliveryNoteStatus.DELIVERED,
];

function numberValue(value: Prisma.Decimal | number | null | undefined): number {
  return Number(value ?? 0);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function percentDifference(expected: number, actual: number): number | null {
  if (expected === 0) return actual === 0 ? 0 : null;
  return Math.abs(((actual - expected) / expected) * 100);
}

function lineStatus(issues: ThreeWayMatchIssue[]): ThreeWayMatchStatus {
  if (issues.some((issue) => issue.severity === 'ERROR')) return 'EXCEPTION';
  if (issues.some((issue) => issue.severity === 'WARNING')) return 'PENDING';
  return 'AUTO_APPROVED';
}

export class PurchaseThreeWayMatchService {
  constructor(private readonly db: PurchaseThreeWayMatchDbClient) {}

  async evaluate(tenantId: string, purchaseOrderId: string): Promise<ThreeWayMatchResult> {
    const order = await this.db.purchaseOrder.findFirst({
      where: { id: purchaseOrderId, tenantId, deletedAt: null },
      include: {
        contact: { select: { id: true, name: true } },
        items: {
          include: { product: { select: { id: true, code: true, name: true } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!order) throw new NotFoundError('Satın alma siparişi', purchaseOrderId);

    const [deliveryNotes, invoices] = await Promise.all([
      this.db.deliveryNote.findMany({
        where: {
          tenantId,
          purchaseOrderId,
          deletedAt: null,
          type: DeliveryNoteType.INBOUND,
          status: { in: MATCH_DELIVERY_STATUSES },
        },
        include: { items: true },
      }),
      this.db.invoice.findMany({
        where: {
          tenantId,
          purchaseOrderId,
          deletedAt: null,
          type: InvoiceType.PURCHASE,
          status: { not: InvoiceStatus.CANCELLED },
        },
        include: { lines: true, contact: { select: { id: true, name: true } } },
      }),
    ]);

    const receivedByProduct = new Map<string, number>();
    for (const note of deliveryNotes) {
      for (const item of note.items) {
        const current = receivedByProduct.get(item.productId) ?? 0;
        receivedByProduct.set(item.productId, current + numberValue(item.deliveredQty));
      }
    }

    const invoiceByProduct = new Map<string, InvoiceLineAggregate>();
    const globalIssues: ThreeWayMatchIssue[] = [];
    for (const invoice of invoices) {
      if (invoice.contactId !== order.contactId) {
        globalIssues.push({
          code: 'SUPPLIER_MISMATCH',
          severity: 'ERROR',
          message: `${invoice.number} faturası farklı tedarikçiye bağlı.`,
        });
      }
      if (invoice.currencyCode !== order.currencyCode) {
        globalIssues.push({
          code: 'CURRENCY_MISMATCH',
          severity: 'ERROR',
          message: `${invoice.number} para birimi ${invoice.currencyCode}; sipariş ${order.currencyCode}.`,
        });
      }

      for (const line of invoice.lines) {
        if (!line.productId) {
          globalIssues.push({
            code: 'UNKNOWN_PRODUCT',
            severity: 'ERROR',
            message: `${invoice.number} faturasında ürünsüz satır var: ${line.description}`,
          });
          continue;
        }

        const quantity = numberValue(line.quantity);
        const current = invoiceByProduct.get(line.productId) ?? {
          quantity: 0,
          total: 0,
          weightedUnitPriceTotal: 0,
          weightedDiscountTotal: 0,
          taxAmount: 0,
        };
        current.quantity += quantity;
        current.total += numberValue(line.lineTotal);
        current.weightedUnitPriceTotal += numberValue(line.unitPrice) * quantity;
        current.weightedDiscountTotal += numberValue(line.discount) * quantity;
        current.taxAmount += numberValue(line.taxAmount);
        invoiceByProduct.set(line.productId, current);
      }
    }

    const orderProductIds = new Set(order.items.map((item) => item.productId));
    for (const productId of invoiceByProduct.keys()) {
      if (!orderProductIds.has(productId)) {
        globalIssues.push({
          code: 'UNKNOWN_PRODUCT',
          severity: 'ERROR',
          message: `Faturada siparişte olmayan ürün var: ${productId}`,
        });
      }
    }

    const lines: ThreeWayMatchLine[] = order.items.map((item) => {
      const orderedQuantity = numberValue(item.quantity);
      const receivedQuantity = receivedByProduct.get(item.productId) ?? numberValue(item.received);
      const invoiceAggregate = invoiceByProduct.get(item.productId) ?? null;
      const invoicedQuantity = invoiceAggregate?.quantity ?? 0;
      const orderedUnitPrice = numberValue(item.unitPrice);
      const invoicedUnitPrice = invoiceAggregate && invoiceAggregate.quantity > 0
        ? invoiceAggregate.weightedUnitPriceTotal / invoiceAggregate.quantity
        : null;
      const orderedDiscount = numberValue(item.discount);
      const invoicedDiscount = invoiceAggregate && invoiceAggregate.quantity > 0
        ? invoiceAggregate.weightedDiscountTotal / invoiceAggregate.quantity
        : null;
      const orderedTaxRate = numberValue(item.taxRate);
      const invoicedTaxRate = invoiceAggregate && invoiceAggregate.total > 0
        ? (invoiceAggregate.taxAmount / Math.max(invoiceAggregate.total - invoiceAggregate.taxAmount, 0.01)) * 100
        : null;
      const orderedTotal = numberValue(item.lineTotal);
      const invoicedTotal = invoiceAggregate?.total ?? 0;
      const quantityDifference = roundQuantity(invoicedQuantity - receivedQuantity);
      const totalDifference = roundMoney(invoicedTotal - orderedTotal);
      const priceDifference = invoicedUnitPrice === null ? null : percentDifference(orderedUnitPrice, invoicedUnitPrice);
      const issues: ThreeWayMatchIssue[] = [];

      if (deliveryNotes.length === 0) {
        issues.push({ code: 'NO_RECEIPT', severity: 'WARNING', message: 'Bağlı inbound irsaliye veya teslim kaydı yok.' });
      }
      if (invoices.length === 0) {
        issues.push({ code: 'NO_INVOICE', severity: 'WARNING', message: 'Bağlı tedarikçi faturası yok.' });
      }
      if (invoicedQuantity > receivedQuantity * (1 + QUANTITY_TOLERANCE_PERCENT / 100)) {
        issues.push({ code: 'INVOICE_QTY_GT_RECEIVED', severity: 'ERROR', message: 'Fatura miktarı teslim alınan miktardan fazla.' });
      }
      if (invoicedQuantity > orderedQuantity * (1 + QUANTITY_TOLERANCE_PERCENT / 100)) {
        issues.push({ code: 'INVOICE_QTY_GT_ORDERED', severity: 'ERROR', message: 'Fatura miktarı sipariş miktarından fazla.' });
      }
      if (receivedQuantity > orderedQuantity * (1 + QUANTITY_TOLERANCE_PERCENT / 100)) {
        issues.push({ code: 'RECEIVED_QTY_GT_ORDERED', severity: 'ERROR', message: 'Teslim alınan miktar sipariş miktarından fazla.' });
      }
      if (priceDifference !== null && priceDifference > PRICE_TOLERANCE_PERCENT) {
        issues.push({ code: 'PRICE_TOLERANCE_EXCEEDED', severity: 'ERROR', message: `Birim fiyat farkı toleransı aşıyor: %${roundMoney(priceDifference)}.` });
      }
      if (invoicedDiscount !== null && Math.abs(invoicedDiscount - orderedDiscount) > 0.01) {
        issues.push({ code: 'DISCOUNT_MISMATCH', severity: 'WARNING', message: 'Fatura iskontosu sipariş iskontosundan farklı.' });
      }
      if (invoicedTaxRate !== null && Math.abs(invoicedTaxRate - orderedTaxRate) > 0.5) {
        issues.push({ code: 'TAX_MISMATCH', severity: 'WARNING', message: 'Fatura vergi oranı sipariş vergi oranından farklı.' });
      }

      return {
        productId: item.productId,
        productCode: item.product?.code ?? null,
        productName: item.product?.name ?? item.description ?? item.productId,
        orderedQuantity,
        receivedQuantity,
        invoicedQuantity,
        orderedUnitPrice,
        invoicedUnitPrice: invoicedUnitPrice === null ? null : roundMoney(invoicedUnitPrice),
        orderedDiscount,
        invoicedDiscount: invoicedDiscount === null ? null : roundMoney(invoicedDiscount),
        orderedTaxRate,
        invoicedTaxRate: invoicedTaxRate === null ? null : roundMoney(invoicedTaxRate),
        orderedTotal,
        invoicedTotal: roundMoney(invoicedTotal),
        quantityDifference,
        priceDifferencePercent: priceDifference === null ? null : roundMoney(priceDifference),
        totalDifference,
        status: lineStatus(issues),
        issues,
      };
    });

    const allIssues = [...globalIssues, ...lines.flatMap((line) => line.issues)];
    const errorCount = allIssues.filter((issue) => issue.severity === 'ERROR').length;
    const warningCount = allIssues.filter((issue) => issue.severity === 'WARNING').length;
    const summaryStatus: ThreeWayMatchStatus = errorCount > 0
      ? 'EXCEPTION'
      : warningCount > 0
        ? 'PENDING'
        : 'AUTO_APPROVED';

    return {
      purchaseOrderId: order.id,
      purchaseOrderNumber: order.number,
      supplierId: order.contactId,
      supplierName: order.contact?.name ?? null,
      currencyCode: order.currencyCode,
      generatedAt: new Date().toISOString(),
      summary: {
        status: summaryStatus,
        orderedTotal: numberValue(order.totalGross),
        invoicedTotal: roundMoney(invoices.reduce((sum, invoice) => sum + numberValue(invoice.totalGross), 0)),
        totalDifference: roundMoney(invoices.reduce((sum, invoice) => sum + numberValue(invoice.totalGross), 0) - numberValue(order.totalGross)),
        orderedQuantity: roundQuantity(lines.reduce((sum, line) => sum + line.orderedQuantity, 0)),
        receivedQuantity: roundQuantity(lines.reduce((sum, line) => sum + line.receivedQuantity, 0)),
        invoicedQuantity: roundQuantity(lines.reduce((sum, line) => sum + line.invoicedQuantity, 0)),
        deliveryNoteCount: deliveryNotes.length,
        invoiceCount: invoices.length,
        issueCount: allIssues.length,
        errorCount,
        warningCount,
        priceTolerancePercent: PRICE_TOLERANCE_PERCENT,
        quantityTolerancePercent: QUANTITY_TOLERANCE_PERCENT,
      },
      lines,
      issues: globalIssues,
    };
  }
}
