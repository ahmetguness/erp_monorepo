import { number, object, string } from './validation.js';
export interface Pricing { source: string; currency: string; monthlyInfrastructure: number; storageGiBMonth: number; egressGiB: number; aiInputMillion: number; aiOutputMillion: number; externalCall: number }
export interface TenantConsumption { tenantId: string; plan: string; storageBytes: number; downloadedBytes: number; inputTokens: number; outputTokens: number; externalCalls: number }
export function parsePricing(value: unknown): Pricing {
  const input = object(value);
  const positive = (key: string) => { const value = number(input[key]); if (value < 0) throw new Error('Pricing cannot be negative.'); return value; };
  return { source: string(input.source), currency: string(input.currency), monthlyInfrastructure: positive('monthlyInfrastructure'), storageGiBMonth: positive('storageGiBMonth'), egressGiB: positive('egressGiB'), aiInputMillion: positive('aiInputMillion'), aiOutputMillion: positive('aiOutputMillion'), externalCall: positive('externalCall') };
}
/** Observed variable usage, not a monthly traffic extrapolation or provider quote. */
export function tenantCost(usage: TenantConsumption, tenants: number, pricing: Pricing) {
  if (!Number.isInteger(tenants) || tenants < 1 || Object.values(usage).some((value) => typeof value === 'number' && (!Number.isFinite(value) || value < 0))) throw new Error('Invalid tenant consumption.');
  return { tenantId: usage.tenantId, plan: usage.plan, currency: pricing.currency, pricingSource: pricing.source,
    monthlyFixedShare: pricing.monthlyInfrastructure / tenants,
    monthlyStoredData: usage.storageBytes / 2 ** 30 * pricing.storageGiBMonth,
    observedEgress: usage.downloadedBytes / 2 ** 30 * pricing.egressGiB,
    observedAI: usage.inputTokens / 1_000_000 * pricing.aiInputMillion + usage.outputTokens / 1_000_000 * pricing.aiOutputMillion,
    observedExternal: usage.externalCalls * pricing.externalCall,
  };
}
