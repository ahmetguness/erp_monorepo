"use client";

import { ArrowUpRight, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { CUSTOM_REPORTING_CAPABILITIES, CUSTOM_REPORTING_UPGRADE_HREF } from "./custom-reporting-access";

export function CustomReportingLockedPanel() {
  return (
    <section className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
            <Lock className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100">Ozel raporlar Professional ile acilir</h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                <Sparkles className="h-3 w-3" />
                Custom reporting
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Starter plan hazir raporlari salt okunur sunar. KPI Builder, kayitli raporlar ve paylasim ayarlari ust paketlere ayrilmistir.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {CUSTOM_REPORTING_CAPABILITIES.map((capability) => (
                <span
                  key={capability}
                  className="rounded-md border border-slate-800 bg-slate-950/45 px-2 py-1 text-[11px] text-slate-400"
                >
                  {capability}
                </span>
              ))}
            </div>
          </div>
        </div>
        <Link
          href={CUSTOM_REPORTING_UPGRADE_HREF}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 text-xs font-semibold text-sky-300 transition-colors hover:bg-sky-500/20"
        >
          Upgrade preview
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
