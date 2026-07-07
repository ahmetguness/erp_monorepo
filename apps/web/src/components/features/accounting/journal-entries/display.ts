import type { BadgeVariant } from '@/components/ui/Badge';
import type { JournalEntry } from '@/services/accounting.service';

export interface JournalEntrySourceInfo {
  label: string;
  href: string | null;
}

const JOURNAL_TYPE_LABELS: Record<JournalEntry['type'], string> = {
  MANUAL: 'Manuel',
  AUTO_INVOICE: 'Otomatik fatura',
  AUTO_PAYMENT: 'Otomatik odeme',
  AUTO_PAYROLL: 'Otomatik bordro',
  OPENING: 'Acilis',
  CLOSING: 'Kapanis',
};

const JOURNAL_TYPE_VARIANTS: Record<JournalEntry['type'], BadgeVariant> = {
  MANUAL: 'neutral',
  AUTO_INVOICE: 'info',
  AUTO_PAYMENT: 'success',
  AUTO_PAYROLL: 'purple',
  OPENING: 'purple',
  CLOSING: 'danger',
};

export function getJournalEntryTypeLabel(type: JournalEntry['type']): string {
  return JOURNAL_TYPE_LABELS[type];
}

export function getJournalEntryTypeVariant(type: JournalEntry['type']): BadgeVariant {
  return JOURNAL_TYPE_VARIANTS[type];
}

export function getJournalEntrySourceInfo(entry: Pick<JournalEntry, 'refType' | 'refId'>): JournalEntrySourceInfo | null {
  if (!entry.refType || !entry.refId) return null;

  if (entry.refType === 'INVOICE') return { label: 'Fatura', href: `/dashboard/invoices/${entry.refId}` };
  if (entry.refType === 'PAYMENT') return { label: 'Odeme', href: '/dashboard/payments' };
  if (entry.refType === 'STOCK_COUNT') return { label: 'Stok sayimi', href: '/dashboard/stock/counts' };
  if (entry.refType === 'WORK_ORDER') return { label: 'Is emri', href: `/dashboard/production/work-orders/${entry.refId}` };
  if (entry.refType === 'JOURNAL_REVERSAL') return { label: 'Ters kayit kaynagi', href: null };

  return { label: entry.refType, href: null };
}
