import type { ReactNode } from 'react';

// ─────────────────────────────────────────────
// Dashboard Tab
// ─────────────────────────────────────────────

export type DashboardTab = 'overview' | 'financial' | 'operations' | 'team';

export const DASHBOARD_TAB_LABELS: Record<DashboardTab, string> = {
  overview: 'Genel Bakış',
  financial: 'Finansal',
  operations: 'Operasyon',
  team: 'Ekip',
};

// ─────────────────────────────────────────────
// Dashboard Preset (role-based view)
// ─────────────────────────────────────────────

export type DashboardPreset =
  | 'executive'
  | 'sales'
  | 'accounting'
  | 'warehouse'
  | 'hr'
  | 'custom';

export const DASHBOARD_PRESET_LABEL: Record<DashboardPreset, string> = {
  executive: 'Yönetici',
  sales: 'Satış',
  accounting: 'Muhasebe',
  warehouse: 'Depo',
  hr: 'IK',
  custom: 'Custom',
};

export const DASHBOARD_PRESET_DESCRIPTION: Record<DashboardPreset, string> = {
  executive: 'Ciro, kârlılık, nakit akışı ve onaylar önceliklendirildi.',
  sales: 'Açık teklifler, müşteri takipleri ve satış aksiyonları önceliklendirildi.',
  accounting: 'Tahsilat, geciken faturalar, kasa/banka ve raporlar önceliklendirildi.',
  warehouse: 'Kritik stok, satın alma ihtiyacı ve sayım işleri önceliklendirildi.',
  hr: 'İzin talepleri, personel evrakları ve IK görevleri önceliklendirildi.',
  custom: 'Rol izinlerine göre erişebildiğiniz modüller gösteriliyor.',
};

/** Preset'e göre hangi tab varsayılan açık olsun */
export const DASHBOARD_PRESET_DEFAULT_TAB: Record<DashboardPreset, DashboardTab> = {
  executive: 'financial',
  sales: 'overview',
  accounting: 'financial',
  warehouse: 'operations',
  hr: 'team',
  custom: 'overview',
};

// ─────────────────────────────────────────────
// Currency Rate
// ─────────────────────────────────────────────

export interface CurrencyRate {
  code: string;
  forexSelling: number | null;
}

// ─────────────────────────────────────────────
// Action Item (quick AI actions)
// ─────────────────────────────────────────────

export interface ActionItem {
  key: string;
  title: string;
  value: number;
  detail: string;
  icon: ReactNode;
  actionLabel: string;
  message: string;
  disabled: boolean;
}

export type ActionItemKey = 'low-stock' | 'overdue' | 'margin' | 'cash' | 'checks';

export const PRESET_ACTION_ORDER: Record<DashboardPreset, readonly ActionItemKey[]> = {
  executive: ['cash', 'margin', 'overdue', 'low-stock', 'checks'],
  sales: ['overdue', 'cash', 'margin'],
  accounting: ['overdue', 'cash', 'checks', 'margin'],
  warehouse: ['low-stock'],
  hr: ['cash'],
  custom: ['overdue', 'low-stock', 'cash', 'margin', 'checks'],
};

// ─────────────────────────────────────────────
// Severity / priority tone maps (re-exported for tabs)
// ─────────────────────────────────────────────

export type RecommendationSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type TaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
