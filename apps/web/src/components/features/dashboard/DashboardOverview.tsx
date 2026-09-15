"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Package, Mail, ShieldAlert, ScrollText, Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useAuth";
import { useSmartNotifications } from "@/hooks/useNotifications";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import {
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
import { createUserAccessContext, hasUserPermission, type UserAccessContext } from "@/domain/access/user-access-context";
import type { PlanName } from '@/lib/plans';
import type { AuthUser } from "@repo/types";
import type { Recommendation } from "@/services/intelligence.service";
import type { CurrencyRate } from "./types/dashboard.types";
import {
  type DashboardPreset,
  type DashboardTab,
  type ActionItem,
  type ActionItemKey,
  DASHBOARD_TAB_LABELS,
  DASHBOARD_PRESET_DEFAULT_TAB,
  PRESET_ACTION_ORDER,
} from "./types/dashboard.types";

// Tab components
import { OverviewTab } from "./tabs/OverviewTab";
import { FinancialTab } from "./tabs/FinancialTab";
import { OperationsTab } from "./tabs/OperationsTab";
import { TeamTab } from "./tabs/TeamTab";
import { BasicDashboards } from '@/features/basic-dashboard';

// ─────────────────────────────────────────────
// Access helpers
// ─────────────────────────────────────────────

function canReadModule(context: UserAccessContext | null, module: string): boolean {
  return hasUserPermission(context, module, "READ");
}

function detectDashboardPreset(
  user: AuthUser | null,
  context: UserAccessContext | null,
): DashboardPreset {
  if (!user) return "custom";
  if (context?.isOwner) return "executive";

  const roleName = context?.roleName?.toLocaleLowerCase("tr-TR") ?? "";
  const canRead = (module: string) => canReadModule(context, module);

  if (roleName.includes("yonetici") || roleName.includes("yönetici") || roleName.includes("manager")) return "executive";
  if (roleName.includes("muhasebe") || roleName.includes("account") || canRead("accounting")) return "accounting";
  if (roleName.includes("depo") || roleName.includes("stok") || roleName.includes("warehouse")) return "warehouse";
  if (roleName.includes("ik") || roleName.includes("insan") || roleName.includes("hr") || canRead("hr")) return "hr";
  if (roleName.includes("satis") || roleName.includes("satış") || roleName.includes("sales")) return "sales";
  if (canRead("invoicing") || canRead("contacts")) return "sales";
  return "custom";
}

// ─────────────────────────────────────────────
// Tab Bar
// ─────────────────────────────────────────────

const TABS: ReadonlyArray<DashboardTab> = ["overview", "financial", "operations", "team"];

interface TabBarProps {
  active: DashboardTab;
  onChange: (tab: DashboardTab) => void;
}

function TabBar({ active, onChange }: TabBarProps) {
  return (
    <div className="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={cn(
            "px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150",
            active === tab
              ? "bg-sky-500/15 text-sky-300 border border-sky-500/25"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60",
          )}
        >
          {DASHBOARD_TAB_LABELS[tab]}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

export function DashboardOverview() {
  const { user, tenant } = useCurrentUser();
  const { isStarter, plan } = usePlanFeatures();
  const currentPlan: import('@/lib/plans').PlanName = (plan ?? 'STARTER') as import('@/lib/plans').PlanName;
  const accessContext = createUserAccessContext(user, tenant);
  const dashboardPreset = detectDashboardPreset(user, accessContext);
  const canRead = useCallback(
    (module: string) => canReadModule(accessContext, module),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accessContext],
  );

  // Permission flags
  const canReadInvoicing = canRead("invoicing");
  const canReadAccounting = canRead("accounting");
  const canReadInventory = canRead("inventory");
  const canReadContacts = canRead("contacts");
  const canReadReporting = canRead("reporting");
  const canReadApprovals = canRead("approvals");
  const canReadTasks = canRead("tasks");
  const canReadNotifications = canRead("notifications");
  const canReadSettings = canRead("settings");
  const canReadProduction = canRead("production");
  const canReadPurchasing = canRead("purchasing");
  const canReadTodayQueue =
    canReadTasks ||
    canReadApprovals ||
    canReadInvoicing ||
    canReadNotifications ||
    canReadAccounting ||
    canReadInventory ||
    canRead("service") ||
    canRead("automation") ||
    canRead("marketplace");

  // Clock
  const [clock, setClock] = useState("");
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("tr-TR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Tab state — default based on preset
  const [activeTab, setActiveTab] = useState<DashboardTab>(
    () => DASHBOARD_PRESET_DEFAULT_TAB[dashboardPreset],
  );

  // ── Queries ──
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

  // ── Derived ──
  const profit = (rev?.totalGross ?? 0) - (exp?.totalGross ?? 0);
  const tcmbUsd = tcmb?.currencies?.find((c: CurrencyRate) => c.code === "USD");
  const tcmbEur = tcmb?.currencies?.find((c: CurrencyRate) => c.code === "EUR");

  const overdueInvoiceCount = invs?.data?.filter((i) => i.status === "OVERDUE").length ?? 0;
  const lowStockItems = stk?.belowMinStock ?? [];

  const allActionItems: ActionItem[] = [
    {
      key: "low-stock" satisfies ActionItemKey,
      title: "Kritik stok",
      value: stk?.summary.belowMinStockCount ?? 0,
      detail: lowStockItems[0] ? `${lowStockItems[0].productName} ilk sırada` : "Minimum altı ürün yok",
      icon: <Package className="w-4 h-4 text-amber-400" />,
      actionLabel: "Talep oluştur",
      message: "Stokta kritik ürünleri bul; taslak satın alma talebi için kalem sayısı ve tahmini toplam TL önizlemesi hazırla, onay almadan kayıt oluşturma",
      disabled: (stk?.summary.belowMinStockCount ?? 0) === 0,
    },
    {
      key: "overdue" satisfies ActionItemKey,
      title: "Geciken fatura",
      value: overdueInvoiceCount,
      detail: "Tahsilat hatırlatması hazırlat",
      icon: <Mail className="w-4 h-4 text-red-400" />,
      actionLabel: "Mail hazırla",
      message: "Vadesi geçmiş faturaları listele ve müşterilere gönderilecek kısa hatırlatma metni hazırla",
      disabled: overdueInvoiceCount === 0,
    },
    {
      key: "margin" satisfies ActionItemKey,
      title: "Kâr marjı riski",
      value: profit < 0 ? 1 : 0,
      detail: profit < 0 ? "Bu ay zarar görünüyor" : "Bu ay net kâr pozitif",
      icon: <ShieldAlert className="w-4 h-4 text-violet-400" />,
      actionLabel: "Analiz et",
      message: "Ürünleri alım ve satış fiyatlarına göre incele, negatif veya düşük kâr marjı riski olanları özetle",
      disabled: false,
    },
    {
      key: "cash" satisfies ActionItemKey,
      title: "Nakit akışı",
      value: profit < 0 || overdueInvoiceCount > 0 ? 1 : 0,
      detail: "Gelir, gider ve tahsilat riskini yorumla",
      icon: <Wallet className="w-4 h-4 text-sky-400" />,
      actionLabel: "Risk tahmini",
      message: "Bu ay gelir, gider, bekleyen ödeme ve gecikmiş faturaya göre nakit akışı riskini yorumla",
      disabled: false,
    },
    {
      key: "checks" satisfies ActionItemKey,
      title: "Çek / senet",
      value: 0,
      detail: "Yaklaşan vadeleri ve aksiyonları çıkar",
      icon: <ScrollText className="w-4 h-4 text-emerald-400" />,
      actionLabel: "Aksiyon çıkar",
      message: "Vadesi yaklaşan veya geçmiş çek/senetleri listele; bankaya verilecek, tahsil edildi işaretlenecek veya takip edilecek kayıtları öner",
      disabled: false,
    },
  ];

  const allowedActionKeys = PRESET_ACTION_ORDER[dashboardPreset];
  const visibleActionItems = allActionItems
    .filter((item) => allowedActionKeys.includes(item.key as ActionItemKey))
    .sort(
      (left, right) =>
        allowedActionKeys.indexOf(left.key as ActionItemKey) -
        allowedActionKeys.indexOf(right.key as ActionItemKey),
    );

  const isOwner = user?.tenantMembership?.isOwner ?? false;
  const roleName = user?.tenantMembership?.role?.name ?? null;

  // ── Render ──
  return (
    <div className="space-y-5 pb-12">
      <BasicDashboards
        executive={canReadReporting}
        production={canReadProduction}
        procurement={canReadPurchasing}
      />
      {/* Tab Bar */}
      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* Tab Content */}
      {activeTab === "overview" && (
        <OverviewTab
          user={user}
          tenant={tenant}
          clock={clock}
          dashboardPreset={dashboardPreset}
          isOwner={isOwner}
          roleName={roleName}
          recommendations={recommendations as Recommendation[]}
          visibleActionItems={visibleActionItems}
          canReadTodayQueue={canReadTodayQueue}
          canReadSettings={canReadSettings}
          isStarter={isStarter}
          currentPlan={currentPlan}
        />
      )}

      {activeTab === "financial" && (
        <FinancialTab
          rev={rev}
          exp={exp}
          stk={stk}
          bal={bal}
          invs={invs}
          tcmbUsd={tcmbUsd}
          tcmbEur={tcmbEur}
          canReadInvoicing={canReadInvoicing}
          pinnedKpis={pinnedKpis}
        />
      )}

      {activeTab === "operations" && (
        <OperationsTab
          stk={stk}
          canReadInventory={canReadInventory}
          canReadInvoicing={canReadInvoicing}
          canReadSettings={canReadSettings}
          isStarter={isStarter}
          currentPlan={currentPlan}
        />
      )}

      {activeTab === "team" && (
        <TeamTab
          smartNotifications={smartNotifications}
          tasks={tasks}
          notifs={notifs}
          appr={appr}
        />
      )}
    </div>
  );
}
