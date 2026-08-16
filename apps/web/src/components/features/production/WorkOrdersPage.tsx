"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Eye, FilterX, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useWorkOrders } from "@/hooks/useProduction";
import { cn, formatDate } from "@/lib/utils";
import type { WorkOrder } from "@/services/production.service";

const PAGE_SIZE = 20;
const EMPTY_WORK_ORDERS: WorkOrder[] = [];

const STATUS_MAP: Record<string, { label: string; variant: "neutral" | "success" | "warning" | "danger" | "info" }> = {
  PLANNED: { label: "Planlandı", variant: "info" },
  IN_PROGRESS: { label: "Devam Ediyor", variant: "warning" },
  PAUSED: { label: "Duraklatıldı", variant: "neutral" },
  COMPLETED: { label: "Tamamlandı", variant: "success" },
  CANCELLED: { label: "İptal", variant: "danger" },
};

const STATUSES = ["", "PLANNED", "IN_PROGRESS", "PAUSED", "COMPLETED", "CANCELLED"];

function formatQty(value: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(value);
}

function progressPct(order: WorkOrder): number {
  if (order.plannedQty <= 0) return 0;
  return Math.min(100, Math.max(0, (order.producedQty / order.plannedQty) * 100));
}

function StatusBadge({ status }: { status: string }) {
  const mapped = STATUS_MAP[status];
  return mapped ? <Badge variant={mapped.variant}>{mapped.label}</Badge> : <Badge variant="neutral">{status}</Badge>;
}

