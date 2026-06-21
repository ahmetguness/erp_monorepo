export type AiRedactionScope = 'all' | 'public';

export interface AiRedactionRule {
  key: string;
  label: string;
  pattern: RegExp;
  replacement: string;
  scope: AiRedactionScope;
}

export const AI_SENSITIVE_FIELD_KEYS = [
  'password',
  'passwordHash',
  'token',
  'apiKey',
  'apiSecret',
  'keyHash',
  'secret',
  'iban',
  'cardNumber',
  'nationalId',
  'taxNumber',
  'email',
  'phone',
] as const;

export const AI_REDACTION_RULES: readonly AiRedactionRule[] = [
  {
    key: 'nationalId',
    label: 'TC Kimlik',
    pattern: /\b[1-9]\d{10}\b/g,
    replacement: '***TC GIZLI***',
    scope: 'all',
  },
  {
    key: 'iban',
    label: 'IBAN',
    pattern: /\bTR\s?\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2}\b/gi,
    replacement: '***IBAN GIZLI***',
    scope: 'all',
  },
  {
    key: 'cardNumber',
    label: 'Kredi Karti',
    pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    replacement: '***KART GIZLI***',
    scope: 'all',
  },
  {
    key: 'phone',
    label: 'Telefon',
    pattern: /(?:\+90|0)\s?\(?\d{3}\)?\s?\d{3}\s?\d{2}\s?\d{2}\b/g,
    replacement: '***TEL GIZLI***',
    scope: 'public',
  },
  {
    key: 'email',
    label: 'Email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: '***EMAIL GIZLI***',
    scope: 'public',
  },
  {
    key: 'taxNumber',
    label: 'Vergi No',
    pattern: /\bV\.?D\.?\s*:?\s*\d{10}\b/gi,
    replacement: '***VERGI NO GIZLI***',
    scope: 'all',
  },
] as const;

export function getAiRedactionRegistry() {
  return {
    fieldKeys: AI_SENSITIVE_FIELD_KEYS,
    rules: AI_REDACTION_RULES.map((rule) => ({
      key: rule.key,
      label: rule.label,
      scope: rule.scope,
    })),
  };
}
