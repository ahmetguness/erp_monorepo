import type { ReplenishmentRepository } from './replenishment.ports.js';
import type { ReplenishmentPolicy, ReplenishmentRecommendation, ReplenishmentRunResult, ReplenishmentScenario, ReplenishmentScenarioKind, ReplenishmentSourceRow, ReplenishmentWorkspace } from './replenishment.types.js';

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));
const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));

export function sanitizeReplenishmentPolicy(input: ReplenishmentPolicy): ReplenishmentPolicy {
  return {
    lookbackDays: clamp(Math.trunc(input.lookbackDays), 30, 365),
    horizonDays: clamp(Math.trunc(input.horizonDays), 7, 120),
    targetServiceLevel: clamp(input.targetServiceLevel, 85, 99.9),
    autoCreateDrafts: input.autoCreateDrafts,
    maximumDraftValue: clamp(input.maximumDraftValue, 0, 10_000_000),
  };
}

function alignedQuantity(quantity: number, minimum: number, packageSize: number): number {
  const required = Math.max(quantity, minimum);
  return Math.ceil(required / Math.max(1, packageSize)) * Math.max(1, packageSize);
}

function accuracy(samples: number[]): number {
  if (samples.length < 2) return 50;
  const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  if (average === 0) return 100;
  const error = samples.reduce((sum, value) => sum + Math.abs(value - average), 0) / samples.length;
  return round(clamp(100 - (error / average) * 100, 0, 100), 1);
}

function scenario(kind: ReplenishmentScenarioKind, days: number, row: ReplenishmentSourceRow, dailyDemand: number, safetyStock: number, serviceLevel: number): ReplenishmentScenario {
  const netAvailable = row.onHand - row.reserved + row.incoming - row.openSales;
  const quantity = alignedQuantity(Math.max(0, dailyDemand * days + safetyStock - netAvailable), row.minimumOrderQuantity, row.packageSize);
  const unitPrice = row.supplierUnitPrice ?? row.purchasePrice;
  return { kind, quantity: round(quantity, 3), estimatedCost: round(quantity * unitPrice), projectedServiceLevel: round(serviceLevel, 1), projectedDaysOfSupply: round(days + safetyStock / Math.max(dailyDemand, 0.01), 1) };
}

export function buildRecommendation(row: ReplenishmentSourceRow, policy: ReplenishmentPolicy): ReplenishmentRecommendation {
  const recentDays = Math.max(1, Math.ceil(policy.lookbackDays / 3));
  const previousDays = Math.max(1, policy.lookbackDays - recentDays);
  const recentRate = row.recentDemand / recentDays;
  const previousRate = row.previousDemand / previousDays;
  const seasonalFactor = clamp(previousRate > 0 ? recentRate / previousRate : recentRate > 0 ? 1.25 : 1, 0.6, 1.8);
  const dailyDemand = round(((row.recentDemand + row.previousDemand) / policy.lookbackDays) * seasonalFactor, 3);
  const leadTimeDays = row.supplierLeadTimeDays ?? 14;
  const reliability = row.supplierReliability ?? 70;
  const deviation = row.demandSamples.length > 1 ? Math.sqrt(row.demandSamples.reduce((sum, value) => sum + (value - dailyDemand) ** 2, 0) / row.demandSamples.length) : dailyDemand * 0.35;
  const serviceFactor = policy.targetServiceLevel >= 99 ? 2.33 : policy.targetServiceLevel >= 97 ? 1.88 : policy.targetServiceLevel >= 95 ? 1.65 : 1.28;
  const safetyStock = round(Math.max(row.minimumStock, serviceFactor * deviation * Math.sqrt(leadTimeDays) * (1 + (100 - reliability) / 100)), 3);
  const available = row.onHand - row.reserved;
  const netAvailable = available + row.incoming - row.openSales;
  const daysToStockout = dailyDemand > 0 ? round(Math.max(0, netAvailable) / dailyDemand, 1) : null;
  const scenarios = [
    scenario('LEAN', Math.max(leadTimeDays, Math.round(policy.horizonDays * 0.6)), row, dailyDemand, safetyStock * 0.6, Math.max(85, policy.targetServiceLevel - 5)),
    scenario('BALANCED', policy.horizonDays, row, dailyDemand, safetyStock, policy.targetServiceLevel),
    scenario('RESILIENT', Math.round(policy.horizonDays * 1.35), row, dailyDemand, safetyStock * 1.4, Math.min(99.9, policy.targetServiceLevel + 2)),
  ];
  const urgency = dailyDemand > 0 && netAvailable <= dailyDemand * leadTimeDays + safetyStock ? (netAvailable <= dailyDemand * leadTimeDays ? 'CRITICAL' : 'PLAN') : 'HEALTHY';
  return {
    productId: row.productId, productCode: row.productCode, productName: row.productName,
    supplierId: row.supplierId, supplierName: row.supplierName, available: round(available, 3), incoming: round(row.incoming, 3), openSales: round(row.openSales, 3),
    dailyDemand, seasonalFactor: round(seasonalFactor, 2), forecastAccuracy: accuracy(row.demandSamples), leadTimeDays, safetyStock, daysToStockout, urgency,
    recommendedScenario: 'BALANCED', scenarios,
    explanation: [`${policy.lookbackDays} günlük gerçek çıkış hareketi kullanıldı.`, `Açık siparişler ve ${leadTimeDays} günlük tedarik süresi hesaba katıldı.`, `Güvenilirlik skoru: %${reliability}.`],
  };
}

