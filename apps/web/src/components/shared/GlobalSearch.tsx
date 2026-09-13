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
  ShieldCheck,
  Sparkles,
  User,
  Wrench,
  X,
  Compass,
  CornerDownLeft,
  SlidersHorizontal,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, isValidElement } from 'react';
import { useConfirmUnifiedCommand, useGlobalSearch } from '@/hooks/useGlobalSearch';
import { cn, formatDate } from '@/lib/utils';
import type { GlobalSearchResult } from '@/services/search.service';
import { getErrorMessage } from '@/types/api.types';
import { useUIStore } from '@/store/ui.store';
import {
  type CommandItem,
  type PaletteCategory,
  type RecentItem,
  getAllPageCommands,
  QUICK_SYSTEM_ACTIONS,
  matchesTurkishQuery,
  readRecentItems,
  saveRecentItem,
} from './command-palette';

// ─────────────────────────────────────────────
// Type Mappings & Icons
// ─────────────────────────────────────────────

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
  reporting: 'Raporlama',
  operations: 'Operasyon',
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

// ─────────────────────────────────────────────
// Row Item Component
// ─────────────────────────────────────────────

interface ResultRowProps {
  item: CommandItem | GlobalSearchResult | RecentItem;
  active: boolean;
  onSelect: () => void;
}

