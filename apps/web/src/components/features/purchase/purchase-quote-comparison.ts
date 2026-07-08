import type { PurchaseRequest } from '@/services/purchase.service';

export interface SupplierQuoteDraft {
  contactId: string;
  prices: Record<string, string>;
  leadTimeDays: string;
  qualityScore: string;
}

export interface QuoteComparisonResult {
  quoteIndex: number;
  contactId: string;
  total: number;
  leadTimeDays: number | null;
  qualityScore: number | null;
  weightedScore: number;
  isComplete: boolean;
  isRecommended: boolean;
}

const PRICE_WEIGHT = 60;
const LEAD_TIME_WEIGHT = 20;
const QUALITY_WEIGHT = 20;

function parsePositiveNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function clampQualityScore(value: number | null): number | null {
  if (value === null) return null;
  return Math.min(100, Math.max(0, value));
}

function quoteTotal(request: PurchaseRequest, quote: SupplierQuoteDraft): number {
  return (request.items ?? []).reduce((sum, item) => {
    const unitPrice = parsePositiveNumber(quote.prices[item.productId]) ?? 0;
    return sum + Number(item.quantity) * unitPrice;
  }, 0);
}

function hasAllPrices(request: PurchaseRequest, quote: SupplierQuoteDraft): boolean {
  return (request.items ?? []).every((item) => parsePositiveNumber(quote.prices[item.productId]) !== null);
}

export function compareSupplierQuotes(request: PurchaseRequest, quotes: SupplierQuoteDraft[]): QuoteComparisonResult[] {
  const baseResults = quotes.map((quote, quoteIndex) => {
    const total = quoteTotal(request, quote);
    const leadTimeDays = parsePositiveNumber(quote.leadTimeDays);
    const qualityScore = clampQualityScore(parseNonNegativeNumber(quote.qualityScore));
    const isComplete = Boolean(quote.contactId) && total > 0 && leadTimeDays !== null && qualityScore !== null && hasAllPrices(request, quote);

    return {
      quoteIndex,
      contactId: quote.contactId,
      total,
      leadTimeDays,
      qualityScore,
      weightedScore: 0,
      isComplete,
      isRecommended: false,
    } satisfies QuoteComparisonResult;
  });

  const completeResults = baseResults.filter((result) => result.isComplete);

  if (completeResults.length === 0) {
    return baseResults;
  }

  const minTotal = Math.min(...completeResults.map((result) => result.total));
  const minLeadTime = Math.min(...completeResults.map((result) => result.leadTimeDays ?? Number.POSITIVE_INFINITY));

  const scoredResults = baseResults.map((result) => {
    if (!result.isComplete || result.leadTimeDays === null || result.qualityScore === null) {
      return result;
    }

    const priceScore = result.total > 0 ? (minTotal / result.total) * PRICE_WEIGHT : 0;
    const leadTimeScore = result.leadTimeDays > 0 ? (minLeadTime / result.leadTimeDays) * LEAD_TIME_WEIGHT : 0;
    const qualityScore = (result.qualityScore / 100) * QUALITY_WEIGHT;

    return {
      ...result,
      weightedScore: Math.round((priceScore + leadTimeScore + qualityScore) * 10) / 10,
    };
  });

  const recommendedQuote = scoredResults
    .filter((result) => result.isComplete)
    .sort((first, second) => (
      second.weightedScore - first.weightedScore
      || first.total - second.total
      || (first.leadTimeDays ?? Number.POSITIVE_INFINITY) - (second.leadTimeDays ?? Number.POSITIVE_INFINITY)
      || (second.qualityScore ?? 0) - (first.qualityScore ?? 0)
    ))[0];

  return scoredResults.map((result) => ({
    ...result,
    isRecommended: result.quoteIndex === recommendedQuote.quoteIndex,
  }));
}
