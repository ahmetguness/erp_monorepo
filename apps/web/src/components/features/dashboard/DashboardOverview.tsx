"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, Package, Users, ArrowUpRight, ArrowDownRight, Plus,
  Clock, Building2, Wallet, DollarSign, Settings, Check,
  RefreshCw, LayoutDashboard, Bell, CheckCircle2, FileText, X
} from "lucide-react";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, PieChart, Pie, Cell,
} from "recharts";
import { apiClient } from "@/lib/api-client";
import { safeParse } from "@/lib/safe-parse";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { useCurrentUser, useMe } from "@/hooks/useAuth";
import { SingleResponseSchema, PaginatedResponseSchema } from "@/types/api.types";
import { z } from "zod";
import type { LayoutItem, ResponsiveLayouts } from "react-grid-layout";

import { Responsive as ResponsiveGridLayout, useContainerWidth } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { updateMePreferences } from "@/services/auth.service";
import { useUIStore } from "@/store/ui.store";

// ── Types ────────────────────────────────────

type GridLayouts = ResponsiveLayouts;

interface CurrencyRate {
  code: string;
  forexSelling: number | null;
}

interface InvoiceItem {
  id: string;
  number: string;
  date: string;
  status: string;
  type: string;
  totalGross: number;
  contact?: { name?: string } | null;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string | null;
  status: string;
  createdAt: string;
  module: string | null;
}

interface ApprovalItem {
  id: string;
  module: string;
  status: string;
  requestedBy?: { name?: string } | null;
  createdAt: string;
}

// schemas
const RevSummary = SingleResponseSchema(z.object({ period: z.unknown(), invoiceCount: z.coerce.number(), totalNet: z.coerce.number(), totalTax: z.coerce.number(), totalGross: z.coerce.number() }));
const StockSummary = SingleResponseSchema(z.object({ summary: z.object({ totalLines: z.coerce.number(), belowMinStockCount: z.coerce.number(), totalStockValue: z.coerce.number() }), belowMinStock: z.array(z.unknown()), stockLevels: z.array(z.unknown()) }));
const BalanceSummary = SingleResponseSchema(z.object({ contacts: z.array(z.unknown()), summary: z.object({ totalReceivable: z.coerce.number(), totalPayable: z.coerce.number() }) }));
const InvSchema = z.object({ id: z.string(), number: z.string(), date: z.string(), status: z.string(), type: z.string(), totalGross: z.coerce.number(), contact: z.object({ name: z.string().optional() }).nullable().optional() });
const NotifSchema = z.object({ id: z.string(), title: z.string(), message: z.string().nullable(), status: z.string(), createdAt: z.string(), module: z.string().nullable() }).array();
const ApprSchema = z.object({ id: z.string(), module: z.string(), status: z.string(), requestedBy: z.object({ name: z.string().optional() }).nullable().optional(), createdAt: z.string() }).array();

const STATUS_DOT: Record<string, string> = { DRAFT: "bg-slate-500", SENT: "bg-blue-400", PAID: "bg-emerald-400", PARTIALLY_PAID: "bg-amber-400", OVERDUE: "bg-red-400", CANCELLED: "bg-slate-600" };
const STATUS_LABEL: Record<string, string> = { DRAFT: "Taslak", SENT: "Gönderildi", PAID: "Ödendi", PARTIALLY_PAID: "Kısmi", OVERDUE: "Gecikmiş", CANCELLED: "İptal" };
const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"];

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "stat_rev", x: 0, y: 0, w: 3, h: 5, minW: 2, minH: 4 },
  { i: "stat_exp", x: 3, y: 0, w: 3, h: 5, minW: 2, minH: 4 },
  { i: "stat_profit", x: 6, y: 0, w: 3, h: 5, minW: 2, minH: 4 },
  { i: "stat_stk", x: 9, y: 0, w: 3, h: 5, minW: 2, minH: 4 },
  { i: "chart_trend", x: 0, y: 5, w: 7, h: 10, minW: 4, minH: 8 },
  { i: "chart_pie", x: 7, y: 5, w: 5, h: 10, minW: 3, minH: 8 },
  { i: "list_invoices", x: 0, y: 15, w: 8, h: 10, minW: 4, minH: 6 },
  { i: "widget_side_tools", x: 8, y: 15, w: 4, h: 10, minW: 3, minH: 6 },
  { i: "widget_notifications", x: 0, y: 25, w: 6, h: 9, minW: 3, minH: 6 },
  { i: "widget_approvals", x: 6, y: 25, w: 6, h: 9, minW: 3, minH: 6 },
];

