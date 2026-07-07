import type { BadgeVariant } from '@/components/ui/Badge';
import type { ContactMissingInfoKey, ContactRiskScoreLevel, ContactType } from '@/services/contact.service';

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  CUSTOMER: 'Musteri',
  SUPPLIER: 'Satici',
  BOTH: 'Musteri + Satici',
};

export const CONTACT_TYPE_SHORT_LABELS: Record<ContactType, string> = {
  CUSTOMER: 'Musteri',
  SUPPLIER: 'Satici',
  BOTH: 'Ikisi',
};

export const CONTACT_TYPE_VARIANTS: Record<ContactType, BadgeVariant> = {
  CUSTOMER: 'info',
  SUPPLIER: 'warning',
  BOTH: 'purple',
};

export const CONTACT_MISSING_INFO_LABELS: Record<ContactMissingInfoKey, string> = {
  taxNumber: 'Vergi no',
  taxOffice: 'Vergi dairesi',
  email: 'E-posta',
  phone: 'Telefon',
  address: 'Adres',
  paymentTermDays: 'Vade',
};

export const CONTACT_RISK_SCORE_LABELS: Record<ContactRiskScoreLevel, string> = {
  LOW: 'Dusuk',
  MEDIUM: 'Orta',
  HIGH: 'Yuksek',
};

export const CONTACT_RISK_SCORE_VARIANTS: Record<ContactRiskScoreLevel, BadgeVariant> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
};

export function formatMissingInfo(keys: ContactMissingInfoKey[], limit = 3): string {
  if (keys.length === 0) return 'Eksik bilgi yok';
  const shown = keys.slice(0, limit).map((key) => CONTACT_MISSING_INFO_LABELS[key]);
  const remaining = keys.length - shown.length;
  return remaining > 0 ? `${shown.join(', ')} +${remaining}` : shown.join(', ');
}
