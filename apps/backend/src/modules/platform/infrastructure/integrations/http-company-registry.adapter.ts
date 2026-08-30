import { z } from 'zod';
import { observedFetch } from '../../../shared/index.js';
import type { CompanyRegistryPort, RegistryCompanyCandidate } from '../../application/master-data-enrichment/master-data-enrichment.types.js';

const registryResponseSchema = z.object({
  name: z.string().optional(),
  taxOffice: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
});

export class HttpCompanyRegistryAdapter implements CompanyRegistryPort {
  async findByTaxNumber(taxNumber: string): Promise<RegistryCompanyCandidate | null> {
    const baseUrl = process.env.MASTER_DATA_REGISTRY_URL?.trim();
    if (!baseUrl) return null;
    const response = await observedFetch(`${baseUrl.replace(/\/$/, '')}/companies/${encodeURIComponent(taxNumber)}`, {
      headers: process.env.MASTER_DATA_REGISTRY_TOKEN ? { authorization: `Bearer ${process.env.MASTER_DATA_REGISTRY_TOKEN}` } : undefined,
      signal: AbortSignal.timeout(3_000),
    }).catch(() => null);
    if (!response?.ok) return null;
    const payload: unknown = await response.json().catch(() => null);
    const parsed = registryResponseSchema.safeParse(payload);
    return parsed.success ? parsed.data : null;
  }
}
