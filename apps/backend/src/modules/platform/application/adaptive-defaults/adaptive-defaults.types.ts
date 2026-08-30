export const ADAPTIVE_DEFAULT_FIELDS = ['paymentTermDays', 'taxRateId'] as const;
export const ADAPTIVE_FORM_KINDS = ['invoice'] as const;
export const ADAPTIVE_TRANSACTION_TYPES = ['SALES', 'PURCHASE', 'RETURN_SALES', 'RETURN_PURCHASE'] as const;

export type AdaptiveDefaultField = (typeof ADAPTIVE_DEFAULT_FIELDS)[number];
export type AdaptiveFormKind = (typeof ADAPTIVE_FORM_KINDS)[number];
export type AdaptiveTransactionType = (typeof ADAPTIVE_TRANSACTION_TYPES)[number];
export type AdaptiveDefaultSource = 'contact' | 'user' | 'role' | 'tenant' | 'policy';

export interface AdaptiveDefaultCandidate {
  value: string;
  count: number;
}

export interface AdaptiveDefaultSuggestion {
  field: AdaptiveDefaultField;
  value: string;
  confidence: number;
  sampleSize: number;
  source: AdaptiveDefaultSource;
  reason: string;
  autoApplicable: boolean;
}

export interface AdaptiveDefaultsSnapshot {
  formKind: AdaptiveFormKind;
  transactionType: AdaptiveTransactionType;
  contactId: string | null;
  suggestions: AdaptiveDefaultSuggestion[];
  generatedAt: string;
}
