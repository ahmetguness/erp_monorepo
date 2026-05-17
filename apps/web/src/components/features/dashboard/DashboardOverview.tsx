"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { apiClient } from "@/lib/api-client";
import { safeParse } from "@/lib/safe-parse";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useAuth";
import { getTcmbRates } from "@/services/currency-rates.service";
import { getRecommendations, type Recommendation } from "@/services/intelligence.service";
import { updateTaskStatus } from "@/services/task.service";
import { SingleResponseSchema, PaginatedResponseSchema } from "@/types/api.types";
import { z } from "zod";

/* ── Types ──────────────────────────────────── */

interface CurrencyRate { code: string; forexSelling: number | null }

interface InvoiceItem {
  id: string; number: string; date: string; status: string; type: string;
  totalGross: number; contact?: { name?: string } | null;
}

interface NotificationItem {
  id: string; title: string; message: string | null; status: string;
  createdAt: string; module: string | null;
}

interface ApprovalItem {
  id: string; module: string; status: string;
  requestedBy?: { name?: string } | null; createdAt: string;
}

interface TaskItem {
  id: string; type: string; title: string; detail: string | null;
  priority: string; status?: string; dueAt: string | null; href: string;
}

/* ── Schemas ────────────────────────────────── */

const RevSummary = SingleResponseSchema(
  z.object({ period: z.unknown(), invoiceCount: z.coerce.number(), totalNet: z.coerce.number(), totalTax: z.coerce.number(), totalGross: z.coerce.number() }),
);
const StockSummary = SingleResponseSchema(
  z.object({
    summary: z.object({ totalLines: z.coerce.number(), belowMinStockCount: z.coerce.number(), totalStockValue: z.coerce.number() }),
    belowMinStock: z.array(z.object({
      productId: z.string(),
      productCode: z.string(),
      productName: z.string(),
      warehouseName: z.string(),
      quantity: z.coerce.number(),
      minStockLevel: z.coerce.number(),
    })),
    stockLevels: z.array(z.unknown()),
  }),
);
const BalanceSummary = SingleResponseSchema(
  z.object({ contacts: z.array(z.unknown()), summary: z.object({ totalReceivable: z.coerce.number(), totalPayable: z.coerce.number() }) }),
);
const InvSchema = z.object({
  id: z.string(), number: z.string(), date: z.string(), status: z.string(), type: z.string(),
  totalGross: z.coerce.number(), contact: z.object({ name: z.string().optional() }).nullable().optional(),
});
const NotifSchema = z.object({ id: z.string(), title: z.string(), message: z.string().nullable(), status: z.string(), createdAt: z.string(), module: z.string().nullable() }).array();
const ApprSchema = z.object({ id: z.string(), module: z.string(), status: z.string(), requestedBy: z.object({ name: z.string().optional() }).nullable().optional(), createdAt: z.string() }).array();
const TaskSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  priority: z.string(),
  status: z.string().optional(),
  dueAt: z.string().nullable(),
  href: z.string(),
});

/* ── Constants ──────────────────────────────── */

const STATUS_DOT: Record<string, string> = { DRAFT: "bg-slate-500", SENT: "bg-blue-400", PAID: "bg-emerald-400", PARTIALLY_PAID: "bg-amber-400", OVERDUE: "bg-red-400", CANCELLED: "bg-slate-600" };
const STATUS_LABEL: Record<string, string> = { DRAFT: "Taslak", SENT: "Gönderildi", PAID: "Ödendi", PARTIALLY_PAID: "Kısmi", OVERDUE: "Gecikmiş", CANCELLED: "İptal" };
const TASK_TONE: Record<string, string> = { CRITICAL: "text-red-400", HIGH: "text-amber-400", MEDIUM: "text-sky-400", LOW: "text-slate-500" };
const RECOMMENDATION_TONE: Record<string, string> = { CRITICAL: "border-red-500/30 bg-red-500/5", HIGH: "border-amber-500/30 bg-amber-500/5", MEDIUM: "border-sky-500/25 bg-sky-500/5", LOW: "border-slate-700 bg-slate-950/30" };
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

function openAssistant(message: string) {
  window.dispatchEvent(new CustomEvent<string>("axon-chat-action", { detail: message }));
}

