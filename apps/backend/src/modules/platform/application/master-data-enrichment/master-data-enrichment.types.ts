export const MASTER_DATA_ENTITY_TYPES = ['contact', 'product', 'bankAccount'] as const;
export type MasterDataEntityType = (typeof MASTER_DATA_ENTITY_TYPES)[number];
export type MasterDataSuggestionSource = 'normalization' | 'tenant-history' | 'external-registry' | 'generated';

export interface MasterDataEnrichmentInput {
  entityType: MasterDataEntityType;
  taxNumber?: string;
  email?: string;
  phone?: string;
  barcode?: string;
  iban?: string;
  name?: string;
}

export interface MasterDataSuggestion {
  field: 'taxNumber' | 'email' | 'phone' | 'code' | 'name' | 'taxOffice' | 'address' | 'city' | 'country' | 'iban' | 'bankName' | 'currencyCode';
  value: string;
  source: MasterDataSuggestionSource;
  sourceLabel: string;
  confidence: number;
  reason: string;
}

export interface MasterDataDuplicate {
  id: string;
  label: string;
  matchedBy: 'taxNumber' | 'email' | 'barcode' | 'iban';
  href: string;
}

export interface MasterDataEnrichmentResult {
  entityType: MasterDataEntityType;
  suggestions: MasterDataSuggestion[];
  duplicates: MasterDataDuplicate[];
  warnings: string[];
  generatedAt: string;
}

export interface RegistryCompanyCandidate {
  name?: string;
  taxOffice?: string;
  address?: string;
  city?: string;
  country?: string;
}

export interface CompanyRegistryPort {
  findByTaxNumber(taxNumber: string): Promise<RegistryCompanyCandidate | null>;
}
