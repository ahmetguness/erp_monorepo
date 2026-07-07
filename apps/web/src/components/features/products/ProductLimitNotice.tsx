"use client";

import { AlertTriangle, ArrowUpRight, PackagePlus } from "lucide-react";
import Link from "next/link";
import { PRODUCT_LIMIT_UPGRADE_HREF, type ProductLimitStatus } from "./product-limit";

interface ProductLimitNoticeProps {
  status: ProductLimitStatus;
  compact?: boolean;
}

export function ProductLimitNotice({ status, compact = false }: ProductLimitNoticeProps) {
  if (!status.isLimited || (!status.isNearLimit && !status.isLimitReached)) return null;

  const toneClass = status.isLimitReached
    ? "border-red-500/20 bg-red-500/[0.06]"
    : "border-amber-500/20 bg-amber-500/[0.06]";
  const iconClass = status.isLimitReached
    ? "bg-red-500/10 text-red-400"
    : "bg-amber-500/10 text-amber-400";
  const title = status.isLimitReached
    ? "Starter urun limiti doldu"
    : "Starter urun limitine yaklasiyorsunuz";
  const description = status.isLimitReached
    ? "Yeni urun eklemek icin Professional plana gecerek urun kapasitesini 5000'e cikarabilirsiniz."
    : `${status.remainingSlots ?? 0} urun hakkiniz kaldi. Limit dolmadan once yukseltme seceneklerini inceleyin.`;

  return (
    <div className={`mb-4 rounded-xl border p-4 ${toneClass}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
            {status.isLimitReached ? <PackagePlus className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
              <span className="rounded-full bg-slate-950/50 px-2 py-0.5 text-[11px] font-medium text-slate-400">
                {status.currentCount}/{status.maxProducts} urun
              </span>
            </div>
            {!compact && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-950/70">
              <div
                className={status.isLimitReached ? "h-full bg-red-400" : "h-full bg-amber-400"}
                style={{ width: `${status.usagePercent ?? 0}%` }}
              />
            </div>
          </div>
        </div>
        <Link
          href={PRODUCT_LIMIT_UPGRADE_HREF}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-500/20"
        >
          Upgrade preview
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
