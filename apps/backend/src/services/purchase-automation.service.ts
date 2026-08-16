import { PurchaseRequestStatus, type Prisma, type PurchaseRequestStatus as PrismaPurchaseRequestStatus } from '@prisma/client';
import { convertReorderSuggestionsToPurchaseRequest, getReorderSuggestions } from './inventory-rules.service';

type PurchaseAutomationDbClient = Prisma.TransactionClient;

interface PurchaseAutomationRequestRef {
  id: string;
  number: string;
  status: PrismaPurchaseRequestStatus;
  itemCount: number;
}

interface PurchaseAutomationSuggestionSummary {
  productId: string;
  productCode: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  available: number;
  minStockLevel: number;
  suggestedQuantity: number;
  estimatedCost: number;
}

export interface PurchaseReorderAutomationResult {
  generatedAt: string;
  suggestionCount: number;
  suggestions: PurchaseAutomationSuggestionSummary[];
  createdRequest: PurchaseAutomationRequestRef | null;
  existingRequest: PurchaseAutomationRequestRef | null;
  skippedReason: string | null;
}

const ACTIVE_REQUEST_STATUSES: PrismaPurchaseRequestStatus[] = [
  PurchaseRequestStatus.DRAFT,
  PurchaseRequestStatus.PENDING_APPROVAL,
  PurchaseRequestStatus.APPROVED,
];

export class PurchaseAutomationService {
  constructor(private readonly db: PurchaseAutomationDbClient) {}

  async runReorderAutomation(tenantId: string, userId: string): Promise<PurchaseReorderAutomationResult> {
    const suggestions = await getReorderSuggestions(this.db, tenantId);
    const generatedAt = new Date().toISOString();
    const summarizedSuggestions = suggestions.map((suggestion) => ({
      productId: suggestion.productId,
      productCode: suggestion.productCode,
      productName: suggestion.productName,
      warehouseId: suggestion.warehouseId,
      warehouseName: suggestion.warehouseName,
      available: suggestion.available,
      minStockLevel: suggestion.minStockLevel,
      suggestedQuantity: suggestion.suggestedQuantity,
      estimatedCost: suggestion.estimatedCost,
    }));

    if (suggestions.length === 0) {
      return {
        generatedAt,
        suggestionCount: 0,
        suggestions: [],
        createdRequest: null,
        existingRequest: null,
        skippedReason: 'Düşük stok için satın alma önerisi bulunamadı.',
      };
    }

    const productIds = [...new Set(suggestions.map((suggestion) => suggestion.productId))];
    const existingRequest = await this.db.purchaseRequest.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: ACTIVE_REQUEST_STATUSES },
        items: { some: { productId: { in: productIds } } },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        number: true,
        status: true,
        _count: { select: { items: true } },
      },
    });

    if (existingRequest) {
      return {
        generatedAt,
        suggestionCount: suggestions.length,
        suggestions: summarizedSuggestions,
        createdRequest: null,
        existingRequest: {
          id: existingRequest.id,
          number: existingRequest.number,
          status: existingRequest.status,
          itemCount: existingRequest._count.items,
        },
        skippedReason: 'Aynı düşük stok ürünleri için açık bir satın alma talebi zaten var.',
      };
    }

    const created = await convertReorderSuggestionsToPurchaseRequest(this.db, tenantId, userId);

    return {
      generatedAt,
      suggestionCount: suggestions.length,
      suggestions: summarizedSuggestions,
      createdRequest: {
        id: created.id,
        number: created.number,
        status: PurchaseRequestStatus.DRAFT,
        itemCount: created.itemCount,
      },
      existingRequest: null,
      skippedReason: null,
    };
  }
}
