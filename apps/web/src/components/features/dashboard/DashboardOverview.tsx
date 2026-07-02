"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  TrendingUp, TrendingDown, Package, Users, ArrowUpRight, ArrowDownRight, Plus,
  Clock, Building2, Wallet, DollarSign, Bell, CheckCircle2, FileText,
  Sparkles, Mail, ShieldAlert, ScrollText, ListChecks,
} from "lucide-react";
import Link from "next/link";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell,
} from "recharts";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useAuth";
import { useSmartNotifications } from "@/hooks/useNotifications";
import {
  useCompleteDashboardTask,
  useDashboardApprovals,
  useDashboardInvoices,
  useDashboardNotifications,
  useDashboardRates,
  useDashboardRecommendations,
  useDashboardTasks,
} from "@/hooks/useDashboard";
import {
  useContactBalance,
  useExpenseSummary,
  usePinnedKpiPreviews,
  useRevenueSummary,
  useStockSummary,
} from "@/hooks/useReporting";
import type { Recommendation } from "@/services/intelligence.service";
import type { KpiPreview } from "@/services/reporting.service";
import type {
  DashboardApprovalRequest,
  DashboardInvoice,
  DashboardNotification,
  DashboardTask,
} from "@/services/dashboard.service";
import type { SmartNotification } from "@/services/notification.service";
import { SalesTargetCard } from "@/components/features/sales/SalesTargetCard";
import { StockAlertDashboardCard } from "@/components/features/stock/StockAlertDashboardCard";

/* ── Types ──────────────────────────────────── */

interface CurrencyRate { code: string; forexSelling: number | null }

/* ── Constants ──────────────────────────────── */

const STATUS_DOT: Record<string, string> = { DRAFT: "bg-slate-500", SENT: "bg-blue-400", PAID: "bg-emerald-400", PARTIALLY_PAID: "bg-amber-400", OVERDUE: "bg-red-400", CANCELLED: "bg-slate-600" };
const STATUS_LABEL: Record<string, string> = { DRAFT: "Taslak", SENT: "Gönderildi", PAID: "Ödendi", PARTIALLY_PAID: "Kısmi", OVERDUE: "Gecikmiş", CANCELLED: "İptal" };
const TASK_TONE: Record<string, string> = { CRITICAL: "text-red-400", HIGH: "text-amber-400", MEDIUM: "text-sky-400", LOW: "text-slate-500" };
const RECOMMENDATION_TONE: Record<string, string> = { CRITICAL: "border-red-500/30 bg-red-500/5", HIGH: "border-amber-500/30 bg-amber-500/5", MEDIUM: "border-sky-500/25 bg-sky-500/5", LOW: "border-slate-700 bg-slate-950/30" };
const SMART_NOTIFICATION_TONE: Record<SmartNotification["severity"], string> = {
  critical: "border-red-500/25 bg-red-500/[0.04]",
  high: "border-amber-500/25 bg-amber-500/[0.04]",
  medium: "border-sky-500/25 bg-sky-500/[0.04]",
  low: "border-slate-700 bg-slate-950/30",
};
const SMART_NOTIFICATION_TEXT: Record<SmartNotification["severity"], string> = {
  critical: "text-red-300",
  high: "text-amber-300",
  medium: "text-sky-300",
  low: "text-slate-300",
};
const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#64748b"];
const TOOLTIP_STYLE = { background: "#1e293b", border: "none", borderRadius: 8, fontSize: 12 } as const;

/* ── Tiny helpers ───────────────────────────── */

/** Measures a block-level element whose dimensions are set by CSS (not flex-1). */
function useSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onResize = useCallback((entries: ResizeObserverEntry[]) => {
    const { width, height } = entries[0].contentRect;
    if (width > 0 && height > 0) {
      setSize(prev =>
        prev && prev.w === Math.floor(width) && prev.h === Math.floor(height)
          ? prev
          : { w: Math.floor(width), h: Math.floor(height) },
      );
    }
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, onResize]);
  return size;
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-slate-900 border border-slate-800 rounded-2xl shadow-lg ring-1 ring-white/[0.03] overflow-hidden", className)}>{children}</div>;
}

function CardHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-800/80">{icon}<h2 className="text-sm font-semibold text-slate-200">{title}</h2></div>;
}

type DashboardPreset = 'executive' | 'sales' | 'accounting' | 'warehouse' | 'hr' | 'custom';

const DASHBOARD_PRESET_LABEL: Record<DashboardPreset, string> = {
  executive: 'Yonetici',
  sales: 'Satis',
  accounting: 'Muhasebe',
  warehouse: 'Depo',
  hr: 'IK',
  custom: 'Custom',
};

const DASHBOARD_PRESET_DESCRIPTION: Record<DashboardPreset, string> = {
  executive: 'Ciro, karlilik, nakit akisi ve onaylar onceliklendirildi.',
  sales: 'Acik teklifler, musteri takipleri ve satis aksiyonlari onceliklendirildi.',
  accounting: 'Tahsilat, geciken faturalar, kasa/banka ve raporlar onceliklendirildi.',
  warehouse: 'Kritik stok, satin alma ihtiyaci ve sayim isleri onceliklendirildi.',
  hr: 'Izin talepleri, personel evraklari ve IK gorevleri onceliklendirildi.',
  custom: 'Rol izinlerine gore erisebildiginiz moduller gosteriliyor.',
};

function canReadModule(user: NonNullable<ReturnType<typeof useCurrentUser>['user']>, module: string): boolean {
  const membership = user.tenantMembership;
  return Boolean(
    membership?.isOwner ||
      membership?.role?.permissions.some((permission) => permission.module === module && permission.action === 'READ'),
  );
}

function detectDashboardPreset(user: NonNullable<ReturnType<typeof useCurrentUser>['user']> | null): DashboardPreset {
  if (!user) return 'custom';
  const membership = user.tenantMembership;
  if (membership?.isOwner) return 'executive';
  const roleName = membership?.role?.name.toLocaleLowerCase('tr-TR') ?? '';
  const canRead = (module: string) => canReadModule(user, module);

  if (roleName.includes('yonetici') || roleName.includes('yönetici') || roleName.includes('manager')) return 'executive';
  if (roleName.includes('muhasebe') || roleName.includes('account') || canRead('accounting')) return 'accounting';
  if (roleName.includes('depo') || roleName.includes('stok') || roleName.includes('warehouse')) return 'warehouse';
  if (roleName.includes('ik') || roleName.includes('insan') || roleName.includes('hr') || canRead('hr')) return 'hr';
  if (roleName.includes('satis') || roleName.includes('satış') || roleName.includes('sales')) return 'sales';
  if (canRead('invoicing') || canRead('contacts')) return 'sales';
  return 'custom';
}

function openAssistant(message: string) {
  window.dispatchEvent(new CustomEvent<string>("axon-chat-action", { detail: message }));
}

/* ── MAIN ───────────────────────────────────── */

