'use client';

import { useState, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Search, RefreshCw,
  DollarSign, Euro, PoundSterling, Banknote,
  ArrowLeftRight, Building2, Clock, Shield,
  Copy, Check, Repeat2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTcmbRates } from '@/hooks/useCurrencyRates';

interface TcmbCurrency {
  code: string; name: string; unit: number;
  forexBuying: number; forexSelling: number;
  banknoteBuying: number; banknoteSelling: number;
  crossRateUSD: number | null;
}

const POPULAR = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SAR', 'RUB', 'CNY'];

const CURRENCY_ICONS: Record<string, React.ReactNode> = {
  USD: <DollarSign className="w-4 h-4" />,
  EUR: <Euro className="w-4 h-4" />,
  GBP: <PoundSterling className="w-4 h-4" />,
};

function fmtRate(v: number): string {
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtResult(v: number): string {
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─────────────────────────────────────────────
// Hero card
// ─────────────────────────────────────────────

function HeroCard({ cur, label, code, icon, gradient, borderColor }: {
  cur: TcmbCurrency | undefined; label: string; code: string;
  icon: React.ReactNode; gradient: string; borderColor: string;
}) {
  if (!cur) return (
    <div className={cn('border rounded-xl p-4 animate-pulse', borderColor, 'bg-slate-900')}>
      <div className="h-14" />
    </div>
  );

  const spread = cur.forexSelling - cur.forexBuying;

  return (
    <div className={cn('relative overflow-hidden border rounded-xl p-4', borderColor, gradient)}>
      <div className="relative z-10">
        {/* Top: icon + code */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-white/5">{icon}</div>
            <div>
              <p className="text-sm font-bold text-white leading-none">{code}<span className="text-white/30 font-normal">/TRY</span></p>
              <p className="text-[10px] text-white/40 mt-0.5">{label}</p>
            </div>
          </div>
        </div>

        {/* Rates inline */}
        <div className="flex items-baseline gap-4">
          <div>
            <span className="text-[9px] text-white/40 uppercase">Alış</span>
            <p className="text-base font-bold text-white tabular-nums leading-tight">₺{fmtRate(cur.forexBuying)}</p>
          </div>
          <div>
            <span className="text-[9px] text-white/40 uppercase">Satış</span>
            <p className="text-base font-bold text-white tabular-nums leading-tight">₺{fmtRate(cur.forexSelling)}</p>
          </div>
          <div className="ml-auto text-right">
            <span className="text-[9px] text-white/30 uppercase">Makas</span>
            <p className="text-xs font-semibold text-amber-300 tabular-nums leading-tight">₺{spread.toFixed(4)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Converter
// ─────────────────────────────────────────────

function CurrencyConverter({ currencies }: { currencies: TcmbCurrency[] }) {
  const [amount, setAmount] = useState('100');
  const [fromCode, setFromCode] = useState('USD');
  const [reversed, setReversed] = useState(false);

  const selected = currencies.find((c) => c.code === fromCode);
  const buyRate = selected?.forexBuying ?? 0;
  const sellRate = selected?.forexSelling ?? 0;

  const resultBuy = reversed ? Number(amount || 0) / buyRate : Number(amount || 0) * buyRate;
  const resultSell = reversed ? Number(amount || 0) / sellRate : Number(amount || 0) * sellRate;

  const fromLabel = reversed ? 'TRY' : fromCode;
  const toLabel = reversed ? fromCode : 'TRY';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60">
        <div className="flex items-center gap-1.5">
          <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs font-semibold text-slate-400">Çevirici</span>
        </div>
        <button type="button" onClick={() => setReversed((r) => !r)}
          className="p-1 rounded-md text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors" title="Yönü değiştir">
          <Repeat2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-3 flex-1 flex flex-col justify-between space-y-2.5">
        <div className="flex gap-2">
          <input type="number" step="1" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg text-sm font-bold text-center text-white tabular-nums py-2 focus:outline-none focus:ring-2 focus:ring-amber-500" />
          <select value={fromCode} onChange={(e) => setFromCode(e.target.value)}
            className="w-24 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white px-2 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500">
            {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
        <div className="text-center text-[10px] text-slate-600">{fromLabel} → {toLabel}</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-2.5 py-2">
            <p className="text-[9px] text-emerald-500 uppercase">Alış</p>
            <p className="text-sm font-bold text-emerald-400 tabular-nums">
              {reversed ? fmtRate(resultBuy) : `₺${fmtResult(resultBuy)}`}
            </p>
          </div>
          <div className="bg-red-500/5 border border-red-500/10 rounded-lg px-2.5 py-2">
            <p className="text-[9px] text-red-500 uppercase">Satış</p>
            <p className="text-sm font-bold text-red-400 tabular-nums">
              {reversed ? fmtRate(resultSell) : `₺${fmtResult(resultSell)}`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function CurrencyRatesPage() {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'popular' | 'all'>('popular');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useTcmbRates();

  const currencies = useMemo(() => data?.currencies ?? [], [data?.currencies]);
  const filtered = useMemo(() => {
    let list = tab === 'popular' ? currencies.filter((c) => POPULAR.includes(c.code)) : currencies;
    if (search) { const q = search.toLowerCase(); list = list.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)); }
    return list;
  }, [currencies, tab, search]);

  const usd = currencies.find((c) => c.code === 'USD');
  const eur = currencies.find((c) => c.code === 'EUR');
  const gbp = currencies.find((c) => c.code === 'GBP');

  const copyRate = (code: string, rate: number) => {
    navigator.clipboard.writeText(rate.toFixed(4));
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1500);
  };

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-amber-600/15 via-slate-900 to-sky-600/5 border border-slate-700/50 rounded-2xl p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(245,158,11,0.08)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(56,189,248,0.04)_0%,transparent_60%)]" />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <Banknote className="w-5 h-5 text-amber-400" />
              </div>
              Döviz Kurları
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 ml-[52px]">
              <span className="flex items-center gap-1.5 text-sm text-slate-400">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />T.C. Merkez Bankası
              </span>
              {data?.date && (
                <>
                  <span className="w-px h-3.5 bg-slate-700" />
                  <span className="text-sm text-slate-500">{data.date}</span>
                </>
              )}
              {lastUpdated && (
                <>
                  <span className="w-px h-3.5 bg-slate-700" />
                  <span className="flex items-center gap-1 text-sm text-slate-500">
                    <Clock className="w-3.5 h-3.5" />{lastUpdated}
                  </span>
                </>
              )}
            </div>
          </div>
          <button onClick={() => refetch()} disabled={isFetching}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700/50 text-sm font-medium transition-all',
              isFetching ? 'text-amber-400' : 'text-slate-400 hover:text-white hover:border-slate-600',
            )}>
            <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
            {isFetching ? 'Güncelleniyor…' : 'Yenile'}
          </button>
        </div>
      </div>

      {/* ── Hero cards + converter ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <HeroCard cur={usd} label="ABD Doları" code="USD"
          icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
          gradient="bg-gradient-to-br from-emerald-600/10 via-slate-900 to-emerald-600/5"
          borderColor="border-emerald-500/15" />
        <HeroCard cur={eur} label="Euro" code="EUR"
          icon={<Euro className="w-5 h-5 text-sky-400" />}
          gradient="bg-gradient-to-br from-sky-600/10 via-slate-900 to-sky-600/5"
          borderColor="border-sky-500/15" />
        <HeroCard cur={gbp} label="İngiliz Sterlini" code="GBP"
          icon={<PoundSterling className="w-5 h-5 text-violet-400" />}
          gradient="bg-gradient-to-br from-violet-600/10 via-slate-900 to-violet-600/5"
          borderColor="border-violet-500/15" />
        <div className="hidden lg:block">
          {currencies.length > 0 && <CurrencyConverter currencies={currencies} />}
        </div>
      </div>

      {/* Mobile converter */}
      <div className="lg:hidden">
        {currencies.length > 0 && <CurrencyConverter currencies={currencies} />}
      </div>

      {/* ── Filters ─────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
          {(['popular', 'all'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={cn(
                'px-3.5 py-1.5 rounded-md text-xs font-medium transition-all',
                tab === t ? 'bg-amber-500/15 text-amber-400 shadow-sm' : 'text-slate-500 hover:text-slate-300',
              )}>
              {t === 'popular' ? `Popüler (${POPULAR.length})` : `Tümü (${currencies.length})`}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Döviz ara… (USD, Euro, Yen…)"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg text-sm text-white pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/30 transition-colors" />
        </div>
      </div>

      {/* ── Table ───────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-slate-800/30 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800/40">
          <div className="col-span-3">Döviz</div>
          <div className="col-span-2 text-right">Döviz Alış</div>
          <div className="col-span-2 text-right">Döviz Satış</div>
          <div className="col-span-2 text-right">Efektif Alış</div>
          <div className="col-span-2 text-right">Efektif Satış</div>
          <div className="col-span-1" />
        </div>

        {isLoading ? (
          <div className="py-20 text-center">
            <RefreshCw className="w-6 h-6 text-slate-700 mx-auto mb-3 animate-spin" />
            <p className="text-sm text-slate-600">TCMB kurları yükleniyor…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <Search className="w-6 h-6 text-slate-700 mx-auto mb-3" />
            <p className="text-sm text-slate-600">Sonuç bulunamadı</p>
            <p className="text-xs text-slate-700 mt-1">Farklı bir arama terimi deneyin</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {filtered.map((cur) => {
              const icon = CURRENCY_ICONS[cur.code];
              const isTop3 = POPULAR.slice(0, 3).includes(cur.code);
              const isCopied = copiedCode === cur.code;
              const spread = cur.forexSelling - cur.forexBuying;

              return (
                <div key={cur.code} className={cn(
                  'grid grid-cols-12 gap-2 px-5 py-3.5 items-center transition-all duration-150 group',
                  isTop3 ? 'bg-amber-500/[0.02] hover:bg-amber-500/[0.05]' : 'hover:bg-slate-800/30',
                )}>
                  <div className="col-span-3 flex items-center gap-3">
                    <div className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 transition-colors',
                      isTop3 ? 'bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/15' : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700',
                    )}>
                      {icon ?? cur.code.slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-slate-200">{cur.code}</p>
                        <span className="text-[10px] text-slate-600">/TRY</span>
                        {isTop3 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                      </div>
                      <p className="text-[10px] text-slate-500 truncate">{cur.name}</p>
                    </div>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-sm text-emerald-400 font-semibold tabular-nums">₺{fmtRate(cur.forexBuying)}</span>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-sm text-red-400 font-semibold tabular-nums">₺{fmtRate(cur.forexSelling)}</span>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-sm text-slate-400 tabular-nums">₺{fmtRate(cur.banknoteBuying)}</span>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-sm text-slate-400 tabular-nums">₺{fmtRate(cur.banknoteSelling)}</span>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button type="button" onClick={() => copyRate(cur.code, cur.forexSelling)}
                      className={cn(
                        'p-1.5 rounded-lg transition-all',
                        isCopied ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-700 hover:text-amber-400 hover:bg-amber-500/10 opacity-0 group-hover:opacity-100',
                      )}
                      title={`${cur.code} satış kurunu kopyala`}>
                      {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Source ───────────────────────────────── */}
      <div className="flex items-center justify-center gap-4 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Shield className="w-3.5 h-3.5 text-slate-700" />
          <span>Veriler <span className="text-slate-500 font-medium">T.C. Merkez Bankası (TCMB)</span> resmi kaynağından alınmaktadır</span>
        </div>
        <span className="w-px h-3.5 bg-slate-800" />
        <span className="text-xs text-slate-700">Yatırım tavsiyesi değildir</span>
      </div>
    </div>
  );
}
