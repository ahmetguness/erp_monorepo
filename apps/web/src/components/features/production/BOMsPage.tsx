"use client";

import { useMemo, useState } from "react";
import { Eye, FilterX, Layers, Plus, Search, ToggleLeft, ToggleRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProductSelect } from "@/components/shared/EntitySelect";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useBOMs, useCreateBOM, useUpdateBOM } from "@/hooks/useProduction";
import { cn, formatDate } from "@/lib/utils";
import type { BOM } from "@/services/production.service";

const PAGE_SIZE = 20;
const EMPTY_BOMS: BOM[] = [];

type StatusFilter = "all" | "active" | "passive";

export function BOMsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [form, setForm] = useState({ productId: "", name: "", version: "1.0" });

  const { data, isLoading } = useBOMs({ page, limit: PAGE_SIZE });
  const create = useCreateBOM();
  const update = useUpdateBOM();
  const rows = data?.data ?? EMPTY_BOMS;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((bom) => {
      const haystack = [bom.name, bom.version, bom.product?.name, bom.product?.code].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
      const matchesSearch = !q || haystack.includes(q);
      const matchesStatus = status === "all" || (status === "active" ? bom.isActive : !bom.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, status]);

  const summary = useMemo(() => ({
    total: rows.length,
    active: rows.filter((bom) => bom.isActive).length,
    passive: rows.filter((bom) => !bom.isActive).length,
    items: rows.reduce((sum, bom) => sum + (bom._count?.items ?? 0), 0),
    routings: rows.reduce((sum, bom) => sum + (bom._count?.routings ?? 0), 0),
    workOrders: rows.reduce((sum, bom) => sum + (bom._count?.workOrders ?? 0), 0),
  }), [rows]);

  const hasFilters = Boolean(search || status !== "all");
  const clearFilters = () => {
    setSearch("");
    setStatus("all");
  };
  const closeCreate = () => {
    setCreateOpen(false);
    setForm({ productId: "", name: "", version: "1.0" });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ürün Ağaçları (BOM)"
        subtitle="Ürün reçetelerini, malzeme kapsamını ve üretim operasyonlarını yönetin."
        className="mb-0"
        action={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Yeni BOM</Button>}
      />

      <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <SummaryMetric label="BOM" value={summary.total} />
          <SummaryMetric label="Aktif" value={summary.active} tone="text-sky-300" />
          <SummaryMetric label="Pasif" value={summary.passive} />
          <SummaryMetric label="Malzeme" value={summary.items} />
          <SummaryMetric label="Operasyon" value={summary.routings} />
          <SummaryMetric label="İş Emri" value={summary.workOrders} />
        </div>
      </div>

      <section>
        <div className="mb-3 rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto_auto] lg:items-center">
            <Input aria-label="BOM veya ürün ara" placeholder="BOM, ürün veya kod ara..." value={search} onChange={(event) => setSearch(event.target.value)} prefixIcon={<Search className="h-4 w-4" />} />
            <div className="inline-flex h-10 overflow-hidden rounded-xl border border-slate-700/75 bg-slate-950/35 p-1">
              {[
                { value: "all", label: "Tümü" },
                { value: "active", label: "Aktif" },
                { value: "passive", label: "Pasif" },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setStatus(item.value as StatusFilter)}
                  className={cn("rounded-lg px-3 text-xs font-medium transition-colors", status === item.value ? "bg-sky-500/15 text-sky-300" : "text-slate-500 hover:text-slate-200")}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {hasFilters && <Button variant="ghost" size="sm" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Temizle</Button>}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-900/95">
                <tr className="border-b border-slate-800/80">
                  {["BOM", "Ürün", "Kapsam", "Kullanım", "Oluşturma", "Durum", ""].map((header, index) => (
                    <th key={header || index} className={cn("px-4 py-3 text-left text-[11px] font-semibold uppercase text-slate-500", [2, 3].includes(index) && "text-right", index === 5 && "text-center")}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? <TableSkeleton /> : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center">
                      <Layers className="mx-auto h-8 w-8 text-slate-600" />
                      <p className="mt-3 text-sm font-semibold text-slate-200">{hasFilters ? "Filtrelerle eşleşen BOM bulunamadı" : "BOM bulunamadı"}</p>
                      <p className="mt-1 text-sm text-slate-500">{hasFilters ? "Arama veya durum filtresini değiştirin." : "Yeni bir ürün ağacı oluşturarak başlayın."}</p>
                      {hasFilters ? (
                        <Button className="mt-4" size="sm" variant="secondary" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Filtreleri Temizle</Button>
                      ) : (
                        <Button className="mt-4" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateOpen(true)}>Yeni BOM</Button>
                      )}
                    </td>
                  </tr>
                ) : filteredRows.map((bom) => (
                  <tr
                    key={bom.id}
                    onClick={() => router.push(`/dashboard/production/boms/${bom.id}`)}
                    className="group cursor-pointer border-b border-slate-800/45 transition-colors duration-150 last:border-b-0 hover:bg-sky-500/[0.04]"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-500/20 bg-violet-500/10">
                          <Layers className="h-3.5 w-3.5 text-violet-300" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-100">{bom.name}</p>
                          <p className="mt-0.5 font-mono text-xs text-slate-500">v{bom.version}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-100">{bom.product?.name ?? "Ürün bilgisi yok"}</p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">{bom.product?.code ?? "-"}</p>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-slate-300">
                      <p>{bom._count?.items ?? 0} malzeme</p>
                      <p className="mt-0.5 text-xs text-slate-500">{bom._count?.routings ?? 0} operasyon</p>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-slate-300">{bom._count?.workOrders ?? 0} iş emri</td>
                    <td className="px-4 py-3.5 text-xs text-slate-400">{formatDate(bom.createdAt)}</td>
                    <td className="px-4 py-3.5 text-center">{bom.isActive ? <Badge variant="info">Aktif</Badge> : <Badge variant="neutral">Pasif</Badge>}</td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/dashboard/production/boms/${bom.id}`);
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-sky-500/10 hover:text-sky-300"
                          aria-label="Detay"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            update.mutate({ id: bom.id, data: { isActive: !bom.isActive } });
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-amber-500/10 hover:text-amber-300"
                          aria-label="Durum değiştir"
                        >
                          {bom.isActive ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && data.meta.totalPages > 1 && (
            <div className="flex flex-col gap-3 border-t border-slate-800/70 bg-slate-900/45 px-4 py-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <span>{(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, data.meta.total)} / {data.meta.total} BOM</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Önceki</Button>
                <span className="min-w-16 text-center tabular-nums text-slate-300">{page} / {data.meta.totalPages}</span>
                <Button size="sm" variant="secondary" disabled={page >= data.meta.totalPages} onClick={() => setPage((prev) => Math.min(data.meta.totalPages, prev + 1))}>Sonraki</Button>
              </div>
            </div>
          )}
        </div>
      </section>

      <Modal
        isOpen={createOpen}
        onClose={closeCreate}
        title="Yeni BOM"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={closeCreate}>İptal</Button>
            <Button
              size="sm"
              loading={create.isPending}
              disabled={!form.productId.trim() || !form.name.trim()}
              onClick={() =>
                create.mutate(
                  { productId: form.productId, name: form.name, version: form.version || "1.0" },
                  { onSuccess: closeCreate },
                )
              }
            >
              Oluştur
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <ProductSelect label="Ürün" required value={form.productId} onChange={(value) => setForm((prev) => ({ ...prev, productId: value }))} />
          <Input label="BOM Adı" required placeholder="örn. Laptop Pro Reçetesi" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
          <Input label="Versiyon" placeholder="1.0" value={form.version} onChange={(event) => setForm((prev) => ({ ...prev, version: event.target.value }))} />
        </div>
      </Modal>
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
          {Array.from({ length: 7 }).map((__, col) => (
            <td key={col} className="px-4 py-3.5">
              <div className="h-3.5 animate-pulse rounded bg-slate-800/75" style={{ width: `${42 + ((row + col) % 3) * 18}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