export class ReplenishmentPlanningService {
  constructor(private readonly repository: ReplenishmentRepository) {}
  async getWorkspace(tenantId: string, now = new Date()): Promise<ReplenishmentWorkspace> {
    const policy = await this.repository.getPolicy(tenantId);
    const rows = await this.repository.loadPlanningRows(tenantId, policy, now);
    const recommendations = rows.map((row) => buildRecommendation(row, policy)).sort((left, right) => ({ CRITICAL: 0, PLAN: 1, HEALTHY: 2 })[left.urgency] - ({ CRITICAL: 0, PLAN: 1, HEALTHY: 2 })[right.urgency]);
    const actionable = recommendations.filter((item) => item.urgency !== 'HEALTHY');
    return { generatedAt: now.toISOString(), policy, summary: { productsAnalyzed: recommendations.length, actionRequired: actionable.length, critical: actionable.filter((item) => item.urgency === 'CRITICAL').length, recommendedInvestment: round(actionable.reduce((sum, item) => sum + (item.scenarios.find((candidate) => candidate.kind === item.recommendedScenario)?.estimatedCost ?? 0), 0)) }, recommendations };
  }
  async updatePolicy(tenantId: string, input: ReplenishmentPolicy): Promise<ReplenishmentPolicy> { const policy = sanitizeReplenishmentPolicy(input); await this.repository.savePolicy(tenantId, policy); return policy; }
  async run(tenantId: string, userId: string): Promise<ReplenishmentRunResult> {
    const workspace = await this.getWorkspace(tenantId);
    const result: ReplenishmentRunResult = { createdDrafts: [], skipped: [] };
    for (const item of workspace.recommendations.filter((candidate) => candidate.urgency !== 'HEALTHY')) {
      const selected = item.scenarios.find((candidate) => candidate.kind === item.recommendedScenario);
      if (!workspace.policy.autoCreateDrafts) { result.skipped.push({ productId: item.productId, reason: 'Otomatik taslak politikası kapalı.' }); continue; }
      if (!item.supplierId || !selected) { result.skipped.push({ productId: item.productId, reason: 'Uygun tedarikçi veya senaryo bulunamadı.' }); continue; }
      if (selected.estimatedCost > workspace.policy.maximumDraftValue) { result.skipped.push({ productId: item.productId, reason: 'Taslak tutarı politika limitini aşıyor.' }); continue; }
      const row = await this.repository.createDraft(tenantId, userId, { productId: item.productId, supplierId: item.supplierId, quantity: selected.quantity, unitPrice: selected.quantity > 0 ? selected.estimatedCost / selected.quantity : 0 });
      result.createdDrafts.push({ ...row, productId: item.productId, amount: selected.estimatedCost });
    }
    return result;
  }
}