/* ── MAIN ───────────────────────────────────── */

export function DashboardOverview() {
  const { user, tenant } = useCurrentUser();
  const queryClient = useQueryClient();

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

  const { data: rev } = useQuery({ queryKey: ["d", "rev"], queryFn: async () => safeParse(RevSummary, (await apiClient.get("/api/reports/revenue-summary", { params: { dateFrom: dF, dateTo: dT } })).data, "rev").data });
  const { data: exp } = useQuery({ queryKey: ["d", "exp"], queryFn: async () => safeParse(RevSummary, (await apiClient.get("/api/reports/expense-summary", { params: { dateFrom: dF, dateTo: dT } })).data, "exp").data });
  const { data: stk } = useQuery({ queryKey: ["d", "stk"], queryFn: async () => safeParse(StockSummary, (await apiClient.get("/api/reports/stock-summary")).data, "stk").data });
  const { data: bal } = useQuery({ queryKey: ["d", "bal"], queryFn: async () => safeParse(BalanceSummary, (await apiClient.get("/api/reports/contact-balance")).data, "bal").data });
  const { data: invs } = useQuery({ queryKey: ["d", "invs"], queryFn: async () => safeParse(PaginatedResponseSchema(InvSchema), (await apiClient.get("/api/invoices", { params: { limit: 6 } })).data, "invs") });
  const { data: tcmb } = useQuery({ queryKey: ["d", "tcmb"], queryFn: getTcmbRates, staleTime: 3e5 });
  const { data: notifs } = useQuery({ queryKey: ["d", "notifs"], queryFn: async () => { try { return safeParse(SingleResponseSchema(NotifSchema), (await apiClient.get("/api/notifications", { params: { limit: 5 } })).data, "n").data; } catch { return []; } } });
  const { data: appr } = useQuery({ queryKey: ["d", "appr"], queryFn: async () => { try { return safeParse(SingleResponseSchema(ApprSchema), (await apiClient.get("/api/approvals/requests", { params: { limit: 5 } })).data, "a").data; } catch { return []; } } });
  const { data: tasks } = useQuery({ queryKey: ["d", "tasks"], queryFn: async () => { try { return safeParse(SingleResponseSchema(z.array(TaskSchema)), (await apiClient.get("/api/tasks")).data, "tasks").data; } catch { return []; } } });
  const { data: recommendations = [] } = useQuery({ queryKey: ["d", "recommendations"], queryFn: async () => { try { return await getRecommendations(); } catch { return []; } } });
  const completeTask = useMutation({
    mutationFn: (taskId: string) => updateTaskStatus(taskId, "DONE"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["d", "tasks"] }),
  });

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
    invs.data.forEach((i: InvoiceItem) => { m[i.status] = (m[i.status] ?? 0) + 1; });
    return Object.entries(m).map(([s, v]) => ({ name: STATUS_LABEL[s] ?? s, value: v }));
  })();

  const overdueInvoiceCount = invs?.data?.filter((i: InvoiceItem) => i.status === "OVERDUE").length ?? 0;
  const lowStockItems = stk?.belowMinStock ?? [];
  const actionItems = [
    {
      key: "low-stock",
      title: "Kritik stok",
      value: stk?.summary.belowMinStockCount ?? 0,
      detail: lowStockItems[0] ? `${lowStockItems[0].productName} ilk sırada` : "Minimum altı ürün yok",
      icon: <Package className="w-4 h-4 text-amber-400" />,
      actionLabel: "Talep oluştur",
      message: "Stokta kritik ürünleri bul ve bunlar için taslak satın alma talebi oluştur",
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
              {actionItems.map((item) => (
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
            {invs?.data?.length ? invs.data.map((inv: InvoiceItem) => (
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
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="flex flex-col max-h-[360px]">
          <CardHeader icon={<ListChecks className="w-4 h-4 text-violet-400" />} title="Görevlerim" />
          <div className="flex-1 overflow-auto divide-y divide-slate-800/50">
            {tasks && tasks.length > 0 ? tasks.slice(0, 8).map((task: TaskItem) => (
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
            {notifs && notifs.length > 0 ? notifs.map((n: NotificationItem) => (
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
            {appr && appr.length > 0 ? appr.map((a: ApprovalItem) => (
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
