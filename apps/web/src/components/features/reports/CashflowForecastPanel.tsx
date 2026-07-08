'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertCircle, Calendar, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useCashflowForecast } from '@/hooks/useReporting';
import { cn, formatCurrency } from '@/lib/utils';

const RISK_LABELS = {
  LOW: 'Dusuk risk',
  MEDIUM: 'Izleme gerekli',
  HIGH: 'Kritik risk',
} as const;

const RISK_CLASSES = {
  LOW: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10',
  MEDIUM: 'text-amber-400 border-amber-500/20 bg-amber-500/10',
  HIGH: 'text-red-400 border-red-500/20 bg-red-500/10',
} as const;

interface CurrencyTooltipPayload {
  name?: string;
  value?: number;
  color?: string;
}

interface CurrencyTooltipProps {
  active?: boolean;
  label?: string;
  payload?: CurrencyTooltipPayload[];
}

function CurrencyTooltip({ active, label, payload }: CurrencyTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-slate-300">{label}</p>
      <div className="space-y-1">
        {payload.map((item) => (
          <div key={`${item.name}-${item.color}`} className="flex items-center justify-between gap-4">
            <span style={{ color: item.color }} className="font-medium">{item.name}</span>
            <span className="font-bold text-white">{formatCurrency(item.value ?? 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CashflowForecastPanel() {
  const { data, isLoading, error } = useCashflowForecast();

  if (isLoading) {
    return (
      <div className="space-y-5 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-28 rounded-xl border border-slate-800 bg-slate-900" />
          ))}
        </div>
        <div className="h-80 rounded-xl border border-slate-800 bg-slate-900" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-4 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <p className="text-sm">Nakit akisi verileri yuklenirken bir hata olustu. Lutfen tekrar deneyin.</p>
      </div>
    );
  }

  const chartData = data.periods.map((period) => ({
    name: period.range,
    inflow: period.inflow.total,
    outflow: period.outflow.total,
    netFlow: period.netFlow,
    endingBalance: period.endingBalance,
  }));

  const bestScenario = data.scenarios.reduce((best, scenario) => (
    scenario.projectedEndingBalance > best.projectedEndingBalance ? scenario : best
  ), data.scenarios[0]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Wallet className="h-4 w-4 text-sky-400" />
            Likit bakiye
          </div>
          <p className="mt-3 text-2xl font-black text-white">{formatCurrency(data.startingBalance)}</p>
          <p className="mt-1 text-xs text-slate-500">Kasa ve banka hareketlerinden hesaplanan baslangic bakiyesi.</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Calendar className="h-4 w-4 text-indigo-400" />
            90 gun sonu
          </div>
          <p className="mt-3 text-2xl font-black text-white">{formatCurrency(data.projectedEndingBalance)}</p>
          <p className="mt-1 text-xs text-slate-500">Vadesi gelen alacak, borc ve cek/senet projeksiyonu.</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Risk durumu</span>
            <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', RISK_CLASSES[data.riskLevel])}>
              {RISK_LABELS[data.riskLevel]}
            </span>
          </div>
          <p className="mt-3 text-2xl font-black text-white">{bestScenario ? bestScenario.label : 'Beklenen'}</p>
          <p className="mt-1 text-xs text-slate-500">Senaryolar tahsilat ve odeme gerceklesme oranlarini degistirir.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.8fr)] gap-5">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-200">Nakit akisi projeksiyonu</h3>
              <p className="mt-1 text-xs text-slate-500">30/60/90 gunluk giris, cikis ve kapanis bakiyesi.</p>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="endingBalanceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}K`} />
                <Tooltip content={<CurrencyTooltip />} />
                <Area type="monotone" dataKey="endingBalance" name="Kapanis bakiyesi" stroke="#38bdf8" fill="url(#endingBalanceGradient)" strokeWidth={2} />
                <Area type="monotone" dataKey="netFlow" name="Net akis" stroke="#22c55e" fill="#22c55e22" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h3 className="text-sm font-bold text-slate-200">Senaryo bazli tahmin</h3>
          <p className="mt-1 text-xs text-slate-500">Tahsilat ve odeme oranlarina gore 90 gun sonu bakiye.</p>
          <div className="mt-5 space-y-3">
            {data.scenarios.map((scenario) => {
              const isPositive = scenario.projectedEndingBalance >= 0;
              return (
                <div key={scenario.key} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-white">{scenario.label}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        Tahsilat %{scenario.collectionRatePct} - Odeme %{scenario.paymentRatePct}
                      </p>
                    </div>
                    <span className={cn('text-sm font-black', isPositive ? 'text-emerald-400' : 'text-red-400')}>
                      {formatCurrency(scenario.projectedEndingBalance)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-200">Vade dagilimi</h3>
            <p className="mt-1 text-xs text-slate-500">Gecikmis ve yaklasan alacak/borc yogunlugu.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.dueBuckets} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="label" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(value) => `${Math.round(Number(value) / 1000)}K`} />
                <Tooltip content={<CurrencyTooltip />} />
                <Bar dataKey="receivables" name="Alacak" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="checks" name="Cek/Senet" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="payables" name="Borc" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2">
            {data.dueBuckets.map((bucket) => {
              const isPositive = bucket.total >= 0;
              return (
                <div key={bucket.label} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300">{bucket.label}</span>
                    <span className={cn('text-xs font-black', isPositive ? 'text-emerald-400' : 'text-red-400')}>
                      {isPositive ? '+' : ''}
                      {formatCurrency(bucket.total)}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-emerald-400" /> {formatCurrency(bucket.receivables)}</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3 text-sky-400" /> {formatCurrency(bucket.checks)}</span>
                    <span className="flex items-center gap-1"><TrendingDown className="h-3 w-3 text-red-400" /> {formatCurrency(bucket.payables)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
