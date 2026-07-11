"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Package, Trash2, GitBranch, Route, Scale, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  useBOM,
  useBOMEngineering,
  useRemoveBOMItem,
  useRemoveBOMRouting,
} from "@/hooks/useProduction";
import type {
  AlternativeMaterialRow,
  BomRevisionRow,
  ProductionCostComparisonRow,
} from "@/services/production.service";

function formatNumber(value: number, digits = 1): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits }).format(value);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
}

function formatPct(value: number): string {
  return `%${formatNumber(value)}`;
}

function revisionLabel(status: BomRevisionRow["status"]): { label: string; variant: "neutral" | "success" | "warning" | "info" } {
  if (status === "active") return { label: "Aktif", variant: "success" };
  if (status === "future") return { label: "Planli", variant: "info" };
  if (status === "expired") return { label: "Gecmis", variant: "neutral" };
  return { label: "Taslak", variant: "warning" };
}

export function BOMDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const { data: bom, isLoading } = useBOM(id);
  const { data: engineering, isLoading: engineeringLoading } = useBOMEngineering(id);
  const removeItem = useRemoveBOMItem();
  const removeRouting = useRemoveBOMRouting();

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  if (!bom)
    return (
      <div className="text-center py-20 text-slate-400">BOM bulunamadı.</div>
    );

  return (
    <div>
      <PageHeader
        title={bom.name}
        subtitle={`${bom.product?.name ?? ""} — v${bom.version}`}
        action={
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4" />
            Geri
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
          <div className="text-[10px] text-slate-500 mb-1">Ürün</div>
          <div className="text-sm text-white">
            {bom.product?.name}{" "}
            <span className="text-slate-500 font-mono">
              ({bom.product?.code})
            </span>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
          <div className="text-[10px] text-slate-500 mb-1">Versiyon</div>
          <div className="text-sm text-white">{bom.version}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
          <div className="text-[10px] text-slate-500 mb-1">Durum</div>
          <div>
            {bom.isActive ? (
              <Badge variant="success">Aktif</Badge>
            ) : (
              <Badge variant="neutral">Pasif</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Items */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">
            Malzemeler ({bom.items?.length ?? 0})
          </h3>
          {bom.items && bom.items.length > 0 ? (
            <div className="space-y-3">
              {bom.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center">
                      <Package className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div>
                      <span className="text-sm text-white">
                        {item.product?.name ?? "—"}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {item.quantity} {item.unit ?? "AD"}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      removeItem.mutate({ bomId: id, itemId: item.id })
                    }
                    className="p-1.5 rounded-lg text-slate-700 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Malzeme eklenmemiş.</p>
          )}
        </div>

        {/* Routings */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">
            Operasyonlar ({bom.routings?.length ?? 0})
          </h3>
          {bom.routings && bom.routings.length > 0 ? (
            <div className="space-y-3">
              {bom.routings.map((r, i) => (
                <div key={r.id} className="flex items-center gap-3 group">
                  <span className="w-6 h-6 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <span className="text-sm text-white">{r.name}</span>
                    <span className="block text-xs text-slate-500">
                      {r.workCenter?.name} — {r.setupTime ?? 0}dk kurulum,{" "}
                      {r.runTime ?? 0}dk/birim
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      removeRouting.mutate({ bomId: id, routingId: r.id })
                    }
                    className="p-1.5 rounded-lg text-slate-700 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Operasyon eklenmemiş.</p>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Enterprise uretim muhendisligi</h3>
              <p className="mt-1 text-xs text-slate-500">
                BOM revizyonlari, alternatif hammadde, operasyon rotasi ve maliyet sapmasi tek bakista.
              </p>
            </div>
            {engineeringLoading && <span className="text-xs text-slate-500">Yukleniyor...</span>}
          </div>

          {engineering ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <EngineeringMetric icon={<GitBranch className="h-4 w-4" />} label="Revizyon" value={engineering.summary.revisionCount} />
                <EngineeringMetric icon={<GitBranch className="h-4 w-4" />} label="Aktif revizyon" value={engineering.summary.activeRevisionCount} />
                <EngineeringMetric icon={<Scale className="h-4 w-4" />} label="Alternatif" value={engineering.summary.alternativeSuggestionCount} />
                <EngineeringMetric icon={<Route className="h-4 w-4" />} label="Rota adimi" value={engineering.summary.routeStepCount} />
                <EngineeringMetric icon={<TrendingUp className="h-4 w-4" />} label="Planlanan" value={formatCurrency(engineering.summary.plannedCostTotal)} />
                <EngineeringMetric icon={<TrendingUp className="h-4 w-4" />} label="Sapma" value={formatPct(engineering.summary.variancePct)} />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <EngineeringPanel title="BOM revizyonlari">
                  {engineering.revisions.length === 0 ? (
                    <EmptyEngineeringText text="Revizyon bulunmuyor." />
                  ) : (
                    <div className="space-y-2">
                      {engineering.revisions.slice(0, 6).map((row) => {
                        const status = revisionLabel(row.status);
                        return (
                          <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-100">v{row.version}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {row.itemCount} malzeme / {row.routingCount} rota / {row.workOrderCount} is emri
                              </p>
                            </div>
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </EngineeringPanel>

                <EngineeringPanel title="Alternatif hammadde onerileri">
                  {engineering.alternativeMaterials.every((row) => row.alternatives.length === 0) ? (
                    <EmptyEngineeringText text="Ayni kategori ve birimde alternatif malzeme bulunmuyor." />
                  ) : (
                    <div className="space-y-2">
                      {engineering.alternativeMaterials.filter((row) => row.alternatives.length > 0).slice(0, 5).map((row) => (
                        <AlternativeMaterialCard key={row.bomItemId} row={row} />
                      ))}
                    </div>
                  )}
                </EngineeringPanel>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <EngineeringPanel title="Operasyon rotalari">
                  {engineering.operationRoutes.length === 0 ? (
                    <EmptyEngineeringText text="Operasyon rotasi tanimli degil." />
                  ) : (
                    <div className="space-y-2">
                      {engineering.operationRoutes.map((row) => (
                        <div key={row.routingId} className="grid grid-cols-[auto_1fr_auto] gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-sky-500/15 text-xs font-bold text-sky-300">
                            {row.stepOrder}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-slate-100">{row.operationName}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {row.workCenter.name} / {formatNumber(row.setupMinutes)}dk kurulum / {formatNumber(row.runMinutesPerUnit)}dk birim
                            </p>
                          </div>
                          <span className="text-right text-xs font-semibold text-slate-300">{formatCurrency(row.plannedCostPerUnit)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </EngineeringPanel>

                <EngineeringPanel title="Gerceklesen / planlanan maliyet">
                  {engineering.costComparison.length === 0 ? (
                    <EmptyEngineeringText text="Bu BOM ile olusmus is emri maliyeti yok." />
                  ) : (
                    <div className="space-y-2">
                      {engineering.costComparison.slice(0, 6).map((row) => (
                        <CostComparisonRow key={row.workOrderId} row={row} />
                      ))}
                    </div>
                  )}
                </EngineeringPanel>
              </div>
            </div>
          ) : (
            !engineeringLoading && <EmptyEngineeringText text="Uretim muhendisligi ozeti hazirlanamadi." />
          )}
        </div>
      </div>
    </div>
  );
}

function EngineeringMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
      <div className="text-sky-300">{icon}</div>
      <span className="mt-2 block text-[10px] font-semibold uppercase text-slate-500">{label}</span>
      <span className="mt-1 block text-sm font-bold text-white">{value}</span>
    </div>
  );
}

function EngineeringPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
      <h4 className="mb-3 text-xs font-semibold uppercase text-slate-400">{title}</h4>
      {children}
    </section>
  );
}

function EmptyEngineeringText({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed border-slate-800 p-4 text-sm text-slate-500">{text}</p>;
}

function AlternativeMaterialCard({ row }: { row: AlternativeMaterialRow }) {
  const best = row.alternatives[0];
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">{row.primaryProduct.name}</p>
          <p className="mt-1 text-xs text-slate-500">
            Gereken: {formatNumber(row.requiredQty, 3)} {row.unit} / Birim: {formatCurrency(row.primaryUnitCost)}
          </p>
        </div>
        <Badge variant={best.costDeltaPct <= 0 ? "success" : "warning"}>{formatPct(best.costDeltaPct)}</Badge>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {best.product.name} ({best.product.code}) - stok {formatNumber(best.availableQty, 3)} / {formatCurrency(best.unitCost)}
      </p>
      <p className="mt-1 text-xs text-slate-600">{best.reason}</p>
    </div>
  );
}

function CostComparisonRow({ row }: { row: ProductionCostComparisonRow }) {
  const tone = row.variancePct > 10 ? "warning" : row.variancePct < -10 ? "info" : "neutral";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">{row.workOrderNumber}</p>
          <p className="mt-1 text-xs text-slate-500">
            {formatNumber(row.producedQty, 3)} / {formatNumber(row.plannedQty, 3)} uretim
          </p>
        </div>
        <Badge variant={tone}>{formatPct(row.variancePct)}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-400">
        <span>Plan: {formatCurrency(row.plannedCost)}</span>
        <span>Gercek: {formatCurrency(row.actualCost)}</span>
        <span>Sapma: {formatCurrency(row.variance)}</span>
      </div>
    </div>
  );
}
