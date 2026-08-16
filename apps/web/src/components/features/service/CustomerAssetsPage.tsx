"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { AlertTriangle, Eye, ImageIcon, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { AttachmentPanel } from "@/components/shared/AttachmentPanel";
import { EntityImage } from "@/components/shared/EntityImage";
import { EntityImageManager } from "@/components/shared/EntityImageManager";
import { ContactSelect } from "@/components/shared/EntitySelect";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { FormRow } from "@/components/shared/FormField";
import { useCustomerAssets, useCreateCustomerAsset, useDeleteCustomerAsset } from "@/hooks/useService";
import { cn, formatDate } from "@/lib/utils";
import type { CustomerAsset } from "@/services/service.service";

function isWarrantyActive(warrantyEnd: string | null): boolean {
  if (!warrantyEnd) return false;
  return new Date(warrantyEnd) > new Date();
}

function isWarrantyExpiring(warrantyEnd: string | null): boolean {
  if (!warrantyEnd) return false;
  const end = new Date(warrantyEnd).getTime();
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return end > now && end - now <= thirtyDays;
}

function warrantyLabel(asset: CustomerAsset): ReactNode {
  if (!asset.warrantyEnd) return <span className="text-slate-600">-</span>;
  if (isWarrantyExpiring(asset.warrantyEnd)) return <Badge variant="warning">{formatDate(asset.warrantyEnd)}</Badge>;
  if (isWarrantyActive(asset.warrantyEnd)) return <Badge variant="success">{formatDate(asset.warrantyEnd)}</Badge>;
  return <Badge variant="danger">Süresi dolmuş</Badge>;
}

function brandModel(asset: CustomerAsset): string {
  return [asset.brand, asset.model].filter(Boolean).join(" ") || "-";
}

function warrantyText(asset: CustomerAsset): string {
  if (!asset.warrantyEnd) return "-";
  if (isWarrantyActive(asset.warrantyEnd)) return `Aktif - ${formatDate(asset.warrantyEnd)}`;
  return "Süresi dolmuş";
}

