"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { getInventoryTruthGate } from "@/services/inventory-truth-gate.service";

export function InventoryTruthGatePanel() {
  const gate = useQuery({
    queryKey: ["inventory", "truth-gate"],
    queryFn: getInventoryTruthGate,
    staleTime: 30_000,
  });
  const report = gate.data;
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ShieldCheck className="h-4 w-4 text-sky-300" />
            Inventory Truth Gate
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            MRP öncesi stok hareketi, rezervasyon, lot ve maliyet kanıtları.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <Badge variant={report.decision === "GO" ? "success" : "danger"}>
              {report.decision}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            loading={gate.isFetching}
            onClick={() => void gate.refetch()}
          >
            Yenile
          </Button>
        </div>
      </div>
      {gate.isError && (
        <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">
          Inventory Truth Gate sonucu alınamadı. Bağlantıyı kontrol edip yeniden
          deneyin.
        </div>
      )}
      {report && (
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {report.checks.map((item) => (
            <div
              key={item.key}
              className="rounded-lg border border-slate-800 p-3"
            >
              <div className="flex items-center gap-2">
                {item.status === "PASS" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-300" />
                )}
                <span className="text-xs font-semibold text-slate-200">
                  {item.label}
                </span>
                <span className="ml-auto text-[10px] text-slate-500">
                  {item.evidenceCount} kanıt
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{item.detail}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
