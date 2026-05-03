"use client";

import { useState } from "react";
import {
  Plus,
  Link2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  Wifi,
  RefreshCw,
  Package,
  ShoppingCart,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  useIntegrations,
  useCreateIntegration,
  useUpdateIntegration,
  useDeleteIntegration,
} from "@/hooks/useMarketplace";
import { formatDate } from "@/lib/utils";
import {
  testTrendyolConnection,
  syncTrendyolOrders,
  syncTrendyolStock,
  getTrendyolJobStatus,
  type TrendyolSyncJob,
} from "@/services/marketplace.service";

const CHANNELS = [
  { value: "TRENDYOL",    label: "Trendyol",    color: "text-orange-400 bg-orange-500/10" },
  { value: "HEPSIBURADA", label: "Hepsiburada", color: "text-amber-400 bg-amber-500/10" },
  { value: "N11",         label: "N11",         color: "text-purple-400 bg-purple-500/10" },
  { value: "AMAZON",      label: "Amazon",      color: "text-yellow-400 bg-yellow-500/10" },
  { value: "CICEKSEPETI", label: "Çiçeksepeti", color: "text-pink-400 bg-pink-500/10" },
  { value: "OTHER",       label: "Diğer",       color: "text-slate-400 bg-slate-500/10" },
];

const getChannelInfo = (ch: string) =>
  CHANNELS.find((c) => c.value === ch) ?? CHANNELS[5];

// ─── Trendyol action panel ────────────────────

interface TrendyolActionsProps {
  integrationId: string;
}

function TrendyolActions({ integrationId }: TrendyolActionsProps) {
  const qc = useQueryClient();
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeJob, setActiveJob] = useState<TrendyolSyncJob | null>(null);
  const [polling, setPolling] = useState(false);

  // Poll job until DONE or FAILED
  async function pollJob(jobId: string) {
    setPolling(true);
    const maxAttempts = 60; // 5 min max
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 5_000));
      try {
        const job = await getTrendyolJobStatus(integrationId, jobId);
        setActiveJob(job);
        if (job.status === "DONE" || job.status === "FAILED") {
          qc.invalidateQueries({ queryKey: ["mp-integrations"] });
          qc.invalidateQueries({ queryKey: ["mp-orders"] });
          break;
        }
      } catch { break; }
    }
    setPolling(false);
  }

  const testConn = useMutation({
    mutationFn: () => testTrendyolConnection(integrationId),
    onSuccess: (r) => setTestResult(r),
    onError: () => setTestResult({ success: false, message: "Bağlantı testi başarısız." }),
  });

  const syncOrders = useMutation({
    mutationFn: () => syncTrendyolOrders(integrationId, { hoursBack: 24 }),
    onSuccess: (r) => { setActiveJob(null); pollJob(r.jobId); },
  });

  const syncStock = useMutation({
    mutationFn: () => syncTrendyolStock(integrationId),
    onSuccess: (r) => { setActiveJob(null); pollJob(r.jobId); },
  });

  const isBusy = testConn.isPending || syncOrders.isPending || syncStock.isPending || polling;

  return (
    <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
      {/* Test connection */}
      <button
        onClick={() => { setTestResult(null); testConn.mutate(); }}
        disabled={isBusy}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors disabled:opacity-40"
      >
        {testConn.isPending
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Wifi className="w-3.5 h-3.5 text-sky-400" />}
        Bağlantıyı Test Et
      </button>

      {testResult && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
          testResult.success
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-red-500/10 text-red-400"
        }`}>
          {testResult.success
            ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            : <XCircle className="w-3.5 h-3.5 shrink-0" />}
          {testResult.message}
        </div>
      )}

      {/* Sync orders */}
      <button
        onClick={() => syncOrders.mutate()}
        disabled={isBusy}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors disabled:opacity-40"
      >
        {syncOrders.isPending
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <ShoppingCart className="w-3.5 h-3.5 text-violet-400" />}
        Siparişleri Senkronize Et
      </button>

      {/* Sync stock */}
      <button
        onClick={() => syncStock.mutate()}
        disabled={isBusy}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors disabled:opacity-40"
      >
        {syncStock.isPending
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Package className="w-3.5 h-3.5 text-emerald-400" />}
        Stok / Fiyat Senkronize Et
      </button>

      {/* Job status */}
      {(polling || activeJob) && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
          activeJob?.status === "DONE"   ? "bg-emerald-500/10 text-emerald-400" :
          activeJob?.status === "FAILED" ? "bg-red-500/10 text-red-400" :
          "bg-sky-500/10 text-sky-400"
        }`}>
          {polling && activeJob?.status !== "DONE" && activeJob?.status !== "FAILED"
            ? <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
            : activeJob?.status === "DONE"
              ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              : <XCircle className="w-3.5 h-3.5 shrink-0" />}
          <span>
            {activeJob?.status === "DONE"
              ? `Tamamlandı — ${activeJob.processedCount} kayıt işlendi`
              : activeJob?.status === "FAILED"
                ? `Hata: ${activeJob.errorMessage ?? "Bilinmeyen hata"}`
                : "Senkronizasyon devam ediyor…"}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────