export function CustomerAssetsPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailAsset, setDetailAsset] = useState<CustomerAsset | null>(null);
  const [form, setForm] = useState({ contactId: "", name: "", brand: "", model: "", serialNo: "", purchaseDate: "", warrantyEnd: "", notes: "" });

  const { data, isLoading, isFetching, refetch } = useCustomerAssets({ page, limit: 20 });
  const create = useCreateCustomerAsset();
  const remove = useDeleteCustomerAsset();

  const rows = useMemo(() => data?.data ?? [], [data?.data]);
  const summary = useMemo(() => ({
    total: data?.meta.total ?? rows.length,
    visible: rows.length,
    activeWarranty: rows.filter((asset) => isWarrantyActive(asset.warrantyEnd)).length,
    expiringWarranty: rows.filter((asset) => isWarrantyExpiring(asset.warrantyEnd)).length,
    expiredWarranty: rows.filter((asset) => asset.warrantyEnd && !isWarrantyActive(asset.warrantyEnd)).length,
    serviceLinked: rows.filter((asset) => (asset._count?.serviceRequests ?? 0) > 0).length,
  }), [data?.meta.total, rows]);

  const resetForm = () => setForm({ contactId: "", name: "", brand: "", model: "", serialNo: "", purchaseDate: "", warrantyEnd: "", notes: "" });

  const columns: ColumnDef<CustomerAsset>[] = [
    {
      key: "name",
      header: "Varlık",
      render: (asset) => (
        <div className="flex min-w-0 items-center gap-3">
          <EntityImage entityType="CUSTOMER_ASSET" entityId={asset.id} className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white">{asset.name}</span>
            <span className="mt-1 block truncate text-xs text-slate-500">{brandModel(asset)}</span>
          </div>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Müşteri",
      width: "190px",
      render: (asset) => <span className="block truncate text-sm text-slate-300">{asset.contact?.name ?? "-"}</span>,
    },
    {
      key: "serialNo",
      header: "Seri No",
      width: "150px",
      render: (asset) => asset.serialNo ? <code className="rounded bg-slate-800/60 px-2 py-0.5 text-xs text-slate-300">{asset.serialNo}</code> : <span className="text-slate-600">-</span>,
    },
    {
      key: "purchase",
      header: "Satın Alma",
      width: "125px",
      render: (asset) => <span className="text-xs text-slate-400">{asset.purchaseDate ? formatDate(asset.purchaseDate) : "-"}</span>,
    },
    {
      key: "warranty",
      header: "Garanti",
      width: "130px",
      render: warrantyLabel,
    },
    {
      key: "serviceCount",
      header: "Servis",
      width: "80px",
      align: "right",
      render: (asset) => <span className={(asset._count?.serviceRequests ?? 0) > 0 ? "font-medium text-sky-300" : "text-slate-500"}>{asset._count?.serviceRequests ?? 0}</span>,
    },
    {
      key: "actions",
      header: "",
      width: "84px",
      align: "right",
      render: (asset) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(event) => {
              event.stopPropagation();
              setDetailAsset(asset);
            }}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-sky-500/10 hover:text-sky-300"
            aria-label="Detay"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              remove.mutate(asset.id);
            }}
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-300"
            aria-label="Sil"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Müşteri varlıkları"
        subtitle="Servise konu olan cihaz, makine ve ekipmanları garanti ve servis geçmişiyle takip edin."
        className="mb-0"
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void refetch()} loading={isFetching} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
              Yenile
            </Button>
            <Button size="sm" onClick={() => { setCreateOpen(true); resetForm(); }} leftIcon={<Plus className="h-4 w-4" />}>
              Yeni varlık
            </Button>
          </div>
        }
      />

      <SummaryStrip
        metrics={[
          { label: "Toplam Varlık", value: summary.total, tone: "text-slate-50" },
          { label: "Bu Sayfa", value: summary.visible, tone: "text-sky-200" },
          { label: "Aktif Garanti", value: summary.activeWarranty, tone: "text-emerald-300" },
          { label: "Yakında Bitecek", value: summary.expiringWarranty, tone: summary.expiringWarranty > 0 ? "text-amber-300" : "text-slate-200" },
          { label: "Süresi Dolmuş", value: summary.expiredWarranty, tone: summary.expiredWarranty > 0 ? "text-red-300" : "text-slate-200" },
          { label: "Servis Geçmişi", value: summary.serviceLinked, tone: "text-violet-300" },
        ]}
      />

      {(summary.expiringWarranty > 0 || summary.expiredWarranty > 0) && (
        <AttentionBar expiring={summary.expiringWarranty} expired={summary.expiredWarranty} />
      )}

      <section className="rounded-xl border border-slate-800/80 bg-slate-950/40">
        <div className="border-b border-slate-800/70 bg-slate-900/45 px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-sky-300" />
            <h2 className="text-sm font-semibold text-white">Varlık envanteri</h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Garanti, seri numarası ve servis bağlantılarıyla müşteri ekipmanları.</p>
        </div>
        <div className="p-4">
          <DataTable
            columns={columns}
            data={rows}
            keyExtractor={(asset) => asset.id}
            isLoading={isLoading}
            density="compact"
            onRowClick={(asset) => setDetailAsset(asset)}
            emptyTitle="Müşteri varlığı bulunamadı"
            emptyDescription="Yeni bir varlık ekleyerek başlayın."
            pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
          />
        </div>
      </section>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni müşteri varlığı"
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
            <Button
              size="sm"
              loading={create.isPending}
              disabled={!form.contactId.trim() || !form.name.trim()}
              onClick={() => create.mutate({
                contactId: form.contactId,
                name: form.name,
                brand: form.brand || undefined,
                model: form.model || undefined,
                serialNo: form.serialNo || undefined,
                notes: form.notes || undefined,
                purchaseDate: form.purchaseDate || undefined,
                warrantyEnd: form.warrantyEnd || undefined,
              }, {
                onSuccess: () => {
                  setCreateOpen(false);
                  resetForm();
                },
              })}
            >
              Oluştur
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <ContactSelect
            label="Müşteri"
            required
            value={form.contactId}
            onChange={(value) => setForm((prev) => ({ ...prev, contactId: value }))}
          />
          <Input label="Varlık adı" required placeholder="Ör. HP LaserJet Pro" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
          <FormRow cols={2}>
            <Input label="Marka" placeholder="Ör. HP" value={form.brand} onChange={(event) => setForm((prev) => ({ ...prev, brand: event.target.value }))} />
            <Input label="Model" placeholder="Ör. LaserJet Pro M404" value={form.model} onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))} />
          </FormRow>
          <Input label="Seri no" placeholder="Ör. SN12345678" value={form.serialNo} onChange={(event) => setForm((prev) => ({ ...prev, serialNo: event.target.value }))} />
          <FormRow cols={2}>
            <DatePicker label="Satın alma tarihi" value={form.purchaseDate} onValueChange={(value) => setForm((prev) => ({ ...prev, purchaseDate: value ?? "" }))} />
            <DatePicker label="Garanti bitiş" value={form.warrantyEnd} onValueChange={(value) => setForm((prev) => ({ ...prev, warrantyEnd: value ?? "" }))} />
          </FormRow>
        </div>
      </Modal>

      <Modal
        isOpen={!!detailAsset}
        onClose={() => setDetailAsset(null)}
        title={detailAsset?.name ?? "Varlık detayı"}
        size="md"
        footer={<Button variant="ghost" size="sm" onClick={() => setDetailAsset(null)}>Kapat</Button>}
      >
        {detailAsset && (
          <div className="space-y-5">
            <EntityImageManager
              entityType="CUSTOMER_ASSET"
              entityId={detailAsset.id}
              label="Cihaz fotoğrafı"
              description="Servis varlığı için cihaz veya ekipman fotoğrafı yükleyin."
            />
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Müşteri", value: detailAsset.contact?.name ?? "-" },
                { label: "Marka / Model", value: brandModel(detailAsset) },
                { label: "Seri No", value: detailAsset.serialNo ?? "-" },
                { label: "Garanti", value: warrantyText(detailAsset) },
                { label: "Satın Alma", value: detailAsset.purchaseDate ? formatDate(detailAsset.purchaseDate) : "-" },
                { label: "Servis", value: `${detailAsset._count?.serviceRequests ?? 0} talep` },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-950/35 px-4 py-3">
                  <div className="mb-1 text-[10px] uppercase text-slate-500">{item.label}</div>
                  <div className="text-sm text-white">{item.value}</div>
                </div>
              ))}
            </div>
            {detailAsset.notes && (
              <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-4">
                <div className="mb-1 text-[10px] uppercase text-slate-500">Not</div>
                <p className="text-sm text-slate-300">{detailAsset.notes}</p>
              </div>
            )}
            <AttachmentPanel entityType="CUSTOMER_ASSET" entityId={detailAsset.id} />
          </div>
        )}
      </Modal>
    </div>
  );
}

function SummaryStrip({ metrics }: { metrics: Array<{ label: string; value: ReactNode; tone: string }> }) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {metrics.map((metric, index) => (
          <div key={metric.label} className="flex items-center gap-x-4">
            {index > 0 && <span className="h-4 w-px bg-slate-800" />}
            <span className={cn("font-semibold tabular-nums", metric.tone)}>
              {metric.value} <span className="text-[11px] font-medium uppercase text-slate-500">{metric.label}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttentionBar({ expiring, expired }: { expiring: number; expired: number }) {
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-amber-100">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
        <span>
          Garanti takibi isteyen varlıklar var:
          {expiring > 0 && <strong className="ml-1 font-semibold">{expiring} yakında bitecek</strong>}
          {expired > 0 && <strong className="ml-1 font-semibold">{expired} süresi dolmuş</strong>}.
        </span>
      </div>
    </div>
  );
}
