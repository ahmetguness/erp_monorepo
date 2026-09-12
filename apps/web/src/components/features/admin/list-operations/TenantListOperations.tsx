"use client";
import type { AdminTenantColumn, AdminTenantListConfig } from "@repo/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Save, StickyNote } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { deleteTenantView, executeBulkTenantNote, exportTenantCsv, listTenantViews, previewBulkTenantNote, saveTenantView } from "@/services/admin-list-operations.service";
import { toastAdminError } from "@/lib/admin/errors";
import { toast } from "@/store/ui.store";

const control = "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200";
const columns: Array<{ key: AdminTenantColumn; label: string }> = [
  { key: "companyName", label: "Şirket" }, { key: "status", label: "Durum" }, { key: "plan", label: "Plan" },
  { key: "email", label: "E-posta" }, { key: "city", label: "Şehir" }, { key: "users", label: "Kullanıcı" }, { key: "createdAt", label: "Kayıt tarihi" },
];

export function TenantListOperations({ config, selectedIds, canBulk, onConfig, onCompleted }: { config: AdminTenantListConfig; selectedIds: string[]; canBulk: boolean; onConfig: (value: AdminTenantListConfig) => void; onCompleted: () => void }) {
  const client = useQueryClient();
  const [viewName, setViewName] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const views = useQuery({ queryKey: ["admin", "tenant-list-views"], queryFn: listTenantViews });
  const saveView = useMutation({ mutationFn: () => saveTenantView(viewName, config), onSuccess: async () => { setViewName(""); await client.invalidateQueries({ queryKey: ["admin", "tenant-list-views"] }); toast.success("Görünüm kaydedildi."); }, onError: (error) => toastAdminError(error, "Görünüm kaydedilemedi.") });
  const removeView = useMutation({ mutationFn: deleteTenantView, onSuccess: () => client.invalidateQueries({ queryKey: ["admin", "tenant-list-views"] }) });
  const preview = useMutation({ mutationFn: previewBulkTenantNote, onError: (error) => toastAdminError(error, "Etki özeti alınamadı.") });
  const closeBulk = () => { setBulkOpen(false); setReason(""); setNote(""); setAcknowledged(false); preview.reset(); };
  const openBulk = () => { setReason(""); setNote(""); setAcknowledged(false); preview.reset(); setBulkOpen(true); preview.mutate([...selectedIds]); };
  const execute = useMutation({ mutationFn: () => executeBulkTenantNote({ tenantIds: selectedIds, reason, note, acknowledged: true }), onSuccess: (result) => { toast.success(`${result.succeeded.length} kayıt güncellendi, ${result.failed.length} kayıt başarısız.`); closeBulk(); onCompleted(); }, onError: (error) => toastAdminError(error, "Toplu işlem tamamlanamadı.") });
  const toggleColumn = (key: AdminTenantColumn) => onConfig({ ...config, columns: config.columns.includes(key) ? config.columns.filter((item) => item !== key) : [...config.columns, key] });
  return <>
    <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4" aria-label="Liste görünümü araçları">
      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-slate-400">Başlangıç<input className={`${control} ml-2`} type="date" value={config.from ?? ""} onChange={(event) => onConfig({ ...config, from: event.target.value || undefined })} /></label>
        <label className="text-xs text-slate-400">Bitiş<input className={`${control} ml-2`} type="date" value={config.to ?? ""} onChange={(event) => onConfig({ ...config, to: event.target.value || undefined })} /></label>
        <select aria-label="Sıralama alanı" className={control} value={config.sortBy} onChange={(event) => onConfig({ ...config, sortBy: event.target.value as AdminTenantListConfig["sortBy"] })}><option value="createdAt">Kayıt tarihi</option><option value="companyName">Şirket</option><option value="status">Durum</option><option value="plan">Plan</option></select>
        <button className={control} onClick={() => onConfig({ ...config, sortDirection: config.sortDirection === "asc" ? "desc" : "asc" })}>{config.sortDirection === "asc" ? "Artan" : "Azalan"}</button>
        <button className={control} onClick={() => exportTenantCsv(config).catch((error: unknown) => toastAdminError(error, "CSV alınamadı."))}><Download className="mr-1 inline h-3.5 w-3.5" />CSV</button>
        {canBulk && <button className={control} disabled={selectedIds.length === 0} onClick={openBulk}><StickyNote className="mr-1 inline h-3.5 w-3.5" />Toplu not ({selectedIds.length})</button>}
      </div>
      <details><summary className="cursor-pointer text-xs text-slate-300">Görünen kolonlar</summary><div className="mt-2 flex flex-wrap gap-3">{columns.map((column) => <label key={column.key} className="text-xs text-slate-400"><input className="mr-1" type="checkbox" checked={config.columns.includes(column.key)} disabled={column.key === "companyName"} onChange={() => toggleColumn(column.key)} />{column.label}</label>)}</div></details>
      <div className="flex flex-wrap gap-2"><input aria-label="Görünüm adı" className={control} placeholder="Görünüm adı" value={viewName} onChange={(event) => setViewName(event.target.value)} /><button className={control} disabled={viewName.trim().length < 2 || saveView.isPending} onClick={() => saveView.mutate()}><Save className="mr-1 inline h-3.5 w-3.5" />Kaydet</button>{views.data?.map((view) => <span key={view.id} className="inline-flex rounded-lg border border-slate-700"><button className="px-2 text-xs text-sky-300" onClick={() => onConfig(view.config)}>{view.name}</button><button aria-label={`${view.name} görünümünü sil`} className="border-l border-slate-700 px-2 text-xs text-red-300" onClick={() => removeView.mutate(view.id)}>×</button></span>)}</div>
    </section>
    <Modal isOpen={bulkOpen} onClose={closeBulk} title="Toplu operasyon notu" description={preview.data?.impactSummary ?? "Etki özeti hazırlanıyor."}>
      <div className="space-y-3"><label className="block text-sm text-slate-300">Operasyon notu<textarea className={`${control} mt-1 block w-full`} value={note} onChange={(event) => setNote(event.target.value)} /></label><label className="block text-sm text-slate-300">Gerekçe<textarea className={`${control} mt-1 block w-full`} value={reason} onChange={(event) => setReason(event.target.value)} /></label>{preview.data && preview.data.missingIds.length > 0 && <p className="text-xs text-amber-300">Bulunamayan {preview.data.missingIds.length} kayıt kısmi hata raporuna eklenecek.</p>}<label className="flex gap-2 text-sm text-slate-300"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />Etki özetini inceledim ve işlemi onaylıyorum.</label><button className={control} disabled={!preview.data || !acknowledged || reason.trim().length < 10 || note.trim().length < 3 || execute.isPending} onClick={() => execute.mutate()}>Onayla ve uygula</button></div>
    </Modal>
  </>;
}
