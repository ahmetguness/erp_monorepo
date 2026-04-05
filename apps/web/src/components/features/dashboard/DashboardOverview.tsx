'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, TrendingDown, AlertTriangle, FileText,
  Package, Users, ArrowUpRight, ArrowDownRight,
  Plus, ShoppingCart, Clock, CalendarDays, Building2,
  ChevronRight, Wallet, BarChart3, DollarSign, Euro,
} from 'lucide-react';
import Link from 'next/link';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { useCurrentUser } from '@/hooks/useAuth';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import { z } from 'zod';

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

const RevSummary = SingleResponseSchema(z.object({
  period: z.object({ from: z.string(), to: z.string() }),
  invoiceCount: z.coerce.number(), totalNet: z.coerce.number(),
  totalTax: z.coerce.number(), totalGross: z.coerce.number(),
}));

const StockSummary = SingleResponseSchema(z.object({
  summary: z.object({ totalLines: z.coerce.number(), belowMinStockCount: z.coerce.number(), totalStockValue: z.coerce.number() }),
  belowMinStock: z.array(z.object({
    productId: z.string(), productCode: z.string(), productName: z.string(),
    warehouseName: z.string(), quantity: z.coerce.number(), minStockLevel: z.coerce.number(),
  })),
  stockLevels: z.array(z.unknown()),
}));

const BalanceSummary = SingleResponseSchema(z.object({
  contacts: z.array(z.object({
    contactId: z.string(), name: z.string(), code: z.string().nullable(),
    type: z.string(), balance: z.coerce.number(), lastEntryDate: z.string().nullable(),
  })),
  summary: z.object({ totalReceivable: z.coerce.number(), totalPayable: z.coerce.number() }),
}));

const InvSchema = z.object({
  id: z.string(), number: z.string(), date: z.string(), status: z.string(),
  type: z.string(), totalGross: z.coerce.number(),
  contact: z.object({ id: z.string(), name: z.string() }).optional(),
});



// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function StatCard({ label, value, sub, icon, accent, trend }: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; accent: string;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl ${accent}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500 mb-0.5">{label}</p>
          <p className="text-lg font-bold text-white tracking-tight truncate">{value}</p>
        </div>
      </div>
      {(trend || sub) && (
        <div className="flex items-center gap-2 mt-2 pl-12">
          {trend && (
            <span className={`flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${trend.positive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
              {trend.positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {trend.value}
            </span>
          )}
          {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
        </div>
      )}
    </div>
  );
}

function QuickBtn({ href, icon, label, color, ring }: { href: string; icon: React.ReactNode; label: string; color: string; ring: string }) {
  return (
    <Link href={href} className={`relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl border ${ring} bg-slate-800/40 backdrop-blur-sm hover:bg-slate-800/70 transition-all duration-200 group`}>
      <div className={`p-1.5 rounded-lg ${color} group-hover:scale-110 transition-transform duration-200`}>{icon}</div>
      <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors">{label}</span>
    </Link>
  );
}

const STATUS_DOT: Record<string, string> = {
  DRAFT: 'bg-slate-500', SENT: 'bg-blue-400', PAID: 'bg-emerald-400',
  PARTIALLY_PAID: 'bg-amber-400', OVERDUE: 'bg-red-400', CANCELLED: 'bg-slate-600',
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Taslak', SENT: 'Gönderildi', PAID: 'Ödendi',
  PARTIALLY_PAID: 'Kısmi', OVERDUE: 'Gecikmiş', CANCELLED: 'İptal',
};
const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'];


// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function DashboardOverview() {
  const { user, tenant } = useCurrentUser();
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const { data: rev } = useQuery({
    queryKey: ['dash', 'rev', firstDay], queryFn: async () => {
      const r = await apiClient.get('/api/reports/revenue-summary', { params: { dateFrom: firstDay, dateTo: lastDay } });
      return safeParse(RevSummary, r.data, 'rev').data;
    },
  });
  const { data: exp } = useQuery({
    queryKey: ['dash', 'exp', firstDay], queryFn: async () => {
      const r = await apiClient.get('/api/reports/expense-summary', { params: { dateFrom: firstDay, dateTo: lastDay } });
      return safeParse(RevSummary, r.data, 'exp').data;
    },
  });
  const { data: stk } = useQuery({
    queryKey: ['dash', 'stk'], queryFn: async () => {
      const r = await apiClient.get('/api/reports/stock-summary');
      return safeParse(StockSummary, r.data, 'stk').data;
    },
  });
  const { data: bal } = useQuery({
    queryKey: ['dash', 'bal'], queryFn: async () => {
      const r = await apiClient.get('/api/reports/contact-balance');
      return safeParse(BalanceSummary, r.data, 'bal').data;
    },
  });
  const { data: invs } = useQuery({
    queryKey: ['dash', 'invs'], queryFn: async () => {
      const r = await apiClient.get('/api/invoices', { params: { limit: 6, page: 1 } });
      return safeParse(PaginatedResponseSchema(InvSchema), r.data, 'invs');
    },
  });


  const profit = (rev?.totalGross ?? 0) - (exp?.totalGross ?? 0);

  // TCMB rates for widget
  const { data: tcmb } = useQuery({
    queryKey: ['dash', 'tcmb'], queryFn: async () => {
      const r = await apiClient.get('/api/currency-rates/tcmb');
      return r.data?.data as { date: string; currencies: Array<{ code: string; name: string; forexBuying: number; forexSelling: number }> } | undefined;
    },
    staleTime: 30 * 60 * 1000,
  });

  const tcmbUsd = tcmb?.currencies.find((c) => c.code === 'USD');
  const tcmbEur = tcmb?.currencies.find((c) => c.code === 'EUR');
  const tcmbGbp = tcmb?.currencies.find((c) => c.code === 'GBP');

  // Pie data
  const pieData = (() => {
    if (!invs?.data) return [];
    const m: Record<string, number> = {};
    invs.data.forEach((i) => { m[i.status] = (m[i.status] ?? 0) + 1; });
    return Object.entries(m).map(([s, v]) => ({ name: STATUS_LABEL[s] ?? s, value: v }));
  })();

  // Area chart — fake monthly trend (gelir vs gider)
  const areaData = [
    { month: 'Oca', gelir: 28000, gider: 18000 },
    { month: 'Şub', gelir: 35000, gider: 22000 },
    { month: 'Mar', gelir: rev?.totalGross ?? 40000, gider: exp?.totalGross ?? 25000 },
    { month: 'Nis', gelir: 0, gider: 0 },
  ].filter((d) => d.gelir > 0 || d.gider > 0);

  // Top debtors
  const debtors = (bal?.contacts ?? []).filter((c) => c.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 4);

  const [clock, setClock] = useState(() => new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

  useEffect(() => {
    const id = setInterval(() => {
      setClock(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const h = now.getHours();
  const greeting = h < 12 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar';

  return (
    <div className="space-y-5">
      {/* ── Welcome banner ──────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-sky-600/15 via-slate-900 to-violet-600/10 border border-slate-700/50 rounded-2xl">
        {/* Decorative mesh */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(56,189,248,0.08)_0%,transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(139,92,246,0.06)_0%,transparent_60%)]" />
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-sky-500/[0.03] blur-3xl" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-violet-500/[0.04] blur-3xl" />

        <div className="relative z-10 p-6 flex flex-col lg:flex-row lg:items-center gap-5">
          {/* Left — greeting + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-sky-500/20">
                {user?.name?.charAt(0) ?? 'A'}
              </div>
              <div>
                <h1 className="text-xl font-semibold text-white leading-tight">{greeting}, {user?.name?.split(' ')[0]} 👋</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 ml-[52px]">
              <span className="flex items-center gap-1.5 text-sm text-slate-400">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                {tenant?.companyName}
              </span>
              <span className="w-px h-3.5 bg-slate-700" />
              <span className="flex items-center gap-1.5 text-sm text-slate-400">
                <CalendarDays className="w-3.5 h-3.5 text-slate-500" />
                {now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              <span className="w-px h-3.5 bg-slate-700" />
              <span className="flex items-center gap-1.5 text-sm font-mono text-sky-400/80 tabular-nums">
                <Clock className="w-3.5 h-3.5 text-sky-500/60" />
                {clock}
              </span>
            </div>
          </div>

          {/* Right — quick actions */}
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <QuickBtn href="/dashboard/invoices/new" icon={<Plus className="w-3.5 h-3.5 text-sky-400" />} label="Fatura" color="bg-sky-500/15" ring="border-sky-500/10" />
            <QuickBtn href="/dashboard/products/new" icon={<Package className="w-3.5 h-3.5 text-emerald-400" />} label="Ürün" color="bg-emerald-500/15" ring="border-emerald-500/10" />
            <QuickBtn href="/dashboard/contacts/new" icon={<Users className="w-3.5 h-3.5 text-violet-400" />} label="Cari" color="bg-violet-500/15" ring="border-violet-500/10" />
            <QuickBtn href="/dashboard/sales-orders/quotes" icon={<ShoppingCart className="w-3.5 h-3.5 text-amber-400" />} label="Teklif" color="bg-amber-500/15" ring="border-amber-500/10" />
            <QuickBtn href="/dashboard/reports" icon={<BarChart3 className="w-3.5 h-3.5 text-pink-400" />} label="Rapor" color="bg-pink-500/15" ring="border-pink-500/10" />
          </div>
        </div>
      </div>

      {/* ── Stat cards ──────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Bu Ay Gelir" value={formatCurrency(rev?.totalGross ?? 0)} sub={`${rev?.invoiceCount ?? 0} fatura`}
          icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} accent="bg-emerald-500/10" />
        <StatCard label="Bu Ay Gider" value={formatCurrency(exp?.totalGross ?? 0)} sub={`${exp?.invoiceCount ?? 0} fatura`}
          icon={<TrendingDown className="w-4 h-4 text-red-400" />} accent="bg-red-500/10" />
        <StatCard label="Net Kar/Zarar" value={formatCurrency(profit)}
          trend={{ value: profit >= 0 ? 'Kârlı' : 'Zararlı', positive: profit >= 0 }}
          icon={<Wallet className="w-4 h-4 text-sky-400" />} accent="bg-sky-500/10" />
        <StatCard label="Stok Değeri" value={formatCurrency(stk?.summary.totalStockValue ?? 0)}
          sub={stk ? `${stk.summary.belowMinStockCount} kritik` : undefined}
          icon={<Package className="w-4 h-4 text-violet-400" />} accent="bg-violet-500/10" />
      </div>

      {/* ── Charts ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Area chart — 3 cols */}
        <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Gelir & Gider Trendi</h2>
          <p className="text-xs text-slate-500 mb-4">Aylık karşılaştırma</p>
          <div className="h-52 min-h-[208px] min-w-0 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={areaData}>
                <defs>
                  <linearGradient id="gGelir" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gGider" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₺${(v / 1000).toFixed(0)}K`} width={50} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 10, fontSize: 12 }} labelStyle={{ color: '#e2e8f0' }}
                  formatter={(v: unknown) => [formatCurrency(Number(v)), '']} />
                <Area type="monotone" dataKey="gelir" stroke="#10b981" strokeWidth={2} fill="url(#gGelir)" name="Gelir" />
                <Area type="monotone" dataKey="gider" stroke="#ef4444" strokeWidth={2} fill="url(#gGider)" name="Gider" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie chart — 2 cols */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Fatura Durumları</h2>
          <p className="text-xs text-slate-500 mb-3">Dağılım</p>
          {pieData.length > 0 ? (
            <>
              <div className="h-36 mb-3 min-h-[144px] min-w-0 overflow-hidden">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={38} outerRadius={62} paddingAngle={4} dataKey="value" strokeWidth={0}>
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {pieData.map((item, i) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-xs text-slate-400 flex-1 truncate">{item.name}</span>
                    <span className="text-xs font-semibold text-slate-300">{item.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-36 flex items-center justify-center text-sm text-slate-600">Veri yok</div>
          )}
        </div>
      </div>

      {/* ── Bottom grid ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent invoices */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2"><FileText className="w-4 h-4 text-slate-500" />Son Faturalar</h2>
            <Link href="/dashboard/invoices" className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-0.5">Tümü <ChevronRight className="w-3 h-3" /></Link>
          </div>
          {!invs || invs.data.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-600">Henüz fatura yok</div>
          ) : (
            <div className="divide-y divide-slate-800/50">
              {invs.data.map((inv) => (
                <Link key={inv.id} href={`/dashboard/invoices/${inv.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-slate-800/30 transition-colors">
                  <div className={cn('w-2 h-2 rounded-full shrink-0', STATUS_DOT[inv.status] ?? 'bg-slate-500')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">{inv.number}</span>
                      <span className="text-[10px] text-slate-600">{inv.type === 'PURCHASE' ? 'Alış' : 'Satış'}</span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{inv.contact?.name ?? '—'}</p>
                  </div>
                  <span className="text-xs text-slate-500 shrink-0">{formatDate(inv.date)}</span>
                  <span className="text-sm font-semibold text-white shrink-0 w-24 text-right">{formatCurrency(inv.totalGross)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right column — stacked */}
        <div className="space-y-4">
          {/* Alacak/Borç summary */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-slate-500" />Cari Bakiye</h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 text-center">
                <p className="text-[10px] text-emerald-500 uppercase tracking-wider mb-1">Alacak</p>
                <p className="text-base font-bold text-emerald-400">{formatCurrency(bal?.summary.totalReceivable ?? 0)}</p>
              </div>
              <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3 text-center">
                <p className="text-[10px] text-red-500 uppercase tracking-wider mb-1">Borç</p>
                <p className="text-base font-bold text-red-400">{formatCurrency(bal?.summary.totalPayable ?? 0)}</p>
              </div>
            </div>
            {debtors.length > 0 && (
              <div className="space-y-1.5">
                {debtors.map((c) => (
                  <div key={c.contactId} className="flex items-center gap-2 text-xs">
                    <div className="w-5 h-5 rounded-full bg-sky-500/10 flex items-center justify-center text-[10px] font-bold text-sky-400 shrink-0">{c.name.charAt(0)}</div>
                    <span className="text-slate-400 flex-1 truncate">{c.name}</span>
                    <span className="text-emerald-400 font-semibold">{formatCurrency(c.balance)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Currency rates widget */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-800/60 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-400" />Döviz
              </h2>
              <Link href="/dashboard/currency-rates" className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-0.5">
                Tümü <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-slate-800/40">
              {[
                { cur: tcmbUsd, code: 'USD', icon: <DollarSign className="w-3 h-3" />, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { cur: tcmbEur, code: 'EUR', icon: <Euro className="w-3 h-3" />, color: 'text-sky-400', bg: 'bg-sky-500/10' },
              ].map((item) => (
                <div key={item.code} className="flex items-center gap-2.5 px-4 py-2.5">
                  <div className={cn('w-6 h-6 rounded-md flex items-center justify-center', item.bg, item.color)}>{item.icon}</div>
                  <span className="text-xs font-semibold text-slate-300 w-8">{item.code}</span>
                  {item.cur ? (
                    <div className="flex-1 flex items-center justify-end gap-3">
                      <div className="text-right">
                        <p className="text-[9px] text-emerald-500">Alış</p>
                        <p className="text-xs font-bold text-white tabular-nums">₺{item.cur.forexBuying.toFixed(4)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] text-red-500">Satış</p>
                        <p className="text-xs font-bold text-white tabular-nums">₺{item.cur.forexSelling.toFixed(4)}</p>
                      </div>
                    </div>
                  ) : (
                    <span className="flex-1 text-right text-xs text-slate-600">—</span>
                  )}
                </div>
              ))}
            </div>
            {tcmb?.date && (
              <div className="px-4 py-1.5 border-t border-slate-800/40 text-center">
                <span className="text-[9px] text-slate-600">TCMB · {tcmb.date}</span>
              </div>
            )}
          </div>

          {/* Critical stock */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" />Kritik Stok</h2>
              <Link href="/dashboard/stock/levels" className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-0.5">Tümü <ChevronRight className="w-3 h-3" /></Link>
            </div>
            {!stk || stk.belowMinStock.length === 0 ? (
              <div className="py-4 text-center text-xs text-emerald-400">✓ Stoklar normal</div>
            ) : (
              <div className="space-y-2">
                {stk.belowMinStock.slice(0, 4).map((item) => {
                  const pct = Math.min(100, (item.quantity / item.minStockLevel) * 100);
                  return (
                    <div key={item.productId} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 truncate flex-1">{item.productName}</span>
                        <span className="text-red-400 font-semibold ml-2">{item.quantity}/{item.minStockLevel}</span>
                      </div>
                      <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', pct < 30 ? 'bg-red-500' : pct < 60 ? 'bg-amber-500' : 'bg-emerald-500')}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
