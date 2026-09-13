import { NAV_GROUPS, type NavGroup, type NavItem } from '@/lib/nav-config';
import type { CommandItem, RecentItem } from './command-palette.types';
import type { GlobalSearchResult } from '@/services/search.service';

export const RECENT_KEY = 'axon.commandPalette.recent';
export const MAX_RECENT = 6;

// ─────────────────────────────────────────────
// Turkish-tolerant text normalization
// ─────────────────────────────────────────────

/**
 * Normalizes a string for bulletproof Turkish search comparison.
 * Maps:
 *   İ, I, ı -> i
 *   Ğ, ğ -> g
 *   Ü, ü -> u
 *   Ş, ş -> s
 *   Ö, ö -> o
 *   Ç, ç -> c
 * Removes extraneous spacing and accents.
 */
export function normalizeTurkishSearch(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toString()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase()
    .trim();
}

/**
 * Performs a Turkish-aware fuzzy search match.
 * Returns true if the query characters/tokens match the target text.
 */
export function matchesTurkishQuery(target: string, query: string, extraKeywords?: string[]): boolean {
  const normQuery = normalizeTurkishSearch(query);
  if (!normQuery) return true;

  const normTarget = normalizeTurkishSearch(target);
  if (normTarget.includes(normQuery)) return true;

  if (extraKeywords && extraKeywords.length > 0) {
    const matchedKeyword = extraKeywords.some((kw) =>
      normalizeTurkishSearch(kw).includes(normQuery),
    );
    if (matchedKeyword) return true;
  }

  // Token-based matching for multi-word queries: "cari ekstre"
  const tokens = normQuery.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    return tokens.every((token) => normTarget.includes(token));
  }

  return false;
}

// ─────────────────────────────────────────────
// Navigation & System Actions Registry
// ─────────────────────────────────────────────

function flattenNavItems(items: NavItem[], groupLabel?: string): CommandItem[] {
  const result: CommandItem[] = [];

  for (const item of items) {
    result.push({
      id: `page-${item.href}-${item.label}`,
      kind: 'page',
      type: 'action',
      title: item.label,
      subtitle: groupLabel ? `${groupLabel} modülü` : 'Sayfa',
      module: item.module ?? 'Genel',
      href: item.href,
      icon: item.icon,
      keywords: [groupLabel ?? '', item.label, item.href],
    });

    if (item.children && item.children.length > 0) {
      for (const child of item.children) {
        result.push({
          id: `page-${child.href}-${child.label}`,
          kind: 'page',
          type: 'action',
          title: child.label,
          subtitle: `${item.label} › ${groupLabel ?? 'Menü'}`,
          module: child.module ?? item.module ?? 'Genel',
          href: child.href,
          icon: child.icon,
          keywords: [item.label, groupLabel ?? '', child.label, child.href],
        });
      }
    }
  }

  return result;
}

export function getAllPageCommands(): CommandItem[] {
  const allPages: CommandItem[] = [];
  for (const group of NAV_GROUPS) {
    allPages.push(...flattenNavItems(group.items, group.label));
  }
  return allPages;
}

export const QUICK_SYSTEM_ACTIONS: CommandItem[] = [
  {
    id: 'quick-action-new-invoice',
    kind: 'action',
    type: 'invoice',
    title: 'Yeni Fatura Oluştur',
    subtitle: 'Satış faturası düzenleme ekranı',
    module: 'Satış',
    href: '/dashboard/invoices',
    keywords: ['fatura', 'yeni', 'satış', 'kes', 'e-fatura'],
  },
  {
    id: 'quick-action-new-contact',
    kind: 'action',
    type: 'contact',
    title: 'Yeni Cari Hesap Tanımla',
    subtitle: 'Müşteri veya tedarikçi kartı aç',
    module: 'Cari',
    href: '/dashboard/contacts',
    keywords: ['cari', 'musteri', 'tedarikci', 'yeni', 'ekle', 'firma'],
  },
  {
    id: 'quick-action-new-quote',
    kind: 'action',
    type: 'sales_quote',
    title: 'Yeni Satış Teklifi Hazırla',
    subtitle: 'Fiyat teklifi hazırla ve gönder',
    module: 'Satış',
    href: '/dashboard/sales-orders/quotes',
    keywords: ['teklif', 'fiyat', 'satış', 'proforma', 'hazırla'],
  },
  {
    id: 'quick-action-new-order',
    kind: 'action',
    type: 'sales_order',
    title: 'Yeni Satış Siparişi Gir',
    subtitle: 'Onaylı müşteri siparişi oluştur',
    module: 'Satış',
    href: '/dashboard/sales-orders',
    keywords: ['siparis', 'satış', 'talep', 'emir'],
  },
  {
    id: 'quick-action-currency-rates',
    kind: 'action',
    type: 'payment',
    title: 'Güncel Döviz Kurlarını Gör',
    subtitle: 'TCMB canlı kurlar ve pariteler',
    module: 'Finans',
    href: '/dashboard/currency-rates',
    keywords: ['doviz', 'tcmb', 'dolar', 'euro', 'kur', 'parite'],
  },
  {
    id: 'quick-action-reports',
    kind: 'action',
    type: 'document',
    title: 'Mali & Operasyonel Raporlar',
    subtitle: 'Gelir, gider ve stok analizleri',
    module: 'Analiz',
    href: '/dashboard/reports',
    keywords: ['rapor', 'analiz', 'grafik', 'gelir', 'gider'],
  },
];

// ─────────────────────────────────────────────
// Recent Items Storage Helpers
// ─────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isRecentItem(value: unknown): value is RecentItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.module === 'string' &&
    typeof value.title === 'string' &&
    (typeof value.subtitle === 'string' || value.subtitle === null) &&
    typeof value.href === 'string'
  );
}

export function readRecentItems(): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isRecentItem).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function toRecentItem(result: GlobalSearchResult | CommandItem | RecentItem): RecentItem {
  return {
    id: result.id,
    type: result.type,
    module: result.module,
    title: result.title,
    subtitle: result.subtitle ?? null,
    href: result.href,
    status: result.status ?? null,
    date: result.date ?? null,
    amount: result.amount ?? null,
  };
}

export function saveRecentItem(
  result: GlobalSearchResult | CommandItem | RecentItem,
  current: RecentItem[],
): RecentItem[] {
  if (typeof window === 'undefined') return current;
  const next = [toRecentItem(result), ...current.filter((item) => item.href !== result.href)].slice(
    0,
    MAX_RECENT,
  );
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // quota safe
  }
  return next;
}
