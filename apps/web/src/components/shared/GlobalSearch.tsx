'use client';

import {
  BriefcaseBusiness,
  CheckSquare,
  Clock3,
  CreditCard,
  FileText,
  Loader2,
  Mail,
  Package,
  Receipt,
  Search,
  Sparkles,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { cn, formatDate } from '@/lib/utils';
import type { GlobalSearchResult } from '@/services/search.service';

const RECENT_KEY = 'axon.commandPalette.recent';
const MAX_RECENT = 6;

const TYPE_LABEL: Record<GlobalSearchResult['type'], string> = {
  product: 'Ürün',
  contact: 'Cari',
  invoice: 'Fatura',
  sales_quote: 'Teklif',
  sales_order: 'Satış siparişi',
  purchase_order: 'Satın alma',
  payment: 'Ödeme',
  stock_movement: 'Stok',
  mail: 'Mail',
  employee: 'Personel',
  service_request: 'Servis',
  document: 'Doküman',
  task: 'Görev',
  action: 'Aksiyon',
};

const MODULE_LABEL: Record<string, string> = {
  inventory: 'Stok',
  contacts: 'Cari',
  invoicing: 'Satış',
  purchasing: 'Satın alma',
  accounting: 'Muhasebe',
  hr: 'İK',
  service: 'Servis',
  mail: 'Mail',
  attachments: 'Doküman',
  workflow: 'İş akışı',
  sales: 'Satış',
};

const TYPE_ICON: Record<GlobalSearchResult['type'], React.ReactNode> = {
  product: <Package className="h-4 w-4" />,
  contact: <User className="h-4 w-4" />,
  invoice: <Receipt className="h-4 w-4" />,
  sales_quote: <FileText className="h-4 w-4" />,
  sales_order: <BriefcaseBusiness className="h-4 w-4" />,
  purchase_order: <BriefcaseBusiness className="h-4 w-4" />,
  payment: <CreditCard className="h-4 w-4" />,
  stock_movement: <Package className="h-4 w-4" />,
  mail: <Mail className="h-4 w-4" />,
  employee: <User className="h-4 w-4" />,
  service_request: <Wrench className="h-4 w-4" />,
  document: <FileText className="h-4 w-4" />,
  task: <CheckSquare className="h-4 w-4" />,
  action: <Sparkles className="h-4 w-4" />,
};

interface RecentItem {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return true;
}

function isRecentItem(value: unknown): value is RecentItem {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    value.type in TYPE_LABEL &&
    typeof value.module === 'string' &&
    typeof value.title === 'string' &&
    (typeof value.subtitle === 'string' || value.subtitle === null) &&
    typeof value.href === 'string' &&
    (typeof value.status === 'string' || value.status === null) &&
    (typeof value.date === 'string' || value.date === null) &&
    (typeof value.amount === 'string' || value.amount === null);
}

function readRecentItems(): RecentItem[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isRecentItem).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function toRecentItem(result: GlobalSearchResult): RecentItem {
  return {
    id: result.id,
    type: result.type,
    module: result.module,
    title: result.title,
    subtitle: result.subtitle,
    href: result.href,
    status: result.status,
    date: result.date,
    amount: result.amount,
  };
}

function saveRecentItem(result: GlobalSearchResult, current: RecentItem[]): RecentItem[] {
  if (result.kind !== 'record') return current;
  const next = [toRecentItem(result), ...current.filter((item) => item.href !== result.href)].slice(0, MAX_RECENT);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

function ResultRow({
  item,
  active,
  onSelect,
}: {
  item: GlobalSearchResult | RecentItem;
  active: boolean;
  onSelect: () => void;
}) {
  const isAction = 'kind' in item && item.kind === 'action';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
        active ? 'bg-sky-500/10 text-sky-100' : 'text-slate-300 hover:bg-slate-900',
      )}
    >
      <span className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
        isAction ? 'border-violet-500/25 bg-violet-500/10 text-violet-300' : 'border-sky-500/20 bg-sky-500/10 text-sky-300',
      )}>
        {TYPE_ICON[item.type]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{item.title}</span>
          {item.status && <span className="shrink-0 rounded-md bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">{item.status}</span>}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>{TYPE_LABEL[item.type]}</span>
          <span>{MODULE_LABEL[item.module] ?? item.module}</span>
          {item.subtitle && <span className="max-w-[260px] truncate">{item.subtitle}</span>}
          {item.amount && <span>{item.amount}</span>}
          {item.date && <span>{formatDate(item.date)}</span>}
        </span>
      </span>
    </button>
  );
}

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: results = [], isFetching } = useGlobalSearch(query, open);
  const normalized = query.trim();

  function openPalette() {
    setRecent(readRecentItems());
    setActiveIndex(0);
    setOpen(true);
  }

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    function handler(event: KeyboardEvent) {
      const isCommand = event.ctrlKey || event.metaKey;
      if (isCommand && event.key.toLocaleLowerCase('tr-TR') === 'k') {
        event.preventDefault();
        setRecent(readRecentItems());
        setActiveIndex(0);
        setOpen(true);
      }
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const visibleResults = useMemo(() => {
    if (normalized.length >= 2) return results;
    return results.filter((item) => item.kind === 'action');
  }, [normalized.length, results]);

  const activeItems = normalized.length >= 2 ? visibleResults : [...visibleResults, ...recent];

  function closePalette() {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }

  function goTo(item: GlobalSearchResult | RecentItem) {
    if ('kind' in item) {
      setRecent((current) => saveRecentItem(item, current));
    }
    closePalette();
    router.push(item.href);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(activeItems.length - 1, 0)));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    }
    if (event.key === 'Enter' && activeItems[activeIndex]) {
      event.preventDefault();
      goTo(activeItems[activeIndex]);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        className="hidden h-9 w-full max-w-md items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 text-left text-sm text-slate-500 transition-colors hover:border-slate-700 hover:text-slate-300 md:flex"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Ürün, cari, mail, görev veya komut ara</span>
        <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-500">Ctrl K</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/75 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={() => closePalette()}>
          <div
            className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/40"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-900/45 px-4 py-3">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ara veya komut yaz..."
                className="h-9 min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
              />
              {isFetching && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
              <button type="button" onClick={closePalette} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200" aria-label="Kapat">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-3">
              {visibleResults.length > 0 && (
                <div>
                  <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                    {normalized.length >= 2 ? 'Sonuçlar' : 'Hızlı aksiyonlar'}
                  </div>
                  <div className="space-y-1">
                    {visibleResults.map((item, index) => (
                      <ResultRow
                        key={`${item.kind}:${item.type}:${item.id}`}
                        item={item}
                        active={index === activeIndex}
                        onSelect={() => goTo(item)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {normalized.length < 2 && recent.length > 0 && (
                <div className="mt-4">
                  <div className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                    <Clock3 className="h-3 w-3" />
                    Son kayıtlar
                  </div>
                  <div className="space-y-1">
                    {recent.map((item, index) => (
                      <ResultRow
                        key={`recent:${item.href}`}
                        item={item}
                        active={visibleResults.length + index === activeIndex}
                        onSelect={() => goTo(item)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {normalized.length >= 2 && visibleResults.length === 0 && !isFetching && (
                <div className="px-3 py-10 text-center">
                  <Search className="mx-auto h-7 w-7 text-slate-700" />
                  <p className="mt-3 text-sm font-medium text-slate-300">Sonuç bulunamadı</p>
                  <p className="mt-1 text-xs text-slate-600">Başka bir numara, isim, konu veya komut deneyin.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
