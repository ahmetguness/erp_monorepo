"use client";

import { useMemo, useState } from "react";
import { Factory, FilterX, Pencil, Plus, Search, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useWorkCenters, useCreateWorkCenter, useUpdateWorkCenter, useDeleteWorkCenter } from "@/hooks/useProduction";
import { cn } from "@/lib/utils";
import type { WorkCenter } from "@/services/production.service";

const PAGE_SIZE = 50;
const EMPTY_WORK_CENTERS: WorkCenter[] = [];
type StatusFilter = "all" | "active" | "passive";

function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value)} saat`;
}

export function WorkCentersPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WorkCenter | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [form, setForm] = useState({ code: "", name: "", description: "", capacity: "" });

  const { data, isLoading } = useWorkCenters({ page, limit: PAGE_SIZE });
  const create = useCreateWorkCenter();
  const update = useUpdateWorkCenter();
  const remove = useDeleteWorkCenter();
  const rows = data?.data ?? EMPTY_WORK_CENTERS;

  const filteredRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return rows.filter((center) => {
      const haystack = [center.code, center.name, center.description].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
      const matchesSearch = !q || haystack.includes(q);
      const matchesStatus = status === "all" || (status === "active" ? center.isActive : !center.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [rows, search, status]);

  const summary = useMemo(() => ({
    total: rows.length,
    active: rows.filter((center) => center.isActive).length,
    passive: rows.filter((center) => !center.isActive).length,
    capacity: rows.reduce((sum, center) => sum + Number(center.capacity ?? 0), 0),
    operations: rows.reduce((sum, center) => sum + (center._count?.operations ?? 0), 0),
    workOrderOps: rows.reduce((sum, center) => sum + (center._count?.workOrderOps ?? 0), 0),
  }), [rows]);

  const hasFilters = Boolean(search || status !== "all");
  const resetForm = () => setForm({ code: "", name: "", description: "", capacity: "" });
  const openEdit = (center: WorkCenter) => {
    setEditTarget(center);
    setForm({
      code: center.code,
      name: center.name,
      description: center.description ?? "",
      capacity: center.capacity?.toString() ?? "",
    });
  };
  const closeCreate = () => {
    setCreateOpen(false);
    resetForm();
  };
  const clearFilters = () => {
    setSearch("");
    setStatus("all");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="İş Merkezleri"
        subtitle="Üretim kapasitesini, operasyon kapsamını ve aktif iş merkezlerini yönetin."
        className="mb-0"
        action={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => { setCreateOpen(true); resetForm(); }}>Yeni İş Merkezi</Button>}
      />

      <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <SummaryMetric label="İş Merkezi" value={summary.total} />
          <SummaryMetric label="Aktif" value={summary.active} tone="text-sky-300" />
          <SummaryMetric label="Pasif" value={summary.passive} />
          <SummaryMetric label="Günlük Kapasite" value={formatHours(summary.capacity)} />
          <SummaryMetric label="Operasyon" value={summary.operations} />
          <SummaryMetric label="İş Emri Operasyonu" value={summary.workOrderOps} />
        </div>
      </div>

      <section>
        <div className="mb-3 rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
          <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto_auto] lg:items-center">
            <Input aria-label="İş merkezi ara" placeholder="Kod, ad veya açıklama ara..." value={search} onChange={(event) => setSearch(event.target.value)} prefixIcon={<Search className="h-4 w-4" />} />
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
            <table className="w-full min-w-[820px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-900/95">
                <tr className="border-b border-slate-800/80">
                  {["İş Merkezi", "Kapasite", "Operasyon", "İş Emri Operasyonu", "Durum", ""].map((header, index) => (
                    <th key={header || index} className={cn("px-4 py-3 text-left text-[11px] font-semibold uppercase text-slate-500", [1, 2, 3].includes(index) && "text-right", index === 4 && "text-center")}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? <TableSkeleton /> : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center">
                      <Factory className="mx-auto h-8 w-8 text-slate-600" />
                      <p className="mt-3 text-sm font-semibold text-slate-200">{hasFilters ? "Filtrelerle eşleşen iş merkezi bulunamadı" : "İş merkezi bulunamadı"}</p>
                      <p className="mt-1 text-sm text-slate-500">{hasFilters ? "Arama veya durum filtresini değiştirin." : "Yeni bir iş merkezi oluşturarak başlayın."}</p>
                      {hasFilters ? (
                        <Button className="mt-4" size="sm" variant="secondary" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Filtreleri Temizle</Button>
                      ) : (
                        <Button className="mt-4" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreateOpen(true)}>Yeni İş Merkezi</Button>
                      )}
                    </td>
                  </tr>
                ) : filteredRows.map((center) => (
                  <tr key={center.id} className="border-b border-slate-800/45 transition-colors duration-150 last:border-b-0 hover:bg-sky-500/[0.04]">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10">
                          <Factory className="h-3.5 w-3.5 text-sky-300" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-100">{center.name}</p>
                          <p className="mt-0.5 font-mono text-xs text-slate-500">{center.code}{center.description ? ` · ${center.description}` : ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-slate-100">{formatHours(center.capacity)}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-slate-300">{center._count?.operations ?? 0}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-slate-300">{center._count?.workOrderOps ?? 0}</td>
                    <td className="px-4 py-3.5 text-center">{center.isActive ? <Badge variant="info">Aktif</Badge> : <Badge variant="neutral">Pasif</Badge>}</td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton label="Düzenle" tone="amber" onClick={() => openEdit(center)}><Pencil className="h-3.5 w-3.5" /></IconButton>
                        <IconButton label="Durum değiştir" tone="sky" onClick={() => update.mutate({ id: center.id, data: { isActive: !center.isActive } })}>
                          {center.isActive ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
                        </IconButton>
                        <IconButton label="Sil" tone="red" onClick={() => remove.mutate(center.id)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && data.meta.totalPages > 1 && (
            <div className="flex flex-col gap-3 border-t border-slate-800/70 bg-slate-900/45 px-4 py-3 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
              <span>{(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, data.meta.total)} / {data.meta.total} iş merkezi</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Önceki</Button>
                <span className="min-w-16 text-center tabular-nums text-slate-300">{page} / {data.meta.totalPages}</span>
                <Button size="sm" variant="secondary" disabled={page >= data.meta.totalPages} onClick={() => setPage((prev) => Math.min(data.meta.totalPages, prev + 1))}>Sonraki</Button>
              </div>
            </div>
          )}
        </div>
      </section>

      <WorkCenterModal
        isOpen={createOpen}
        title="Yeni İş Merkezi"
        form={form}
        setForm={setForm}
        onClose={closeCreate}
        primaryLabel="Oluştur"
        loading={create.isPending}
        disabled={!form.code.trim() || !form.name.trim()}
        onSubmit={() => create.mutate({
          code: form.code,
          name: form.name,
          description: form.description || undefined,
          capacity: form.capacity ? Number(form.capacity) : undefined,
        }, { onSuccess: closeCreate })}
        showCode
      />

      <WorkCenterModal
        isOpen={Boolean(editTarget)}
        title="İş Merkezi Düzenle"
        form={form}
        setForm={setForm}
        onClose={() => setEditTarget(null)}
        primaryLabel="Kaydet"
        loading={update.isPending}
        disabled={!form.name.trim()}
        onSubmit={() => {
          if (!editTarget) return;
          update.mutate({
            id: editTarget.id,
            data: {
              name: form.name,
              description: form.description || undefined,
              capacity: form.capacity ? Number(form.capacity) : undefined,
            },
          }, { onSuccess: () => setEditTarget(null) });
        }}
      />
    </div>
  );
}

function WorkCenterModal({
  isOpen,
  title,
  form,
  setForm,
  onClose,
  onSubmit,
  primaryLabel,
  loading,
  disabled,
  showCode = false,
}: {
  isOpen: boolean;
  title: string;
  form: { code: string; name: string; description: string; capacity: string };
  setForm: React.Dispatch<React.SetStateAction<{ code: string; name: string; description: string; capacity: string }>>;
  onClose: () => void;
  onSubmit: () => void;
  primaryLabel: string;
  loading: boolean;
  disabled: boolean;
  showCode?: boolean;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={<><Button variant="ghost" size="sm" onClick={onClose}>İptal</Button><Button size="sm" loading={loading} disabled={disabled} onClick={onSubmit}>{primaryLabel}</Button></>}
    >
      <div className="space-y-4">
        {showCode && <Input label="Kod" required placeholder="örn. WC01" value={form.code} onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))} />}
        <Input label="Ad" required placeholder="örn. Montaj Hattı 1" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
        <Input label="Açıklama" placeholder="Opsiyonel" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
        <Input label="Günlük Kapasite (saat)" type="number" step="0.5" placeholder="örn. 8" value={form.capacity} onChange={(event) => setForm((prev) => ({ ...prev, capacity: event.target.value }))} />
      </div>
    </Modal>
  );
}

function IconButton({ label, tone, onClick, children }: { label: string; tone: "sky" | "amber" | "red"; onClick: () => void; children: React.ReactNode }) {
  const toneClass = tone === "red" ? "hover:bg-red-500/10 hover:text-red-300" : tone === "amber" ? "hover:bg-amber-500/10 hover:text-amber-300" : "hover:bg-sky-500/10 hover:text-sky-300";
  return (
    <button type="button" onClick={onClick} className={cn("inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-600 transition-colors", toneClass)} aria-label={label}>
      {children}
    </button>
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
          {Array.from({ length: 6 }).map((__, col) => (
            <td key={col} className="px-4 py-3.5">
              <div className="h-3.5 animate-pulse rounded bg-slate-800/75" style={{ width: `${42 + ((row + col) % 3) * 18}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