export function DashboardOverview() {
  const { user, tenant } = useCurrentUser();
  const dashboardPreset = detectDashboardPreset(user);
  const canRead = (module: string) => (user ? !user.tenantMembership || canReadModule(user, module) : false);
  const canReadInvoicing = canRead('invoicing');
  const canReadAccounting = canRead('accounting');
  const canReadInventory = canRead('inventory');
  const canReadContacts = canRead('contacts');
  const canReadReporting = canRead('reporting');
  const canReadApprovals = canRead('approvals');
  const canReadTasks = canRead('tasks');
  const canReadNotifications = canRead('notifications');

  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Chart container refs
  const areaRef = useRef<HTMLDivElement>(null);
  const areaSize = useSize(areaRef);

  /* ── Queries ── */
  const now = new Date();
  const dF = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const dT = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const reportRange = { dateFrom: dF, dateTo: dT };
  const { data: rev } = useRevenueSummary(reportRange, { enabled: canReadReporting || canReadInvoicing });
  const { data: exp } = useExpenseSummary(reportRange, { enabled: canReadReporting || canReadAccounting });
  const { data: stk } = useStockSummary({ enabled: canReadReporting || canReadInventory });
  const { data: bal } = useContactBalance({ enabled: canReadReporting || canReadContacts || canReadAccounting });
  const { data: invs } = useDashboardInvoices(6, { enabled: canReadInvoicing });
  const { data: tcmb } = useDashboardRates();
  const { data: notifs } = useDashboardNotifications(5, { enabled: canReadNotifications });
  const { data: appr } = useDashboardApprovals(5, { enabled: canReadApprovals });
  const { data: tasks } = useDashboardTasks({ enabled: canReadTasks });
  const { data: recommendations = [] } = useDashboardRecommendations();
  const { data: pinnedKpis = [] } = usePinnedKpiPreviews({ enabled: canReadReporting });
  const { data: smartNotifications } = useSmartNotifications();
  const completeTask = useCompleteDashboardTask();

  /* ── Derived ── */
  const profit = (rev?.totalGross ?? 0) - (exp?.totalGross ?? 0);
  const tcmbUsd = tcmb?.currencies?.find((c: CurrencyRate) => c.code === "USD");
  const tcmbEur = tcmb?.currencies?.find((c: CurrencyRate) => c.code === "EUR");

  const areaData = [
    { month: "Oca", gelir: 28e3, gider: 18e3 },
    { month: "Şub", gelir: 35e3, gider: 22e3 },
    { month: "Mar", gelir: rev?.totalGross ?? 40e3, gider: exp?.totalGross ?? 25e3 },
  ].filter(d => d.gelir > 0 || d.gider > 0);

  const pieData = (() => {
    if (!invs?.data) return [];
    const m: Record<string, number> = {};
    invs.data.forEach((i: DashboardInvoice) => { m[i.status] = (m[i.status] ?? 0) + 1; });
    return Object.entries(m).map(([s, v]) => ({ name: STATUS_LABEL[s] ?? s, value: v }));
  })();

  const overdueInvoiceCount = invs?.data?.filter((i: DashboardInvoice) => i.status === "OVERDUE").length ?? 0;
  const lowStockItems = stk?.belowMinStock ?? [];
  const actionItems = [
    {
      key: "low-stock",
      title: "Kritik stok",
      value: stk?.summary.belowMinStockCount ?? 0,
      detail: lowStockItems[0] ? `${lowStockItems[0].productName} ilk sırada` : "Minimum altı ürün yok",
      icon: <Package className="w-4 h-4 text-amber-400" />,
      actionLabel: "Talep oluştur",
      message: "Stokta kritik ürünleri bul; taslak satın alma talebi için kalem sayısı ve tahmini toplam TL önizlemesi hazırla, onay almadan kayıt oluşturma",
      disabled: (stk?.summary.belowMinStockCount ?? 0) === 0,
    },
    {
      key: "overdue",
      title: "Geciken fatura",
      value: overdueInvoiceCount,
      detail: "Tahsilat hatırlatması hazırlat",
      icon: <Mail className="w-4 h-4 text-red-400" />,
      actionLabel: "Mail hazırla",
      message: "Vadesi geçmiş faturaları listele ve müşterilere gönderilecek kısa hatırlatma metni hazırla",
      disabled: overdueInvoiceCount === 0,
    },
    {
      key: "margin",
      title: "Kâr marjı riski",
      value: profit < 0 ? 1 : 0,
      detail: profit < 0 ? "Bu ay zarar görünüyor" : "Bu ay net kâr pozitif",
      icon: <ShieldAlert className="w-4 h-4 text-violet-400" />,
      actionLabel: "Analiz et",
      message: "Ürünleri alım ve satış fiyatlarına göre incele, negatif veya düşük kâr marjı riski olanları özetle",
      disabled: false,
    },
    {
      key: "cash",
      title: "Nakit akışı",
      value: profit < 0 || overdueInvoiceCount > 0 ? 1 : 0,
      detail: "Gelir, gider ve tahsilat riskini yorumla",
      icon: <Wallet className="w-4 h-4 text-sky-400" />,
      actionLabel: "Risk tahmini",
      message: "Bu ay gelir, gider, bekleyen ödeme ve gecikmiş faturaya göre nakit akışı riskini yorumla",
      disabled: false,
    },
    {
      key: "checks",
      title: "Çek / senet",
      value: 0,
      detail: "Yaklaşan vadeleri ve aksiyonları çıkar",
      icon: <ScrollText className="w-4 h-4 text-emerald-400" />,
      actionLabel: "Aksiyon çıkar",
      message: "Vadesi yaklaşan veya geçmiş çek/senetleri listele; bankaya verilecek, tahsil edildi işaretlenecek veya takip edilecek kayıtları öner",
      disabled: false,
    },
  ];
  const presetActionOrder: Record<DashboardPreset, readonly string[]> = {
    executive: ['cash', 'margin', 'overdue', 'low-stock', 'checks'],
    sales: ['overdue', 'cash', 'margin'],
    accounting: ['overdue', 'cash', 'checks', 'margin'],
    warehouse: ['low-stock'],
    hr: ['cash'],
    custom: ['overdue', 'low-stock', 'cash', 'margin', 'checks'],
  };
  const allowedActionKeys = presetActionOrder[dashboardPreset];
  const visibleActionItems = actionItems
    .filter((item) => allowedActionKeys.includes(item.key))
    .sort((left, right) => allowedActionKeys.indexOf(left.key) - allowedActionKeys.indexOf(right.key));

  /* ── JSX ── */
  return (
    <div className="space-y-5 pb-12">

      {/* ── Header ── */}
      <div className="bg-gradient-to-br from-slate-800/50 to-slate-900 border border-slate-700/50 rounded-2xl p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center text-base font-bold text-white shadow-lg shrink-0">
            {user?.name?.charAt(0) ?? "A"}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-white truncate">Merhaba, {user?.name?.split(" ")[0]}</h1>
            <div className="flex items-center gap-3 text-sm text-slate-400 mt-0.5">
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                <span className="truncate">{tenant?.companyName}</span>
              </span>
              <span className="w-1 h-1 rounded-full bg-slate-600 shrink-0" />
              <span className="flex items-center gap-1.5 font-mono text-sky-400 tabular-nums shrink-0">
                <Clock className="w-3.5 h-3.5" />{clock}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/contacts/new" className="hidden sm:flex items-center gap-2 px-3.5 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl hover:bg-amber-500/20 transition-colors text-sm font-medium">
            <Users className="w-4 h-4" /> Yeni Cari
          </Link>
          <Link href="/dashboard/products/new" className="hidden md:flex items-center gap-2 px-3.5 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl hover:bg-emerald-500/20 transition-colors text-sm font-medium">
            <Package className="w-4 h-4" /> Yeni Ürün
          </Link>
          <Link href="/dashboard/invoices/new" className="flex items-center gap-2 px-3.5 py-2 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-xl hover:bg-sky-500/20 transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" /> Yeni Fatura
          </Link>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <Card>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rol bazli dashboard</p>
            <h2 className="mt-1 text-sm font-semibold text-white">{DASHBOARD_PRESET_LABEL[dashboardPreset]} gorunumu</h2>
            <p className="mt-0.5 text-xs text-slate-500">{DASHBOARD_PRESET_DESCRIPTION[dashboardPreset]}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {user?.tenantMembership?.role?.name && (
              <span className="rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1 text-xs font-medium text-slate-300">
                {user.tenantMembership.role.name}
              </span>
            )}
            {user?.tenantMembership?.isOwner && (
              <span className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
                Owner
              </span>
            )}
          </div>
        </div>
      </Card>

      {pinnedKpis.length > 0 && (
        <Card>
          <CardHeader icon={<TrendingUp className="w-4 h-4 text-sky-400" />} title="Sabit KPI Kartları" />
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {pinnedKpis.slice(0, 4).map((kpi: KpiPreview) => (
              <div key={`${kpi.config.dataset}:${kpi.config.metric}:${kpi.config.dateRangePreset}`} className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{kpi.metricLabel}</p>
                    <p className="mt-1 text-xs text-slate-500">{kpi.datasetLabel}</p>
                  </div>
                  <span className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
                    {kpi.chartType}
                  </span>
                </div>
                <p className="mt-3 truncate text-xl font-bold text-white">{kpi.formattedValue}</p>
                {(kpi.period.from || kpi.period.to) && (
                  <p className="mt-1 text-[11px] text-slate-600">{kpi.period.from ?? "-"} / {kpi.period.to ?? "-"}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <SalesTargetCard enabled={canReadInvoicing} />
      <StockAlertDashboardCard enabled={canReadInventory} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 shrink-0"><TrendingUp className="w-5 h-5 text-emerald-400" /></div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 mb-1">Bu Ay Gelir</p>
              <p className="text-xl font-bold text-white tracking-tight truncate">{formatCurrency(rev?.totalGross ?? 0)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-red-500/10 shrink-0"><TrendingDown className="w-5 h-5 text-red-400" /></div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 mb-1">Bu Ay Gider</p>
              <p className="text-xl font-bold text-white tracking-tight truncate">{formatCurrency(exp?.totalGross ?? 0)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-sky-500/10 shrink-0"><Wallet className="w-5 h-5 text-sky-400" /></div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 mb-1">Net Kar/Zarar</p>
              <p className="text-xl font-bold text-white tracking-tight truncate">{formatCurrency(profit)}</p>
              <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold mt-1 px-1.5 py-0.5 rounded-full", profit >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
                {profit >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {profit >= 0 ? "Kârlı" : "Zararlı"}
              </span>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-5 flex items-center gap-4">
            <div className="p-2.5 rounded-xl bg-violet-500/10 shrink-0"><Package className="w-5 h-5 text-violet-400" /></div>
            <div className="min-w-0">
              <p className="text-xs text-slate-400 mb-1">Stok Değeri</p>
              <p className="text-xl font-bold text-white tracking-tight truncate">{formatCurrency(stk?.summary.totalStockValue ?? 0)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Action center */}
      <Card>
        <CardHeader icon={<Sparkles className="w-4 h-4 text-sky-400" />} title="Öneriler ve Aksiyonlar" />
        <div className="p-4 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-xs font-semibold text-slate-300">Akıllı öneriler</p>
                <p className="text-[11px] text-slate-500">Veriye göre önceliklendirilen aksiyonlar</p>
              </div>
              {recommendations.length > 0 && (
                <span className="h-6 px-2 inline-flex items-center rounded-lg bg-amber-500/10 text-[10px] font-bold text-amber-400">
                  {recommendations.length} aktif
                </span>
              )}
            </div>

            {recommendations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {recommendations.slice(0, 4).map((rec: Recommendation) => (
                  <div key={rec.id} className={cn("rounded-xl border p-4", RECOMMENDATION_TONE[rec.severity] ?? RECOMMENDATION_TONE.LOW)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-100 truncate">{rec.title}</p>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 min-h-8">{rec.detail}</p>
                      </div>
                      <span className={cn("text-[10px] font-bold shrink-0", TASK_TONE[rec.severity] ?? "text-slate-500")}>{rec.value}</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Link href={rec.href} className="flex-1 h-8 inline-flex items-center justify-center rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:border-slate-600 hover:bg-slate-800/50">
                        Ac
                      </Link>
                      <button
                        type="button"
                        onClick={() => openAssistant(rec.assistantPrompt)}
                        className="flex-1 h-8 rounded-lg border border-sky-500/30 bg-sky-500/10 text-xs font-medium text-sky-300 hover:bg-sky-500/15"
                      >
                        {rec.actionLabel}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-4 py-5 text-center text-sm text-slate-500">
                Yetkili olduğunuz modüllerde aktif öneri yok
              </div>
            )}
          </div>

          <div className="border-t border-slate-800/70 pt-4">
            <div className="mb-3">
              <p className="text-xs font-semibold text-slate-300">Hızlı aksiyonlar</p>
              <p className="text-[11px] text-slate-500">Sık kullanılan AI iş akışları</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
              {visibleActionItems.map((item) => (
                <div key={item.key} className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-2 rounded-lg bg-slate-800/80 shrink-0">{item.icon}</div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-200 truncate">{item.title}</p>
                        <p className="text-xs text-slate-500 truncate">{item.detail}</p>
                      </div>
                    </div>
                    <span className={cn(
                      "min-w-7 h-7 px-2 rounded-lg inline-flex items-center justify-center text-xs font-bold tabular-nums",
                      item.value > 0 ? "bg-amber-500/10 text-amber-400" : "bg-slate-800 text-slate-500",
                    )}>
                      {item.value}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={item.disabled}
                    onClick={() => openAssistant(item.message)}
                    className="mt-3 w-full h-8 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 transition-colors hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-slate-700 disabled:hover:bg-transparent disabled:hover:text-slate-300"
                  >
                    {item.actionLabel}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Area — Gelir & Gider Trendi */}
        <Card>
          <CardHeader icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} title="Gelir & Gider Trendi" />
          <div ref={areaRef} className="px-4 pb-4 pt-2" style={{ height: 280 }}>
            {areaSize && (
              <AreaChart width={areaSize.w} height={areaSize.h} data={areaData}>
                <defs>
                  <linearGradient id="gGe" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gGi" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} /><stop offset="100%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="gelir" name="Gelir" stroke="#10b981" fill="url(#gGe)" strokeWidth={2} />
                <Area type="monotone" dataKey="gider" name="Gider" stroke="#ef4444" fill="url(#gGi)" strokeWidth={2} />
              </AreaChart>
            )}
          </div>
        </Card>

        {/* Pie — Fatura Durumları */}
        <Card>
          <CardHeader icon={<FileText className="w-4 h-4 text-blue-400" />} title="Fatura Durumları" />
          <div className="p-4 flex flex-col sm:flex-row items-center justify-center gap-6" style={{ height: 280 }}>
            {pieData.length > 0 ? (
              <>
                <PieChart width={220} height={220}>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3} dataKey="value" strokeWidth={0} isAnimationActive={false}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
                <div className="flex flex-col gap-2.5 min-w-[100px]">
                  {pieData.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-xs text-slate-400 whitespace-nowrap">{d.name}</span>
                      <span className="text-xs font-semibold text-slate-200 ml-auto tabular-nums">{d.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-500">Fatura verisi yok</div>
            )}
          </div>
        </Card>
      </div>

      {/* ── Invoices + Balance / Currency ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="flex flex-col max-h-[420px]">
          <CardHeader icon={<FileText className="w-4 h-4 text-slate-400" />} title="Son Faturalar" />
          <div className="flex-1 overflow-auto divide-y divide-slate-800/50">
            {invs?.data?.length ? invs.data.map((inv: DashboardInvoice) => (
              <div key={inv.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/30 transition-colors">
                <div className={cn("w-2 h-2 rounded-full shrink-0", STATUS_DOT[inv.status])} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 font-medium">{inv.number}</p>
                  <p className="text-xs text-slate-500 truncate">{inv.contact?.name ?? "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-white tabular-nums">{formatCurrency(inv.totalGross)}</p>
                  <p className="text-[10px] text-slate-500">{STATUS_LABEL[inv.status] ?? inv.status}</p>
                </div>
              </div>
            )) : (
              <div className="p-8 text-center text-sm text-slate-500">Fatura bulunamadı</div>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader icon={<Users className="w-4 h-4 text-slate-400" />} title="Cari Bakiye Özeti" />
            <div className="p-5 grid grid-cols-2 gap-3">
              <div className="bg-emerald-500/5 rounded-xl p-4 text-center border border-emerald-500/10">
                <p className="text-[10px] text-emerald-500 uppercase tracking-wider mb-1">Alacak</p>
                <p className="text-lg font-bold text-emerald-400 tabular-nums">{formatCurrency(bal?.summary.totalReceivable ?? 0)}</p>
              </div>
              <div className="bg-red-500/5 rounded-xl p-4 text-center border border-red-500/10">
                <p className="text-[10px] text-red-500 uppercase tracking-wider mb-1">Borç</p>
                <p className="text-lg font-bold text-red-400 tabular-nums">{formatCurrency(bal?.summary.totalPayable ?? 0)}</p>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader icon={<DollarSign className="w-4 h-4 text-amber-400" />} title="Döviz Kurları (TCMB)" />
            <div className="p-5 grid grid-cols-2 gap-4">
              <div>
                <span className="text-xs text-slate-500 block mb-1">USD / TRY</span>
                <span className="text-lg font-bold text-white tabular-nums">₺{tcmbUsd?.forexSelling?.toFixed(4) ?? "—"}</span>
              </div>
              <div className="border-l border-slate-800 pl-4">
                <span className="text-xs text-slate-500 block mb-1">EUR / TRY</span>
                <span className="text-lg font-bold text-white tabular-nums">₺{tcmbEur?.forexSelling?.toFixed(4) ?? "—"}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Notifications + Approvals ── */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <Card className="flex flex-col max-h-[360px]">
          <CardHeader icon={<Bell className="w-4 h-4 text-amber-400" />} title="Akıllı Bildirim Merkezi" />
          <div className="flex-1 overflow-auto divide-y divide-slate-800/50">
            {smartNotifications && smartNotifications.items.length > 0 ? smartNotifications.items.slice(0, 8).map((item) => (
              <Link key={item.id} href={item.actionHref} className="block px-5 py-3.5 hover:bg-slate-800/30 transition-colors">
                <div className={cn("rounded-xl border px-3 py-2.5", SMART_NOTIFICATION_TONE[item.severity])}>
                  <div className="flex items-start justify-between gap-3">
                    <p className={cn("text-sm font-semibold leading-snug", SMART_NOTIFICATION_TEXT[item.severity])}>{item.title}</p>
                    <span className="rounded-lg bg-slate-950/70 px-2 py-0.5 text-xs font-bold text-slate-200">{item.count}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">{item.message}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="rounded-md bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">{item.suggestedAction.label}</span>
                    {item.lifecycleStatus === "acknowledged" && <span className="text-[10px] font-medium text-emerald-300">Ele alındı</span>}
                  </div>
                </div>
              </Link>
            )) : (
              <div className="p-8 text-center text-sm text-slate-500">Kritik akıllı uyarı yok</div>
            )}
          </div>
        </Card>

        <Card className="flex flex-col max-h-[360px]">
          <CardHeader icon={<ListChecks className="w-4 h-4 text-violet-400" />} title="Görevlerim" />
          <div className="flex-1 overflow-auto divide-y divide-slate-800/50">
            {tasks && tasks.length > 0 ? tasks.slice(0, 8).map((task: DashboardTask) => (
              <Link key={task.id} href={task.href} className="block px-5 py-3.5 hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-200 leading-snug truncate">{task.title}</p>
                  <span className={cn("text-[10px] font-semibold shrink-0", TASK_TONE[task.priority] ?? "text-slate-500")}>
                    {task.priority}
                  </span>
                </div>
                {task.detail && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{task.detail}</p>}
                {task.dueAt && <p className="text-[10px] text-slate-600 mt-1.5">{formatDate(task.dueAt)}</p>}
              </Link>
            )) : (
              <div className="p-8 text-center text-sm text-slate-500">Görev yok</div>
            )}
          </div>
        </Card>

        <Card className="flex flex-col max-h-[360px]">
          <CardHeader icon={<Bell className="w-4 h-4 text-sky-400" />} title="Bildirimler" />
          <div className="flex-1 overflow-auto divide-y divide-slate-800/50">
            {notifs && notifs.length > 0 ? notifs.map((n: DashboardNotification) => (
              <div key={n.id} className="px-5 py-3.5 hover:bg-slate-800/30 transition-colors">
                <p className="text-sm text-slate-200 leading-snug">{n.title}</p>
                {n.message && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{n.message}</p>}
                <p className="text-[10px] text-slate-600 mt-1.5">{formatDate(n.createdAt)}</p>
              </div>
            )) : (
              <div className="p-8 text-center text-sm text-slate-500">Bildirim yok</div>
            )}
          </div>
        </Card>

        <Card className="flex flex-col max-h-[360px]">
          <CardHeader icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} title="Bekleyen Onaylar" />
          <div className="flex-1 overflow-auto divide-y divide-slate-800/50">
            {appr && appr.length > 0 ? appr.map((a: DashboardApprovalRequest) => (
              <div key={a.id} className="px-5 py-3.5 hover:bg-slate-800/30 transition-colors flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200">{a.module} Onayı</p>
                  <p className="text-xs text-slate-500 mt-0.5">{a.requestedBy?.name ?? "—"}</p>
                </div>
                <span className="text-[10px] text-slate-600 shrink-0">{formatDate(a.createdAt)}</span>
              </div>
            )) : (
              <div className="p-8 text-center text-sm text-slate-500">Bekleyen onay yok</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