export function IntegrationsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    channel: "TRENDYOL",
    name: "",
    apiKey: "",
    apiSecret: "",
    storeId: "",
  });

  const { data: integrations = [], isLoading } = useIntegrations();
  const create = useCreateIntegration();
  const update = useUpdateIntegration();
  const remove = useDeleteIntegration();

  return (
    <div>
      <PageHeader
        title="Pazaryeri Entegrasyonları"
        subtitle="E-ticaret kanallarını bağlayın ve yönetin."
        action={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            Yeni Entegrasyon
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : integrations.length === 0 ? (
        <div className="text-center py-20">
          <Link2 className="w-10 h-10 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Henüz entegrasyon yok.</p>
          <p className="text-slate-600 text-xs mt-1">
            Bir pazaryeri kanalı bağlayarak başlayın.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {integrations.map((intg) => {
            const ch = getChannelInfo(intg.channel);
            return (
              <div
                key={intg.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ch.color}`}>
                      <Link2 className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-white font-medium text-sm">{intg.name}</h3>
                      <span className="text-xs text-slate-500">{ch.label}</span>
                    </div>
                  </div>
                  {intg.isActive
                    ? <Badge variant="success">Aktif</Badge>
                    : <Badge variant="neutral">Pasif</Badge>}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-slate-800/40 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-slate-500">Ürün</div>
                    <div className="text-sm text-white font-medium">{intg._count?.listings ?? 0}</div>
                  </div>
                  <div className="bg-slate-800/40 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-slate-500">Sipariş</div>
                    <div className="text-sm text-white font-medium">{intg._count?.orders ?? 0}</div>
                  </div>
                </div>

                {intg.syncErrors > 0 && (
                  <div className="flex items-center gap-2 text-xs text-red-400 mb-3">
                    <AlertCircle className="w-3 h-3" />
                    {intg.syncErrors} senkronizasyon hatası
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                  <span className="text-[10px] text-slate-600">
                    {intg.lastSyncAt
                      ? `Son sync: ${formatDate(intg.lastSyncAt)}`
                      : "Henüz senkronize edilmedi"}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => update.mutate({ id: intg.id, data: { isActive: !intg.isActive } })}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
                      title={intg.isActive ? "Pasife al" : "Aktife al"}
                    >
                      {intg.isActive
                        ? <ToggleRight className="w-3.5 h-3.5" />
                        : <ToggleLeft className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => remove.mutate(intg.id)}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Sil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Trendyol-specific actions */}
                {intg.channel === "TRENDYOL" && (
                  <TrendyolActions integrationId={intg.id} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni Pazaryeri Entegrasyonu"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>
              İptal
            </Button>
            <Button
              size="sm"
              loading={create.isPending}
              disabled={!form.name.trim()}
              onClick={() =>
                create.mutate(
                  {
                    channel: form.channel,
                    name: form.name,
                    apiKey: form.apiKey || undefined,
                    apiSecret: form.apiSecret || undefined,
                    storeId: form.storeId || undefined,
                  },
                  {
                    onSuccess: () => {
                      setCreateOpen(false);
                      setForm({ channel: "TRENDYOL", name: "", apiKey: "", apiSecret: "", storeId: "" });
                    },
                  },
                )
              }
            >
              Bağla
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Kanal"
            required
            options={CHANNELS.map((c) => ({ value: c.value, label: c.label }))}
            value={form.channel}
            onChange={(e) => setForm((p) => ({ ...p, channel: e.target.value }))}
          />
          <Input
            label="Entegrasyon Adı"
            required
            placeholder="ör. Trendyol Mağazam"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
          <Input
            label="API Key"
            placeholder="Opsiyonel"
            value={form.apiKey}
            onChange={(e) => setForm((p) => ({ ...p, apiKey: e.target.value }))}
          />
          <Input
            label="API Secret"
            placeholder="Opsiyonel"
            type="password"
            value={form.apiSecret}
            onChange={(e) => setForm((p) => ({ ...p, apiSecret: e.target.value }))}
          />
          <Input
            label="Mağaza ID"
            placeholder="Opsiyonel"
            value={form.storeId}
            onChange={(e) => setForm((p) => ({ ...p, storeId: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  );
}
