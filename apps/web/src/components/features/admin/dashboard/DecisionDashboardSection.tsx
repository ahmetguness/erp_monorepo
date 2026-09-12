"use client";

import type {
  AdminDashboardRangeDays,
  AdminDecisionMetric,
  DecisionMetricTone,
} from "@repo/types";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import Link from "next/link";
import { getAdminDecisionDashboard } from "@/services/admin-decision-dashboard.service";

const toneClass: Record<DecisionMetricTone, string> = {
  POSITIVE: "border-emerald-500/30 bg-emerald-500/5",
  NEUTRAL: "border-slate-700 bg-slate-900/70",
  WARNING: "border-amber-500/30 bg-amber-500/5",
  CRITICAL: "border-red-500/30 bg-red-500/5",
};
const ranges: AdminDashboardRangeDays[] = [7, 30, 90];

function formatValue(metric: AdminDecisionMetric): string {
  if (metric.format === "PERCENT")
    return `%${metric.value.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
  if (metric.format === "CURRENCY")
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: metric.currency ?? "TRY",
      maximumFractionDigits: 0,
    }).format(metric.value);
  return metric.value.toLocaleString("tr-TR");
}

export function DecisionDashboardSection({
  rangeDays,
  onRangeChange,
}: {
  rangeDays: AdminDashboardRangeDays;
  onRangeChange: (range: AdminDashboardRangeDays) => void;
}) {
  const query = useQuery({
    queryKey: ["admin", "decision-dashboard", rangeDays],
    queryFn: () => getAdminDecisionDashboard(rangeDays),
    refetchInterval: 30_000,
  });
  return (
    <section className="space-y-4" aria-labelledby="decision-dashboard-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="decision-dashboard-title"
            className="text-lg font-semibold text-white"
          >
            Ne değişti, şimdi ne yapmalıyım?
          </h2>
          <p className="text-sm text-slate-400">
            Önceki eşit dönem karşılaştırmalı ticari ve operasyonel görünüm
          </p>
        </div>
        <div
          className="flex rounded-lg border border-slate-700 bg-slate-900 p-1"
          aria-label="Karar merkezi tarih aralığı"
        >
          {ranges.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => onRangeChange(range)}
              className={`rounded-md px-3 py-1.5 text-xs ${rangeDays === range ? "bg-sky-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              {range} gün
            </button>
          ))}
        </div>
      </div>
      {query.isLoading && (
        <div className="h-44 animate-pulse rounded-xl border border-slate-800 bg-slate-900" />
      )}
      {query.isError && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
          Karar metrikleri yüklenemedi.
        </p>
      )}
      {query.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {query.data.metrics.map((item) => (
              <DecisionMetricCard key={item.key} item={item} />
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
            <span>
              {new Date(query.data.period.from).toLocaleDateString("tr-TR")} –{" "}
              {new Date(query.data.period.to).toLocaleDateString("tr-TR")}
            </span>
            <details>
              <summary className="cursor-pointer">Hesaplama notları</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {query.data.dataNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </details>
          </div>
        </>
      )}
    </section>
  );
}

function DecisionMetricCard({ item }: { item: AdminDecisionMetric }) {
  const increasing = (item.changePercent ?? 0) > 0;
  const ChangeIcon =
    item.changePercent === null || item.changePercent === 0
      ? Minus
      : increasing
        ? ArrowUpRight
        : ArrowDownRight;
  return (
    <Link
      href={item.href}
      className={`group rounded-xl border p-4 transition hover:-translate-y-0.5 hover:border-sky-500/50 ${toneClass[item.tone]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-400">{item.label}</p>
        <ArrowRight className="h-4 w-4 text-slate-600 group-hover:text-sky-400" />
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">
        {formatValue(item)}
      </p>
      <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
        <ChangeIcon className="h-3.5 w-3.5" />
        {item.changePercent === null
          ? "Karşılaştırma yok"
          : `%${Math.abs(item.changePercent).toLocaleString("tr-TR")} önceki döneme göre`}
      </p>
      <p className="mt-3 text-xs leading-5 text-slate-500">{item.detail}</p>
    </Link>
  );
}
