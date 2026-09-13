import type { LucideIcon } from 'lucide-react';
import type { GlobalSearchResult } from '@/services/search.service';

// ─────────────────────────────────────────────
// Command Palette Types
// ─────────────────────────────────────────────

export type PaletteCategory = 'all' | 'pages' | 'records' | 'actions';

export interface PaletteCategoryOption {
  id: PaletteCategory;
  label: string;
  count?: number;
}

export interface CommandItem {
  id: string;
  kind: 'page' | 'action' | 'record';
  type: GlobalSearchResult['type'];
  title: string;
  subtitle?: string | null;
  module: string;
  href: string;
  icon?: LucideIcon | React.ReactNode;
  status?: string | null;
  date?: string | null;
  amount?: string | null;
  keywords?: string[];
  action?: () => void;
}

export interface RecentItem {
  id: string;
  type: GlobalSearchResult['type'];
  module: string;
  title: string;
  subtitle: string | null;
  href: string;
  status: string | null;
  date: string | null;
  amount: string | null;
}