export function WorkOrdersPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useWorkOrders({
    page,
    limit: PAGE_SIZE,
    ...(statusFilter && { status: statusFilter }),
  });

  const rows = data?.data ?? EMPTY_WORK_ORDERS;
  const filteredRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    if (!q) return rows;
    return rows.filter((order) => {
      const haystack = [
        order.number,
        order.product?.name,
        order.product?.code,
        order.bom?.name,
        order.bom?.version,
      ].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
      return haystack.includes(q);
    });
  }, [rows, search]);

  const summary = useMemo(() => ({
    total: rows.length,
    planned: rows.filter((order) => order.status === "PLANNED").length,
    active: rows.filter((order) => order.status === "IN_PROGRESS").length,
    paused: rows.filter((order) => order.status === "PAUSED").length,
    completed: rows.filter((order) => order.status === "COMPLETED").length,
    qtyOpen: rows.reduce((sum, order) => sum + Math.max(0, order.plannedQty - order.producedQty), 0),
  }), [rows]);

  const hasFilters = Boolean(statusFilter || search);
  const clearFilters = () => {
    setStatusFilter("");
    setSearch("");
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="İş Emirleri"
        subtitle="Üretim iş emirlerini, miktar gerçekleşmesini ve operasyon kapsamını takip edin."
        className="mb-0"
        action={
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => router.push("/dashboard/production/work-orders/new")}>
            Yeni İş Emri
          </Button>
        }
      />

      <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <SummaryMetric label="Bu Sayfa" value={summary.total} />
          <SummaryMetric label="Planlandı" value={summary.planned} />
          <SummaryMetric label="Devam Eden" value={summary.active} tone={summary.active > 0 ? "text-amber-300" : "text-slate-200"} />
          <SummaryMetric label="Durakladı" value={summary.paused} tone={summary.paused > 0 ? "text-amber-300" : "text-slate-200"} />
          <SummaryMetric label="Tamamlandı" value={summary.completed} tone="text-emerald-300" />
          <SummaryMetric label="Açık Miktar" value={`${formatQty(summary.qtyOpen)} AD`} />
        </div>
      </div>

      <section>
        <div className="mb-3 rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto_auto] lg:items-center">
            <Input aria-label="İş emri veya ürün ara" placeholder="İş emri, ürün veya BOM ara..." value={search} onChange={(event) => setSearch(event.target.value)} prefixIcon={<Search className="h-4 w-4" />} />
            <div className="inline-flex h-10 overflow-hidden rounded-xl border border-slate-700/75 bg-slate-950/35 p-1">
              {STATUSES.map((status) => (
                <button
                  key={status || "all"}
                  type="button"
                  onClick={() => { setStatusFilter(status); setPage(1); }}
                  className={cn("rounded-lg px-3 text-xs font-medium transition-colors", statusFilter === status ? "bg-sky-500/15 text-sky-300" : "text-slate-500 hover:text-slate-200")}
                >
                  {status ? STATUS_MAP[status]?.label ?? status : "Tümü"}
                </button>
              ))}
            </div>
            {hasFilters && <Button variant="ghost" size="sm" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Temizle</Button>}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-900/95">
                <tr className="border-b border-slate-800/80">
                  {["İş Emri", "Ürün", "Gerçekleşme", "BOM", "Tarih", "Kapsam", "Durum", ""].map((header, index) => (
                    <th key={header || index} className={cn("px-4 py-3 text-left text-[11px] font-semibold uppercase text-slate-500", index === 2 && "text-right", index === 6 && "text-center")}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? <TableSkeleton /> : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center">
                      <ClipboardList className="mx-auto h-8 w-8 text-slate-600" />
                      <p className="mt-3 text-sm font-semibold text-slate-200">{hasFilters ? "Filtrelerle eşleşen iş emri bulunamadı" : "İş emri bulunamadı"}</p>
                      <p className="mt-1 text-sm text-slate-500">{hasFilters ? "Arama veya durum filtresini değiştirin." : "Yeni bir iş emri oluşturarak başlayın."}</p>
                      {hasFilters ? (
                        <Button className="mt-4" size="sm" variant="secondary" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Filtreleri Temizle</Button>
                      ) : (
                        <Button className="mt-4" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => router.push("/dashboard/production/work-orders/new")}>Yeni İş Emri</Button>
                      )}
                    </td>
                  </tr>
                ) : filteredRows.map((order) => {
                  const pct = progressPct(order);
                  return (
                    <tr
                      key={order.id}
                      onClick={() => router.push(`/dashboard/production/work-orders/${order.id}`)}
                      className="group cursor-pointer border-b border-slate-800/45 transition-colors duration-150 last:border-b-0 hover:bg-sky-500/[0.04]"
                    >
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <p className="font-mono font-semibold text-sky-300">{order.number}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{formatDate(order.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-slate-100">{order.product?.name ?? "Ürün bilgisi yok"}</p>
                        <p className="mt-0.5 font-mono text-xs text-slate-500">{order.product?.code ?? "-"}</p>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <p className="font-semibold tabular-nums text-slate-50">{formatQty(order.producedQty)} / {formatQty(order.plannedQty)} AD</p>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                          <div className={cn("h-full rounded-full", order.status === "COMPLETED" ? "bg-emerald-400/75" : "bg-sky-400/75")} style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-300">
                        {order.bom ? (
                          <>
                            <p className="text-sm">{order.bom.name}</p>
                            <p className="mt-0.5 font-mono text-xs text-slate-500">v{order.bom.version}</p>
                          </>
                        ) : <span className="text-slate-500">BOM yok</span>}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-400">
                        <p>Başlangıç {order.startDate ? formatDate(order.startDate) : "-"}</p>
                        <p className="mt-0.5 text-slate-500">Bitiş {order.endDate ? formatDate(order.endDate) : "-"}</p>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-400">
                        <p>{order._count?.items ?? 0} malzeme</p>
                        <p className="mt-0.5">{order._count?.operations ?? 0} operasyon</p>
                      </td>
                      <td className="px-4 py-3.5 text-center"><StatusBadge status={order.status} /></td>
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/dashboard/production/work-orders/${order.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-sky-500/10 hover:text-sky-300"
                          aria-label="Detay"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data && data.meta.totalPages > 1 && (
            <div className="flex flex-col gap-3 border-t border-slate-800/70 bg-slate-900/45 px-4 py-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <span>{(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, data.meta.total)} / {data.meta.total} iş emri</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Önceki</Button>
                <span className="min-w-16 text-center tabular-nums text-slate-300">{page} / {data.meta.totalPages}</span>
                <Button size="sm" variant="secondary" disabled={page >= data.meta.totalPages} onClick={() => setPage((prev) => Math.min(data.meta.totalPages, prev + 1))}>Sonraki</Button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryMetric({ label, value, tone = "text-slate-200" }: { label: string; value: string | number; tone?: string }) {
  return (
    <span className={cn("border-r border-slate-800 pr-4 last:border-r-0 last:pr-0 font-semibold tabular-nums", tone)}>
      {value} <span className="text-[11px] font-medium uppercase text-slate-500">{label}</span>
    </span>
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, row) => (
        <tr key={row} className="border-b border-slate-800/45 last:border-0">
          {Array.from({ length: 8 }).map((__, col) => (
            <td key={col} className="px-4 py-3.5">
              <div className="h-3.5 animate-pulse rounded bg-slate-800/75" style={{ width: `${42 + ((row + col) % 3) * 18}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