const WIDGET_TITLES: Record<string, string> = {
  stat_rev: "Gelir Özeti",
  stat_exp: "Gider Özeti",
  stat_profit: "Net Kar/Zarar",
  stat_stk: "Stok Değeri",
  chart_trend: "Gelir & Gider Trendi",
  chart_pie: "Fatura Durumları",
  list_invoices: "Son Faturalar",
  widget_side_tools: "Cari & Döviz Aracı",
  widget_notifications: "Bildirimler",
  widget_approvals: "Bekleyen Onaylar"
};

/** Measures its own size and passes pixel width/height to a render prop, skipping ResponsiveContainer entirely */
function MeasuredChartWrapper({ render }: { render: (w: number, h: number) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 1 && height > 1) {
        setSize((prev) => (prev?.w === Math.floor(width) && prev?.h === Math.floor(height)) ? prev : { w: Math.floor(width), h: Math.floor(height) });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex-1 w-full relative">
      <div className="absolute inset-0">
        {size && render(size.w, size.h)}
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
  trend?: { value: string; positive: boolean };
}

function StatCard({ label, value, sub, icon, accent, trend }: StatCardProps) {
  return (
    <div className="flex flex-col h-full justify-center px-4 hover:bg-slate-800/10 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl ${accent} shrink-0`}>{icon}</div>
        <div className="flex-1 min-w-0"><p className="text-xs text-slate-400 mb-0.5">{label}</p><p className="text-lg font-bold text-white tracking-tight truncate">{value}</p></div>
      </div>
      {(trend || sub) && (
        <div className="flex items-center gap-2 mt-2 pl-12 shrink-0">
          {trend && <span className={`flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${trend.positive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>{trend.positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{trend.value}</span>}
          {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
        </div>
      )}
    </div>
  );
}

// MAIN
export function DashboardOverview() {
  const { user, tenant } = useCurrentUser();
  const { data: meData, isLoading: isMeLoading } = useMe();
  const toast = useUIStore(s => s.toast);

  const [layoutReady, setLayoutReady] = useState(false);
  const [layoutOverride, setLayoutOverride] = useState<GridLayouts | null>(null);
  const [hiddenOverride, setHiddenOverride] = useState<Record<string, boolean> | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Derive layouts from server preferences or local override
  const derivedFromPrefs = useMemo(() => {
    if (isMeLoading) return { layouts: { lg: DEFAULT_LAYOUT } as GridLayouts, hidden: {} as Record<string, boolean> };
    const prefs = meData?.preferences as Record<string, unknown> | null | undefined;
    const rglLayout = prefs?.rglLayout as { layouts?: unknown; hidden?: Record<string, boolean> } | undefined;
    if (!rglLayout) return { layouts: { lg: DEFAULT_LAYOUT } as GridLayouts, hidden: {} as Record<string, boolean> };

    let layouts: GridLayouts;
    const savedLayouts = rglLayout.layouts;
    if (Array.isArray(savedLayouts)) {
      layouts = { lg: savedLayouts as LayoutItem[] };
    } else if (savedLayouts && typeof savedLayouts === "object") {
      layouts = savedLayouts as GridLayouts;
    } else {
      layouts = { lg: DEFAULT_LAYOUT };
    }
    return { layouts, hidden: rglLayout.hidden || {} };
  }, [meData?.preferences, isMeLoading]);

  const layouts = layoutOverride ?? derivedFromPrefs.layouts;
  const hidden = hiddenOverride ?? derivedFromPrefs.hidden;

  useEffect(() => {
    if (isMeLoading) return;
    const timer = setTimeout(() => setLayoutReady(true), 100);
    return () => clearTimeout(timer);
  }, [isMeLoading]);

  const savePref = async (newLayouts: GridLayouts, newHidden: Record<string, boolean>) => {
    setLayoutOverride(newLayouts);
    setHiddenOverride(newHidden);
    try { await updateMePreferences({ rglLayout: { layouts: newLayouts, hidden: newHidden } }); } catch (err) {}
  };

  const onLayoutChange = (_currentLayout: readonly LayoutItem[], allLayouts: GridLayouts) => {
    if (!layoutReady) return;
    
    const mergedLayouts: GridLayouts = {};
    Object.keys(allLayouts).forEach((bp) => {
      const referenceLayout = layouts[bp] || DEFAULT_LAYOUT;
      mergedLayouts[bp] = [...referenceLayout].map((l: LayoutItem) => {
        const bpLayout = allLayouts[bp];
        const active = bpLayout ? [...bpLayout].find((c: LayoutItem) => c.i === l.i) : undefined;
        return active ? active : l;
      });
    });

    savePref(mergedLayouts, hidden);
  };

  const togHide = (id: string, state?: boolean) => { 
    const nH = { ...hidden, [id]: state ?? !hidden[id] }; 
    savePref(layouts, nH); 
    if(state) toast.info(`${WIDGET_TITLES[id]} gizlendi`); 
  };
  
  const resetLayout = () => { 
    savePref({ lg: DEFAULT_LAYOUT }, {}); 
    toast.success("Sıfırlandı"); 
  };

  // Queries
  const now = new Date();
  const dF = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const dT = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const { data: rev } = useQuery({ queryKey: ["d", "rev"], queryFn: async () => safeParse(RevSummary, (await apiClient.get("/api/reports/revenue-summary", { params: { dateFrom: dF, dateTo: dT } })).data, "rev").data });
  const { data: exp } = useQuery({ queryKey: ["d", "exp"], queryFn: async () => safeParse(RevSummary, (await apiClient.get("/api/reports/expense-summary", { params: { dateFrom: dF, dateTo: dT } })).data, "exp").data });
  const { data: stk } = useQuery({ queryKey: ["d", "stk"], queryFn: async () => safeParse(StockSummary, (await apiClient.get("/api/reports/stock-summary")).data, "stk").data });
  const { data: bal } = useQuery({ queryKey: ["d", "bal"], queryFn: async () => safeParse(BalanceSummary, (await apiClient.get("/api/reports/contact-balance")).data, "bal").data });
  const { data: invs } = useQuery({ queryKey: ["d", "invs"], queryFn: async () => safeParse(PaginatedResponseSchema(InvSchema), (await apiClient.get("/api/invoices", { params: { limit: 6 } })).data, "invs") });
  const { data: tcmb } = useQuery<{ currencies?: CurrencyRate[] }>({ queryKey: ["d", "tcmb"], queryFn: async () => (await apiClient.get("/api/currency-rates/tcmb")).data?.data, staleTime: 3e5 });
  
  const { data: notifs } = useQuery({ queryKey: ["d", "notifs"], queryFn: async () => { try { return safeParse(SingleResponseSchema(NotifSchema), (await apiClient.get("/api/notifications", { params: { limit: 5 } })).data, "n").data; } catch { return []; } } });
  const { data: appr } = useQuery({ queryKey: ["d", "appr"], queryFn: async () => { try { return safeParse(SingleResponseSchema(ApprSchema), (await apiClient.get("/api/approvals/requests", { params: { limit: 5 } })).data, "a").data; } catch { return []; } } });

  const profit = (rev?.totalGross ?? 0) - (exp?.totalGross ?? 0);
  const tcmbUsd = tcmb?.currencies?.find((c: CurrencyRate) => c.code === "USD");
  const tcmbEur = tcmb?.currencies?.find((c: CurrencyRate) => c.code === "EUR");
  
  const areaData = [{ month: "Oca", gelir: 28e3, gider: 18e3 }, { month: "Şub", gelir: 35e3, gider: 22e3 }, { month: "Mar", gelir: rev?.totalGross ?? 40e3, gider: exp?.totalGross ?? 25e3 }, { month: "Nis", gelir: 0, gider: 0 }].filter((d) => d.gelir > 0 || d.gider > 0);
  const pieData = (() => { if (!invs?.data) return []; const m: Record<string, number> = {}; invs.data.forEach((i: InvoiceItem) => { m[i.status] = (m[i.status] ?? 0) + 1; }); return Object.entries(m).map(([s, v]) => ({ name: STATUS_LABEL[s] ?? s, value: v })); })();
  
  const renderWidgetContent = (id: string) => {
    switch (id) {
      case "stat_rev": return <StatCard label="Bu Ay Gelir" value={formatCurrency(rev?.totalGross ?? 0)} icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} accent="bg-emerald-500/10" />;
      case "stat_exp": return <StatCard label="Bu Ay Gider" value={formatCurrency(exp?.totalGross ?? 0)} icon={<TrendingDown className="w-4 h-4 text-red-400" />} accent="bg-red-500/10" />;
      case "stat_profit": return <StatCard label="Net Kar/Zarar" value={formatCurrency(profit)} trend={{ value: profit >= 0 ? "Kârlı" : "Zararlı", positive: profit >= 0 }} icon={<Wallet className="w-4 h-4 text-sky-400" />} accent="bg-sky-500/10" />;
      case "stat_stk": return <StatCard label="Stok Değeri" value={formatCurrency(stk?.summary.totalStockValue ?? 0)} icon={<Package className="w-4 h-4 text-violet-400" />} accent="bg-violet-500/10" />;
      
      case "chart_trend": return (
        <div className="p-5 h-full flex flex-col"><h2 className="text-sm font-medium text-white mb-4 shrink-0 drag-handle cursor-grab">Gelir & Gider Trendi</h2>
          <MeasuredChartWrapper render={(w, h) => (
            <AreaChart width={w} height={h} data={areaData}><defs><linearGradient id="gGe" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient><linearGradient id="gGi" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} /><stop offset="100%" stopColor="#ef4444" stopOpacity={0} /></linearGradient></defs><XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} width={40} /><Tooltip contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8 }} /><Area type="monotone" dataKey="gelir" stroke="#10b981" fill="url(#gGe)" /><Area type="monotone" dataKey="gider" stroke="#ef4444" fill="url(#gGi)" /></AreaChart>
          )} /></div>
      );
      
      case "chart_pie": return (
        <div className="p-5 h-full flex flex-col"><h2 className="text-sm font-medium text-white mb-4 shrink-0 drag-handle cursor-grab">Fatura Durumları</h2>
          {pieData.length > 0 ? <MeasuredChartWrapper render={(w, h) => (
            <PieChart width={w} height={h}><Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={4} dataKey="value" strokeWidth={0}>{pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}</Pie><Tooltip contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8 }} /></PieChart>
          )} /> : <div className="flex-1 flex items-center justify-center text-xs text-slate-500">Veri Yok</div>}
        </div>
      );
      
      case "list_invoices": return (
        <div className="flex flex-col h-full">
          <div className="px-5 py-3 border-b border-slate-800 shrink-0 drag-handle cursor-grab"><h2 className="text-sm font-medium text-white flex items-center gap-2"><FileText className="w-4 h-4 text-slate-400" /> Son Faturalar</h2></div>
          <div className="flex-1 overflow-auto custom-scrollbar divide-y divide-slate-800/50">
            {invs?.data?.map((i: InvoiceItem) => <div key={i.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/20"><div className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT[i.status])} /><div className="flex-1 min-w-0"><p className="text-sm text-slate-200">{i.number}</p><p className="text-xs text-slate-500 truncate">{i.contact?.name ?? "—"}</p></div><span className="text-sm font-medium text-white shrink-0">{formatCurrency(i.totalGross)}</span></div>)}
          </div>
        </div>
      );

      case "widget_side_tools": return (
        <div className="flex flex-col divide-y divide-slate-800 h-full">
          <div className="p-5 flex-1 flex flex-col justify-center"><h2 className="text-sm font-medium text-white flex items-center gap-2 mb-3 drag-handle cursor-grab"><Users className="w-4 h-4 text-slate-400" /> Bakiye Özeti</h2>
            <div className="grid grid-cols-2 gap-3 mb-2 shrink-0"><div className="bg-emerald-500/5 rounded-lg p-3 text-center border border-emerald-500/10"><p className="text-[10px] text-emerald-500 uppercase">Alacak</p><p className="text-sm font-bold text-emerald-400">{formatCurrency(bal?.summary.totalReceivable ?? 0)}</p></div><div className="bg-red-500/5 rounded-lg p-3 text-center border border-red-500/10"><p className="text-[10px] text-red-500 uppercase">Borç</p><p className="text-sm font-bold text-red-400">{formatCurrency(bal?.summary.totalPayable ?? 0)}</p></div></div>
          </div>
          <div className="p-0 border-t border-slate-800 shrink-0"><div className="px-4 py-2 border-b border-slate-800/60"><h2 className="text-sm font-medium text-white flex items-center gap-2"><DollarSign className="w-4 h-4 text-amber-400" /> Döviz</h2></div>
            <div className="flex px-4 py-2 gap-4">
              <div className="flex-1"><span className="text-xs text-slate-400 block mb-1">USD</span><span className="text-sm font-medium text-white tabular-nums">₺{tcmbUsd?.forexSelling?.toFixed(2) ?? "—"}</span></div>
              <div className="flex-1 border-l border-slate-800 pl-4"><span className="text-xs text-slate-400 block mb-1">EUR</span><span className="text-sm font-medium text-white tabular-nums">₺{tcmbEur?.forexSelling?.toFixed(2) ?? "—"}</span></div>
            </div>
          </div>
        </div>
      );

      case "widget_notifications": return (
        <div className="flex flex-col h-full">
          <div className="px-5 py-3 border-b border-slate-800 shrink-0 drag-handle cursor-grab"><h2 className="text-sm font-medium text-white flex items-center gap-2"><Bell className="w-4 h-4 text-sky-400" /> Bildirimler</h2></div>
          <div className="flex-1 overflow-auto custom-scrollbar divide-y divide-slate-800/50">
            {notifs && notifs.length > 0 ? notifs.map((n: NotificationItem) => <div key={n.id} className="p-4 hover:bg-slate-800/20"><p className="text-sm text-slate-200 mb-1 leading-snug">{n.title}</p><p className="text-[10px] text-slate-500">{formatDate(n.createdAt)}</p></div>) : <div className="p-5 text-center text-xs text-slate-500">Bildirim yok</div>}
          </div>
        </div>
      );

      case "widget_approvals": return (
        <div className="flex flex-col h-full">
          <div className="px-5 py-3 border-b border-slate-800 shrink-0 drag-handle cursor-grab"><h2 className="text-sm font-medium text-white flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Bekleyen Onaylar</h2></div>
          <div className="flex-1 overflow-auto custom-scrollbar divide-y divide-slate-800/50">
             {appr && appr.length > 0 ? appr.map((a: ApprovalItem) => <div key={a.id} className="p-4 hover:bg-slate-800/20"><p className="text-sm text-slate-200 mb-1">{a.module} Onayı</p><p className="text-[10px] text-slate-500">{formatDate(a.createdAt)}</p></div>) : <div className="p-5 text-center text-xs text-slate-500">Bekleyen onay yok</div>}
          </div>
        </div>
      );
      
      default: return null;
    }
  };

  const activeLayouts: GridLayouts = {};
  Object.keys(layouts).forEach((bp) => {
    const bpLayout = layouts[bp];
    if (bpLayout) {
      activeLayouts[bp] = [...bpLayout].filter((l: LayoutItem) => !hidden[l.i]);
    }
  });
  const [clock, setClock] = useState("");
  const { width: containerWidth, mounted: containerMounted, containerRef } = useContainerWidth({ initialWidth: 1200 });

  useEffect(() => { 
    const id = setInterval(() => setClock(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })), 1000); 
    return () => clearInterval(id); 
  }, []);

  if (!layoutReady || !containerMounted) {
    return <div className="flex items-center justify-center min-h-[400px]"><RefreshCw className="w-6 h-6 animate-spin text-sky-500" /></div>;
  }

  return (
    <div className="space-y-6 pb-12 overflow-x-hidden">
      {/* HEADER */}
      <div className="relative bg-gradient-to-br from-slate-800/40 to-slate-900 border border-slate-700/50 rounded-2xl p-6 lg:flex items-center justify-between gap-5 z-20">
        <div className="flex items-center gap-4 mb-4 lg:mb-0">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center text-lg font-bold text-white shadow-lg shrink-0">{user?.name?.charAt(0) ?? "A"}</div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-white truncate">Merhaba, {user?.name?.split(" ")[0]}</h1>
            <div className="flex items-center gap-3 text-sm text-slate-400 mt-1">
              <span className="flex items-center gap-1.5 whitespace-nowrap"><Building2 className="w-3.5 h-3.5 text-slate-500" /> <span className="truncate">{tenant?.companyName}</span></span>
              <span className="w-1 h-1 rounded-full bg-slate-600 shrink-0" />
              <span className="flex items-center gap-1.5 font-mono text-sky-400 tabular-nums shrink-0"><Clock className="w-3.5 h-3.5" />{clock}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/contacts/new" className="hidden sm:flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl hover:bg-amber-500/20 transition-colors shadow-sm cursor-pointer">
            <Users className="w-4 h-4" /> <span className="text-sm font-medium">Yeni Cari</span>
          </Link>
          <Link href="/dashboard/inventory/new" className="hidden md:flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl hover:bg-emerald-500/20 transition-colors shadow-sm cursor-pointer">
            <Package className="w-4 h-4" /> <span className="text-sm font-medium">Yeni Ürün</span>
          </Link>
          <Link href="/dashboard/invoices/new" className="flex items-center gap-2 px-4 py-2 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-xl hover:bg-sky-500/20 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> <span className="text-sm font-medium">Yeni Fatura</span>
          </Link>
          <div className="relative">
            <button onClick={() => setShowSettings(!showSettings)} className={cn("flex items-center gap-2.5 px-4 py-2 rounded-xl border transition-colors shadow-sm", showSettings ? "bg-slate-700 border-sky-500/50" : "bg-slate-800/80 border-slate-700 hover:bg-slate-800")}>
              <LayoutDashboard className="w-4 h-4 text-slate-300" /><span className="text-sm font-medium text-slate-300">Layout</span>
            </button>
            {showSettings && (
              <div className="absolute right-0 mt-2 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 p-2">
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50 mb-2">
                  <span className="text-xs font-semibold text-slate-300">Görünürlük</span>
                  <button onClick={resetLayout} className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors"><RefreshCw className="w-3 h-3" /> Sıfırla</button>
                </div>
                {[...(layouts.lg || DEFAULT_LAYOUT)].map((l: LayoutItem) => (
                  <button key={l.i} onClick={() => togHide(l.i, false)} className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-700/50 text-left transition-colors">
                    <span className="text-sm text-slate-300">{WIDGET_TITLES[l.i] || l.i}</span>
                    {!hidden[l.i] ? <Check className="w-4 h-4 text-sky-400" /> : <div className="w-4 h-4 rounded border border-slate-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* REACT GRID LAYOUT */}
      <div className="relative min-h-[500px]" ref={containerRef}>
        {(activeLayouts.lg?.length ?? 0) === 0 && <div className="absolute inset-0 flex flex-col items-center justify-center pt-20"><Settings className="w-10 h-10 text-slate-600 mb-3" /><p className="text-slate-400 text-sm">Tüm widget&apos;lar gizlendi. Menüden açabilirsiniz.</p></div>}
        {containerWidth > 0 && (
          <ResponsiveGridLayout
            className="layout"
            width={containerWidth}
            layouts={activeLayouts}
            breakpoints={{ lg: 1024, md: 768, sm: 640, xs: 480, xxs: 0 }}
            cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={26}
            onLayoutChange={onLayoutChange as (...args: unknown[]) => void}
            dragConfig={{ enabled: true, handle: ".drag-handle", bounded: false, threshold: 3 }}
            margin={[20, 20] as [number, number]}
            resizeConfig={{ enabled: true, handles: ["se"] }}
          >
            {[...(activeLayouts.lg || [])].map((l: LayoutItem) => (
               <div 
                 key={l.i} 
                 data-grid={l}
                 className={cn(
                   "bg-slate-900 border border-slate-800 rounded-xl shadow-lg ring-1 ring-white/5 flex flex-col group overflow-hidden bg-clip-padding",
                   "hover:border-slate-700 hover:shadow-xl transition-shadow"
                 )}
               >
                 {/* Global Hover Toolbar */}
                 <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex items-center gap-1 bg-slate-900/80 backdrop-blur rounded p-1 shadow border border-slate-700">
                    <div className="drag-handle !cursor-grab p-1 text-slate-400 hover:text-white" title="Sürükle"><LayoutDashboard className="w-3.5 h-3.5" /></div>
                    <button onClick={() => togHide(l.i, true)} className="p-1 text-slate-400 hover:text-red-400" title="Gizle"><X className="w-3.5 h-3.5" /></button>
                 </div>
                 
                 {renderWidgetContent(l.i)}
               </div>
            ))}
          </ResponsiveGridLayout>
        )}
      </div>
    </div>
  );
}
