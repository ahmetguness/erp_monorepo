import { ContactType } from '@prisma/client';

export type ContactRiskLevel = 'safe' | 'warning' | 'exceeded' | 'none';
export type ContactRiskScoreLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ContactMissingInfoKey = 'taxNumber' | 'taxOffice' | 'email' | 'phone' | 'address' | 'paymentTermDays';

export interface ContactInsightInput {
  type: ContactType;
  taxNumber: string | null;
  taxOffice: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  creditLimit: number;
  paymentTermDays: number | null;
  currentBalance: number;
  overdueInvoiceCount: number;
}

export interface ContactInsights {
  riskLevel: ContactRiskLevel;
  riskRatio: number;
  riskScore: number;
  riskScoreLevel: ContactRiskScoreLevel;
  missingInfoKeys: ContactMissingInfoKey[];
  missingInfoCount: number;
  hasMissingInfo: boolean;
}

const CUSTOMER_REQUIRED_FIELDS: ContactMissingInfoKey[] = ['taxNumber', 'taxOffice', 'email', 'phone', 'address', 'paymentTermDays'];
const SUPPLIER_REQUIRED_FIELDS: ContactMissingInfoKey[] = ['taxNumber', 'taxOffice', 'email', 'phone', 'address'];
const BOTH_REQUIRED_FIELDS: ContactMissingInfoKey[] = ['taxNumber', 'taxOffice', 'email', 'phone', 'address', 'paymentTermDays'];

function requiredFieldsForType(type: ContactType): ContactMissingInfoKey[] {
  if (type === ContactType.CUSTOMER) return CUSTOMER_REQUIRED_FIELDS;
  if (type === ContactType.SUPPLIER) return SUPPLIER_REQUIRED_FIELDS;
  return BOTH_REQUIRED_FIELDS;
}

function isMissing(value: string | number | null): boolean {
  if (value === null) return true;
  if (typeof value === 'number') return !Number.isFinite(value);
  return value.trim().length === 0;
}

function riskLevelFromRatio(creditLimit: number, riskRatio: number): ContactRiskLevel {
  if (creditLimit <= 0) return 'none';
  if (riskRatio > 1) return 'exceeded';
  if (riskRatio > 0.8) return 'warning';
  return 'safe';
}

function scoreLevel(score: number): ContactRiskScoreLevel {
  if (score >= 70) return 'HIGH';
  if (score >= 35) return 'MEDIUM';
  return 'LOW';
}

export function getContactInsights(input: ContactInsightInput): ContactInsights {
  const usedCredit = Math.max(input.currentBalance, 0);
  const riskRatio = input.creditLimit > 0 ? usedCredit / input.creditLimit : 0;
  const riskLevel = riskLevelFromRatio(input.creditLimit, riskRatio);
  const missingInfoKeys = requiredFieldsForType(input.type).filter((field) => isMissing(input[field]));
  const missingInfoCount = missingInfoKeys.length;
  const creditRiskScore = input.creditLimit > 0 ? Math.min(65, Math.round(riskRatio * 65)) : 15;
  const overdueRiskScore = Math.min(25, input.overdueInvoiceCount * 10);
  const missingInfoRiskScore = Math.min(20, missingInfoCount * 4);
  const riskScore = Math.min(100, creditRiskScore + overdueRiskScore + missingInfoRiskScore);

  return {
    riskLevel,
    riskRatio: Math.round(riskRatio * 100),
    riskScore,
    riskScoreLevel: scoreLevel(riskScore),
    missingInfoKeys,
    missingInfoCount,
    hasMissingInfo: missingInfoCount > 0,
  };
}
