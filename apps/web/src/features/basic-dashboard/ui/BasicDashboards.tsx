"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  Factory,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  useExecutiveDashboard,
  useProcurementDashboard,
  useProductionDashboard,
} from "../model/use-basic-dashboard";

interface BasicDashboardsProps {
  executive: boolean;
  production: boolean;
  procurement: boolean;
}
const number = (value: number): string =>
  new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value);
const date = (value: string): string =>
  new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(
    new Date(value),
  );

function Metric({
  label,
  value,
  tone = "text-white",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>
        {value}
      </p>
    </div>
  );
}

export function BasicDashboards({
  executive,
  production,
  procurement,
}: BasicDashboardsProps) {
  const executiveQuery = useExecutiveDashboard(executive);
  const productionQuery = useProductionDashboard(production);
  const procurementQuery = useProcurementDashboard(procurement);
  if (!executive && !production && !procurement) return null;
  return (
    <div className="space-y-4">
      {executiveQuery.data && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <TrendingUp className="h-4 w-4 text-sky-400" />
            Yönetici Özeti
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <Metric
              label="Bugünkü satış"
              value={formatCurrency(executiveQuery.data.sales.today)}
            />
            <Metric
              label="Bu ay / önceki ay"
              value={`${formatCurrency(executiveQuery.data.sales.currentMonth)} / ${formatCurrency(executiveQuery.data.sales.previousMonth)}`}
            />
            <Metric
              label="Toplam / geciken alacak"
              value={`${formatCurrency(executiveQuery.data.receivables.total)} / ${formatCurrency(executiveQuery.data.receivables.overdue)}`}
              tone={
                executiveQuery.data.receivables.overdue > 0
                  ? "text-red-300"
                  : "text-white"
              }
            />
            <Metric
              label="Nakit pozisyonu"
              value={formatCurrency(executiveQuery.data.cash.total)}
            />
            <Metric
              label="Düşük stok / açık sipariş"
              value={`${executiveQuery.data.inventory.lowStockCount} / ${executiveQuery.data.salesOrders.openCount}`}
            />
          </div>
          <div
            className="mt-3 flex h-14 items-end gap-2"
            aria-label="Altı aylık satış trendi"
          >
            {executiveQuery.data.sales.trend.map((point) => {
              const max = Math.max(
                ...executiveQuery.data.sales.trend.map((row) => row.amount),
                1,
              );
              return (
                <div
                  key={point.period}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div
                    className="w-full rounded-t bg-sky-500/50"
                    style={{
                      height: `${Math.max(4, (point.amount / max) * 38)}px`,
                    }}
                    title={formatCurrency(point.amount)}
                  />
                  <span className="text-[9px] text-slate-600">
                    {point.period.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {productionQuery.data && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Factory className="h-4 w-4 text-violet-400" />
              Üretim Özeti
            </h2>
            <Link
              className="text-xs text-sky-400"
              href="/dashboard/production/work-orders"
            >
              İş emirleri
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Açık iş emirleri"
              value={String(
                Object.values(
                  productionQuery.data.workOrders.openByStatus,
                ).reduce((sum, value) => sum + value, 0),
              )}
            />
            <Metric
              label="Geciken iş emirleri"
              value={String(productionQuery.data.workOrders.overdue)}
              tone={
                productionQuery.data.workOrders.overdue > 0
                  ? "text-red-300"
                  : "text-white"
              }
            />
            <Metric
              label="Planlanan / gerçekleşen"
              value={`${number(productionQuery.data.output.planned)} / ${number(productionQuery.data.output.produced)}`}
            />
            <Metric
              label="Scrap oranı (30 gün)"
              value={`%${number(productionQuery.data.scrap.rate)}`}
            />
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-3">
            {productionQuery.data.workCenters.slice(0, 6).map((center) => (
              <div
                key={center.id}
                className="rounded-lg border border-slate-800 p-3"
              >
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">
                    {center.code} · {center.name}
                  </span>
                  <span className="text-slate-400">
                    %{number(center.utilization)}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-800">
                  <div
                    className="h-full rounded bg-violet-400"
                    style={{ width: `${Math.min(center.utilization, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {procurementQuery.data && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <ShoppingCart className="h-4 w-4 text-amber-400" />
              Satın Alma Özeti
            </h2>
            <Link
              className="text-xs text-sky-400"
              href="/dashboard/purchase-orders"
            >
              Siparişler
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Metric
              label="Açık PO"
              value={String(procurementQuery.data.openOrders.count)}
            />
            <Metric
              label="Açık PO tutarı"
              value={formatCurrency(procurementQuery.data.openOrders.amount)}
            />
            <Metric
              label="Geciken teslimat"
              value={String(procurementQuery.data.overdueDeliveries)}
              tone={
                procurementQuery.data.overdueDeliveries > 0
                  ? "text-red-300"
                  : "text-white"
              }
            />
          </div>
          {procurementQuery.data.upcomingDeliveries.length > 0 && (
            <div className="mt-3 divide-y divide-slate-800">
              {procurementQuery.data.upcomingDeliveries
                .slice(0, 5)
                .map((order) => (
                  <Link
                    key={order.id}
                    href={`/dashboard/purchase-orders/${order.id}`}
                    className="flex items-center gap-3 py-2 text-xs"
                  >
                    <Boxes className="h-3.5 w-3.5 text-slate-500" />
                    <span className="font-mono text-slate-300">
                      {order.number}
                    </span>
                    <span className="truncate text-slate-500">
                      {order.supplier}
                    </span>
                    <span className="ml-auto text-slate-400">
                      {date(order.dueDate)}
                    </span>
                    <span className="w-24 text-right text-slate-300">
                      {formatCurrency(order.amount)}
                    </span>
                  </Link>
                ))}
            </div>
          )}
        </section>
      )}
      {(executiveQuery.isError ||
        productionQuery.isError ||
        procurementQuery.isError) && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
          <AlertTriangle className="h-4 w-4" />
          Dashboard verilerinin bir bölümü alınamadı.
        </div>
      )}
    </div>
  );
}