function ResultRow({ item, active, onSelect }: ResultRowProps) {
  const isAction = 'kind' in item && (item.kind === 'action' || item.kind === 'page');

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all',
        active
          ? 'bg-sky-500/15 text-sky-100 ring-1 ring-sky-500/30'
          : 'text-slate-300 hover:bg-slate-900/80',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
          isAction
            ? 'border-violet-500/25 bg-violet-500/10 text-violet-300'
            : 'border-sky-500/20 bg-sky-500/10 text-sky-300',
        )}
      >
        {'icon' in item && item.icon ? (
          isValidElement(item.icon) ? (
            item.icon
          ) : (
            (() => {
              const IconComp = item.icon as React.ComponentType<{ className?: string }>;
              return <IconComp className="h-4 w-4" />;
            })()
          )
        ) : (
          TYPE_ICON[item.type] ?? <Compass className="h-4 w-4" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{item.title}</span>
          {item.status && (
            <span className="shrink-0 rounded-md bg-slate-800/80 px-1.5 py-0.5 text-[10px] text-slate-400">
              {item.status}
            </span>
          )}
          {'kind' in item && item.kind === 'page' && (
            <span className="shrink-0 rounded-md bg-slate-800/60 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
              Sayfa
            </span>
          )}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>{TYPE_LABEL[item.type] ?? item.type}</span>
          <span>•</span>
          <span>{MODULE_LABEL[item.module] ?? item.module}</span>
          {item.subtitle && (
            <>
              <span>•</span>
              <span className="max-w-[260px] truncate">{item.subtitle}</span>
            </>
          )}
          {item.amount && (
            <>
              <span>•</span>
              <span className="text-slate-300 font-medium">{item.amount}</span>
            </>
          )}
          {item.date && (
            <>
              <span>•</span>
              <span>{formatDate(item.date)}</span>
            </>
          )}
        </span>
      </span>

      {active && (
        <span className="shrink-0 text-slate-400 hidden sm:flex items-center gap-1 text-[10px]">
          <span>Aç</span>
          <CornerDownLeft className="w-3 h-3" />
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────
// Command Palette Component
// ─────────────────────────────────────────────

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);

  const [activeIndex, setActiveIndex] = useState(0);
  const [activeCategory, setActiveCategory] = useState<PaletteCategory>('all');
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  const recentHrefs = useMemo(() => recent.map((item) => item.href), [recent]);
  const { data: unified, error: searchError, isError: isSearchError, isFetching } = useGlobalSearch(
    query,
    recentHrefs,
    open,
  );
  const confirmCommand = useConfirmUnifiedCommand();
  const backendResults = useMemo(() => unified?.results ?? [], [unified?.results]);
  const intent = unified?.intent ?? null;
  const normalizedQuery = query.trim();

  // Pre-load all client navigation pages once
  const allNavPages = useMemo(() => getAllPageCommands(), []);

  // Filter local pages with Turkish tolerance
  const matchedPages = useMemo(() => {
    if (!normalizedQuery) return allNavPages.slice(0, 8);
    return allNavPages.filter(
      (page) =>
        matchesTurkishQuery(page.title, normalizedQuery, page.keywords) ||
        matchesTurkishQuery(page.module, normalizedQuery) ||
        matchesTurkishQuery(page.subtitle ?? '', normalizedQuery),
    );
  }, [allNavPages, normalizedQuery]);

  // Filter local actions with Turkish tolerance
  const matchedActions = useMemo(() => {
    if (!normalizedQuery) return QUICK_SYSTEM_ACTIONS;
    return QUICK_SYSTEM_ACTIONS.filter(
      (action) =>
        matchesTurkishQuery(action.title, normalizedQuery, action.keywords) ||
        matchesTurkishQuery(action.subtitle ?? '', normalizedQuery),
    );
  }, [normalizedQuery]);

  // Combine and categorize active items
  const combinedItems = useMemo<Array<CommandItem | GlobalSearchResult>>(() => {
    if (activeCategory === 'pages') {
      return matchedPages;
    }
    if (activeCategory === 'actions') {
      return matchedActions;
    }
    if (activeCategory === 'records') {
      return backendResults.filter((item) => item.kind === 'record');
    }

    // 'all' category: Smart merged list
    if (!normalizedQuery) {
      // Empty query: Show quick actions, then top pages
      return [...matchedActions.slice(0, 3), ...matchedPages.slice(0, 6)];
    }

    // With query: Pages + Actions + Backend Records (deduplicated by href)
    const seenHrefs = new Set<string>();
    const list: Array<CommandItem | GlobalSearchResult> = [];

    // 1. Matched pages
    for (const page of matchedPages.slice(0, 6)) {
      if (!seenHrefs.has(page.href)) {
        seenHrefs.add(page.href);
        list.push(page);
      }
    }

    // 2. Matched actions
    for (const action of matchedActions.slice(0, 3)) {
      if (!seenHrefs.has(action.href)) {
        seenHrefs.add(action.href);
        list.push(action);
      }
    }

    // 3. Backend records
    for (const record of backendResults) {
      if (!seenHrefs.has(record.href)) {
        seenHrefs.add(record.href);
        list.push(record);
      }
    }

    return list;
  }, [activeCategory, backendResults, matchedActions, matchedPages, normalizedQuery]);

  const activeItems = useMemo(() => {
    if (!normalizedQuery && recent.length > 0 && activeCategory === 'all') {
      return [...combinedItems, ...recent];
    }
    return combinedItems;
  }, [activeCategory, combinedItems, normalizedQuery, recent]);

  function openPalette() {
    setRecent(readRecentItems());
    setActiveIndex(0);
    setOpen(true);
  }

  function closePalette() {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
    setSelectedOptionId(null);
    setActiveCategory('all');
  }

  // Focus input on open
  useEffect(() => {
    if (open) {
      setRecent(readRecentItems());
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Keyboard shortcut listener: Ctrl+K, Cmd+K, and Escape
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      const isCommand = event.ctrlKey || event.metaKey;
      const isKeyK =
        event.key === 'k' ||
        event.key === 'K' ||
        event.code === 'KeyK' ||
        event.keyCode === 75;

      if (isCommand && isKeyK) {
        event.preventDefault();
        setRecent(readRecentItems());
        setActiveIndex(0);
        setOpen(true);
      }

      if (event.key === 'Escape' && open) {
        closePalette();
      }
    }

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, setOpen]);

  // Ensure activeIndex is within bounds
  useEffect(() => {
    setActiveIndex(0);
  }, [query, activeCategory]);

  function goTo(item: CommandItem | GlobalSearchResult | RecentItem) {
    if ('action' in item && typeof item.action === 'function') {
      closePalette();
      item.action();
      return;
    }

    setRecent((current) => saveRecentItem(item, current));
    closePalette();
    router.push(item.href);
  }

  async function continueIntent() {
    if (!intent) return;
    if (!intent.requiresConfirmation && intent.href) {
      closePalette();
      router.push(intent.href);
      return;
    }
    const handoff = await confirmCommand.mutateAsync({
      query: normalizedQuery,
      intentId: intent.id,
      selectedOptionId,
    });
    closePalette();
    router.push(handoff.href);
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

  const CATEGORIES: Array<{ id: PaletteCategory; label: string }> = [
    { id: 'all', label: 'Tümü' },
    { id: 'pages', label: 'Sayfalar' },
    { id: 'actions', label: 'Aksiyonlar' },
    { id: 'records', label: 'Kayıtlar' },
  ];

  return (
    <>
      {/* ── Trigger Button in Header ── */}
      <button
        type="button"
        onClick={openPalette}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/40 px-3 text-left text-sm text-slate-500 transition-all hover:border-slate-700 hover:text-slate-300 hover:bg-slate-900/60"
      >
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="hidden min-w-0 flex-1 truncate md:inline">
          Sayfa, cari, fatura veya komut ara...
        </span>
        <span className="min-w-0 flex-1 truncate md:hidden">Hızlı ara...</span>
        <kbd className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[10px] text-slate-400 font-mono shadow-sm">
          ⌘K
        </kbd>
      </button>

      {/* ── Modal Overlay ── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/80 px-4 pt-[10vh] backdrop-blur-md transition-all"
          onMouseDown={() => closePalette()}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-black/60 ring-1 ring-white/[0.04] flex flex-col max-h-[80vh]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            {/* Input Bar */}
            <div className="flex items-center gap-3 border-b border-slate-800 bg-slate-900/50 px-4 py-3 shrink-0">
              <Search className="h-4 w-4 text-sky-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedOptionId(null);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Nereye gitmek istiyorsunuz? (örn: fatura, cari, sipariş, rapor)..."
                className="h-9 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              />
              {isFetching && <Loader2 className="h-4 w-4 animate-spin text-sky-400 shrink-0" />}
              <button
                type="button"
                onClick={closePalette}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200 transition-colors"
                aria-label="Kapat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-800/60 bg-slate-950/50 shrink-0 overflow-x-auto">
              <SlidersHorizontal className="w-3 h-3 text-slate-500 mr-1 shrink-0" />
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0',
                    activeCategory === cat.id
                      ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900',
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Content Results Area */}
            <div ref={resultsContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* Errors */}
              {(isSearchError || confirmCommand.isError) && (
                <div
                  role="alert"
                  className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200"
                >
                  {getErrorMessage(confirmCommand.error ?? searchError)}
                </div>
              )}

              {/* AI Intent Preview */}
              {intent && (
                <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 rounded-lg bg-violet-500/15 p-2 text-violet-300">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-violet-100">{intent.title}</p>
                        <span className="rounded bg-slate-950/60 px-1.5 py-0.5 text-[10px] text-slate-400">
                          %{Math.round(intent.confidence * 100)} güven
                        </span>
                        <span className="rounded bg-slate-950/60 px-1.5 py-0.5 text-[10px] text-slate-400">
                          {intent.risk} risk
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{intent.explanation}</p>
                      {intent.status === 'NEEDS_CLARIFICATION' && (
                        <div className="mt-2 grid gap-1.5">
                          {intent.options.map((option) => (
                            <label
                              key={option.id}
                              className="flex cursor-pointer gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2 text-xs text-slate-300"
                            >
                              <input
                                type="radio"
                                name="intent-option"
                                checked={selectedOptionId === option.id}
                                onChange={() => setSelectedOptionId(option.id)}
                              />
                              <span>
                                <strong className="block text-slate-200">{option.label}</strong>
                                {option.description}
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1 text-[11px] text-emerald-300">
                          <ShieldCheck className="h-3.5 w-3.5" /> Veri doğrudan değiştirilmez;
                          güvenli taslak açılır.
                        </span>
                        <button
                          type="button"
                          disabled={
                            confirmCommand.isPending ||
                            (intent.status === 'NEEDS_CLARIFICATION' && !selectedOptionId)
                          }
                          onClick={() => void continueIntent()}
                          className="rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          {confirmCommand.isPending ? 'Hazırlanıyor...' : 'Devam et'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Main List */}
              {combinedItems.length > 0 && (
                <div>
                  <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {normalizedQuery ? 'Sonuçlar' : 'Hızlı Erişim & Sayfalar'}
                  </div>
                  <div className="space-y-1">
                    {combinedItems.map((item, index) => (
                      <ResultRow
                        key={`${item.id}-${index}`}
                        item={item}
                        active={index === activeIndex}
                        onSelect={() => goTo(item)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Records (when query is empty) */}
              {!normalizedQuery && recent.length > 0 && activeCategory === 'all' && (
                <div className="mt-4 pt-3 border-t border-slate-800/60">
                  <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <Clock3 className="h-3 w-3" />
                    Son Ziyaret Edilenler
                  </div>
                  <div className="space-y-1">
                    {recent.map((item, index) => (
                      <ResultRow
                        key={`recent-${item.href}-${index}`}
                        item={item}
                        active={combinedItems.length + index === activeIndex}
                        onSelect={() => goTo(item)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {normalizedQuery && combinedItems.length === 0 && !isFetching && (
                <div className="px-3 py-12 text-center">
                  <Search className="mx-auto h-8 w-8 text-slate-700 mb-3" />
                  <p className="text-sm font-medium text-slate-300">
                    &quot;{query}&quot; ile eşleşen sonuç bulunamadı
                  </p>
                  <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                    Farklı bir kelime, Türkçe karakterli/karaktersiz terim veya modül adı
                    deneyebilirsiniz.
                  </p>
                </div>
              )}
            </div>

            {/* Footer with Keyboard Hints */}
            <div className="border-t border-slate-800/80 bg-slate-900/50 px-4 py-2 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                    ↑↓
                  </kbd>
                  Gezin
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                    ↵
                  </kbd>
                  Seç
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                    ESC
                  </kbd>
                  Kapat
                </span>
              </div>
              <span className="hidden sm:inline text-slate-600 font-mono">
                Axon Command Palette
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
