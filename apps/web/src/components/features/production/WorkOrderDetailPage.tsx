"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  Package,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { AttachmentPanel } from "@/components/shared/AttachmentPanel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useWorkOrder, useChangeWorkOrderStatus } from "@/hooks/useProduction";
import { formatDate } from "@/lib/utils";

const STATUS_MAP: Record<
  string,
  {
    label: string;
    variant: "neutral" | "success" | "warning" | "danger" | "info";
  }
> = {
  PLANNED: { label: "Planlandı", variant: "info" },
  IN_PROGRESS: { label: "Devam Ediyor", variant: "warning" },
  PAUSED: { label: "Duraklatıldı", variant: "neutral" },
  COMPLETED: { label: "Tamamlandı", variant: "success" },
  CANCELLED: { label: "İptal", variant: "danger" },
};

export function WorkOrderDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const { data: wo, isLoading } = useWorkOrder(id);
  const changeStatus = useChangeWorkOrderStatus();

  if (isLoading)
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  if (!wo)
    return (
      <div className="text-center py-20 text-slate-400">
        İş emri bulunamadı.
      </div>
    );

  const s = STATUS_MAP[wo.status];
  const progress =
    wo.plannedQty > 0 ? Math.round((wo.producedQty / wo.plannedQty) * 100) : 0;

  return (
    <div>
      <PageHeader
        title={`İş Emri ${wo.number}`}
        subtitle={wo.product?.name ?? ""}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4" />
              Geri
            </Button>
            {wo.status === "PLANNED" && (
              <Button
                size="sm"
                onClick={() =>
                  changeStatus.mutate({ id, data: { status: "IN_PROGRESS" } })
                }
              >
                <Play className="w-4 h-4" />
                Başlat
              </Button>
            )}
            {wo.status === "IN_PROGRESS" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    changeStatus.mutate({ id, data: { status: "PAUSED" } })
                  }
                >
                  <Pause className="w-4 h-4" />
                  Duraklat
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    changeStatus.mutate({ id, data: { status: "COMPLETED" } })
                  }
                >
                  <CheckCircle className="w-4 h-4" />
                  Tamamla
                </Button>
              </>
            )}
            {wo.status === "PAUSED" && (
              <Button
                size="sm"
                onClick={() =>
                  changeStatus.mutate({ id, data: { status: "IN_PROGRESS" } })
                }
              >
                <Play className="w-4 h-4" />
                Devam Et
              </Button>
            )}
          </div>
        }
      />

      {/* Info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: "Durum",
            value: s ? <Badge variant={s.variant}>{s.label}</Badge> : wo.status,
          },
          {
            label: "İlerleme",
            value: `${progress}% (${wo.producedQty} / ${wo.plannedQty})`,
          },
          {
            label: "BOM",
            value: wo.bom ? `${wo.bom.name} v${wo.bom.version}` : "—",
          },
          {
            label: "Tarih",
            value: wo.startDate
              ? `${formatDate(wo.startDate)} — ${wo.endDate ? formatDate(wo.endDate) : "?"}`
              : "—",
          },
        ].map((item) => (
          <div
            key={item.label}
            className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3"
          >
            <div className="text-[10px] text-slate-500 mb-1">{item.label}</div>
            <div className="text-sm text-white">{item.value}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-slate-400">Üretim İlerlemesi</span>
          <span className="text-xs text-white font-medium">{progress}%</span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-sky-500 rounded-full transition-all"
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Materials */}
        {wo.items && wo.items.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">
              Malzemeler
            </h3>
            <div className="space-y-3">
              {wo.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center">
                      <Package className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div>
                      <span className="text-sm text-white">
                        {item.product?.name ?? "—"}
                      </span>
                      <span className="block text-xs text-slate-500 font-mono">
                        {item.product?.code}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-sm text-white">
                      {item.consumedQty} / {item.requiredQty}
                    </span>
                    <div className="h-1 w-16 bg-slate-800 rounded-full mt-1">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{
                          width: `${Math.min((item.consumedQty / item.requiredQty) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Operations */}
        {wo.operations && wo.operations.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">
              Operasyonlar
            </h3>
            <div className="space-y-3">
              {wo.operations.map((op, i) => {
                const opS = STATUS_MAP[op.status];
                return (
                  <div key={op.id} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <span className="text-sm text-white">{op.name}</span>
                      <span className="block text-xs text-slate-500">
                        {op.workCenter?.name}
                      </span>
                    </div>
                    {opS && <Badge variant={opS.variant}>{opS.label}</Badge>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* History */}
      {wo.history && wo.history.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mt-6">
          <h3 className="text-sm font-semibold text-white mb-4">Geçmiş</h3>
          <div className="space-y-2">
            {wo.history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 text-xs">
                <span className="text-slate-500 w-28 flex-shrink-0">
                  {formatDate(h.createdAt)}
                </span>
                <span className="text-slate-400">
                  {h.fromStatus ? `${h.fromStatus} → ` : ""}
                  {h.toStatus}
                </span>
                {h.notes && <span className="text-slate-600">— {h.notes}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        <AttachmentPanel entityType="WORK_ORDER" entityId={id} />
      </div>
    </div>
  );
}
