"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  XCircle,
} from "lucide-react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { useFiscalPeriodClosingChecklist } from "@/hooks/useAccounting";
import { cn, formatDate } from "@/lib/utils";
import type {
  AccountingClosingChecklistItem,
  FiscalPeriod,
} from "@/services/accounting.service";

const STATUS_BADGE: Record<AccountingClosingChecklistItem["status"], { label: string; variant: BadgeVariant }> = {
  PASS: { label: "Hazir", variant: "success" },
  WARN: { label: "Kontrol", variant: "warning" },
  FAIL: { label: "Engel", variant: "danger" },
};

const STATUS_ICON: Record<AccountingClosingChecklistItem["status"], ComponentType<{ className?: string }>> = {
  PASS: CheckCircle2,
  WARN: AlertTriangle,
  FAIL: XCircle,
};

function ChecklistItemRow({ item }: { item: AccountingClosingChecklistItem }) {
  const status = STATUS_BADGE[item.status];
  const Icon = STATUS_ICON[item.status];

  return (
    <div className="flex flex-col gap-3 border-t border-slate-800/70 py-4 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
          item.status === "PASS" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
          item.status === "WARN" && "border-amber-500/20 bg-amber-500/10 text-amber-400",
          item.status === "FAIL" && "border-red-500/20 bg-red-500/10 text-red-400",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-semibold text-slate-100">{item.label}</h4>
          <Badge variant={status.variant}>{status.label}</Badge>
          {item.blocking && <Badge variant="danger">Kapanisi engeller</Badge>}
        </div>
        <p className="mt-1 text-xs text-slate-400">{item.description}</p>
      </div>
      <Link
        href={item.href}
        className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-950/20 px-3 text-xs font-medium text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
      >
        {item.actionLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export function ClosingChecklistPanel({ period }: { period: FiscalPeriod }) {
  const { data: checklist, isLoading, isError } = useFiscalPeriodClosingChecklist(period.id);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
            <ClipboardCheck className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Muhasebe kapanis kontrol listesi</h3>
            <p className="mt-1 text-xs text-slate-400">
              {formatDate(period.startDate)} - {formatDate(period.endDate)} donemi icin fis, mutabakat, odeme ve stok kontrolleri.
            </p>
          </div>
        </div>
        {checklist && (
          <Badge variant={checklist.summary.canClose ? "success" : "danger"} dot>
            {checklist.summary.canClose ? "Kapanisa hazir" : `${checklist.summary.blockers} engel var`}
          </Badge>
        )}
      </div>

      <div className="mt-5">
        {isLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-3 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Kontrol listesi hazirlaniyor...
          </div>
        )}

        {isError && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-3 text-sm text-red-300">
            Kontrol listesi alinamadi. Yetki veya plan erisimini kontrol edin.
          </div>
        )}

        {checklist && (
          <div className="space-y-0">
            {checklist.items.map((item) => (
              <ChecklistItemRow key={item.key} item={item} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
