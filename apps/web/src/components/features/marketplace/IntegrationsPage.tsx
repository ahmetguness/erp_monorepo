"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clipboard,
  Eye,
  KeyRound,
  Link2,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Settings,
  ShoppingCart,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Wifi,
  XCircle,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  useCreateIntegration,
  useDeleteIntegration,
  useIntegrations,
  useListingSnapshots,
  useRetrySyncJob,
  useSyncJobs,
  useUpdateIntegration,
  useWebhookEvents,
} from "@/hooks/useMarketplace";
import { formatDate } from "@/lib/utils";
import {
  buildMarketplaceWebhookUrl,
  getIntegrationHealth,
  getTrendyolJobStatus,
  syncTrendyolOrders,
  syncTrendyolStock,
  testTrendyolConnection,
  type MarketplaceIntegration,
  type TrendyolSyncJob,
  type UpdateIntegrationDTO,
} from "@/services/marketplace.service";

const CHANNELS = [
  { value: "TRENDYOL", label: "Trendyol", color: "text-orange-400 bg-orange-500/10" },
  { value: "HEPSIBURADA", label: "Hepsiburada", color: "text-amber-400 bg-amber-500/10" },
  { value: "N11", label: "N11", color: "text-purple-400 bg-purple-500/10" },
  { value: "AMAZON", label: "Amazon", color: "text-yellow-400 bg-yellow-500/10" },
  { value: "CICEKSEPETI", label: "Çiçeksepeti", color: "text-pink-400 bg-pink-500/10" },
  { value: "OTHER", label: "Diğer", color: "text-slate-400 bg-slate-500/10" },
];

const HEALTH_VARIANT = {
  success: "success",
  warning: "warning",
  danger: "danger",
} as const;

type IntegrationForm = {
  channel: string;
  name: string;
  apiKey: string;
  apiSecret: string;
  storeId: string;
};

function emptyForm(): IntegrationForm {
  return { channel: "TRENDYOL", name: "", apiKey: "", apiSecret: "", storeId: "" };
}

function getChannelInfo(channel: string) {
  return CHANNELS.find((candidate) => candidate.value === channel) ?? CHANNELS[5];
}

function toOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildUpdateDTO(form: IntegrationForm): UpdateIntegrationDTO {
  return {
    name: toOptional(form.name),
    apiKey: toOptional(form.apiKey),
    apiSecret: toOptional(form.apiSecret),
    storeId: toOptional(form.storeId),
  };
}

interface TrendyolActionsProps {
  integrationId: string;
}

function TrendyolActions({ integrationId }: TrendyolActionsProps) {
  const qc = useQueryClient();
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeJob, setActiveJob] = useState<TrendyolSyncJob | null>(null);
  const [polling, setPolling] = useState(false);

  async function pollJob(jobId: string) {
    setPolling(true);
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      try {
        const job = await getTrendyolJobStatus(integrationId, jobId);
        setActiveJob(job);
        if (job.status === "DONE" || job.status === "FAILED") {
          qc.invalidateQueries({ queryKey: ["mp-integrations"] });
          qc.invalidateQueries({ queryKey: ["mp-orders"] });
          qc.invalidateQueries({ queryKey: ["mp-sync-jobs"] });
          break;
        }
      } catch {
        break;
      }
    }
    setPolling(false);
  }

  const testConn = useMutation({
    mutationFn: () => testTrendyolConnection(integrationId),
    onSuccess: (result) => setTestResult(result),
    onError: () => setTestResult({ success: false, message: "Bağlantı testi başarısız." }),
  });

  const syncOrders = useMutation({
    mutationFn: () => syncTrendyolOrders(integrationId, { hoursBack: 24 }),
    onSuccess: (result) => {
      setActiveJob(null);
      pollJob(result.jobId);
    },
  });

  const syncStock = useMutation({
    mutationFn: () => syncTrendyolStock(integrationId),
    onSuccess: (result) => {
      setActiveJob(null);
      pollJob(result.jobId);
    },
  });

  const isBusy = testConn.isPending || syncOrders.isPending || syncStock.isPending || polling;

  return (
    <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
      <ActionButton
        icon={testConn.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5 text-sky-400" />}
        label="Bağlantıyı Test Et"
        disabled={isBusy}
        onClick={() => {
          setTestResult(null);
          testConn.mutate();
        }}
      />

      {testResult && (
        <StatusNotice success={testResult.success} message={testResult.message} />
      )}

      <ActionButton
        icon={syncOrders.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5 text-violet-400" />}
        label="Siparişleri Senkronize Et"
        disabled={isBusy}
        onClick={() => syncOrders.mutate()}
      />

      <ActionButton
        icon={syncStock.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5 text-emerald-400" />}
        label="Stok / Fiyat Senkronize Et"
        disabled={isBusy}
        onClick={() => syncStock.mutate()}
      />

      {(polling || activeJob) && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
          activeJob?.status === "DONE"
            ? "bg-emerald-500/10 text-emerald-400"
            : activeJob?.status === "FAILED"
              ? "bg-red-500/10 text-red-400"
              : "bg-sky-500/10 text-sky-400"
        }`}>
          {polling && activeJob?.status !== "DONE" && activeJob?.status !== "FAILED"
            ? <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
            : activeJob?.status === "DONE"
              ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              : <XCircle className="w-3.5 h-3.5 shrink-0" />}
          <span>
            {activeJob?.status === "DONE"
              ? `Tamamlandı - ${activeJob.processedCount} kayıt işlendi`
              : activeJob?.status === "FAILED"
                ? `Hata: ${activeJob.errorMessage ?? "Bilinmeyen hata"}`
                : "Senkronizasyon devam ediyor..."}
          </span>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  );
}

function StatusNotice({ success, message }: { success: boolean; message: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
      success ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
    }`}>
      {success ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <XCircle className="w-3.5 h-3.5 shrink-0" />}
      {message}
    </div>
  );
}

function OperationsPanel({ integrationId }: { integrationId: string }) {
  const { data: syncJobs } = useSyncJobs({ integrationId, limit: 3 });
  const { data: webhookEvents } = useWebhookEvents({ integrationId, limit: 3 });
  const { data: snapshots } = useListingSnapshots({ integrationId, limit: 3 });
  const retry = useRetrySyncJob();
  const lastJob = syncJobs?.data[0];

  return (
    <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-1 gap-2">
      <MiniMetric
        label="Son Job"
        value={lastJob?.status ?? "Yok"}
        detail={lastJob ? formatDate(lastJob.createdAt) : undefined}
        action={lastJob?.status === "FAILED" ? { label: "Tekrar dene", onClick: () => retry.mutate(lastJob.id) } : undefined}
      />
      <MiniMetric label="Son Webhook" value={webhookEvents?.data[0]?.eventType ?? "Yok"} detail={webhookEvents?.data[0]?.errorMessage ?? undefined} />
      <MiniMetric label="Son Stok/Fiyat" value={snapshots?.data[0]?.batchRequestId ?? "Yok"} detail={snapshots?.data[0] ? formatDate(snapshots.data[0].lastSentAt) : undefined} />
    </div>
  );
}

function MiniMetric({
  label,
  value,
  detail,
  action,
}: {
  label: string;
  value: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="bg-slate-800/30 border border-slate-700/40 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] text-slate-500">{label}</div>
        {action && (
          <button onClick={action.onClick} className="text-[10px] text-sky-400 hover:text-sky-300">
            {action.label}
          </button>
        )}
      </div>
      <div className="text-xs text-slate-200 truncate">{value}</div>
      {detail && <div className="text-[10px] text-slate-500 truncate mt-0.5">{detail}</div>}
    </div>
  );
}

function CredentialsModal({
  integration,
  isOpen,
  onClose,
}: {
  integration: MarketplaceIntegration | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const update = useUpdateIntegration();
  const [form, setForm] = useState<IntegrationForm>(emptyForm);

  useEffect(() => {
    if (!integration) return;
    setForm({
      channel: integration.channel,
      name: integration.name,
      apiKey: "",
      apiSecret: "",
      storeId: integration.storeId ?? "",
    });
  }, [integration]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Kimlik Bilgileri"
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>İptal</Button>
          <Button
            size="sm"
            loading={update.isPending}
            disabled={!integration || !form.name.trim()}
            onClick={() => {
              if (!integration) return;
              update.mutate(
                { id: integration.id, data: buildUpdateDTO(form) },
                { onSuccess: onClose },
              );
            }}
          >
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Entegrasyon Adı" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        <Input label="Satıcı / Mağaza ID" value={form.storeId} onChange={(e) => setForm((p) => ({ ...p, storeId: e.target.value }))} />
        <Input label="API Key" placeholder={integration?.hasApiKey ? "Tanımlı - değiştirmek için yazın" : "API Key"} value={form.apiKey} onChange={(e) => setForm((p) => ({ ...p, apiKey: e.target.value }))} />
        <Input label="API Secret / Webhook x-api-key" type="password" placeholder={integration?.hasApiSecret ? "Tanımlı - değiştirmek için yazın" : "API Secret"} value={form.apiSecret} onChange={(e) => setForm((p) => ({ ...p, apiSecret: e.target.value }))} />
      </div>
    </Modal>
  );
}

function WebhookModal({
  integration,
  isOpen,
  onClose,
}: {
  integration: MarketplaceIntegration | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const webhookUrl = integration ? buildMarketplaceWebhookUrl(integration.id) : "";

  async function copyUrl() {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Webhook Ayarları" size="md">
      <div className="space-y-4">
        <div>
          <div className="text-xs text-slate-500 mb-1">Webhook URL</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 break-all">
              {webhookUrl}
            </code>
            <button onClick={copyUrl} className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Clipboard className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl px-4 py-3 text-xs text-slate-400">
          Trendyol panelinde kimlik doğrulama için <span className="text-slate-200">x-api-key</span> kullanın. Değer olarak bu entegrasyondaki API Secret / webhook anahtarını tanımlayın.
        </div>
      </div>
    </Modal>
  );
}

export function IntegrationsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [credentialTarget, setCredentialTarget] = useState<MarketplaceIntegration | null>(null);
  const [webhookTarget, setWebhookTarget] = useState<MarketplaceIntegration | null>(null);
  const [form, setForm] = useState<IntegrationForm>(emptyForm);

  const { data: integrations = [], isLoading } = useIntegrations();
  const create = useCreateIntegration();
  const update = useUpdateIntegration();
  const remove = useDeleteIntegration();

  return (
    <div>
      <PageHeader
        title="Pazaryeri Entegrasyonları"
        subtitle="E-ticaret kanallarını bağlayın, izleyin ve senkronize edin."
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
          <p className="text-slate-600 text-xs mt-1">Bir pazaryeri kanalı bağlayarak başlayın.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {integrations.map((integration) => {
            const channel = getChannelInfo(integration.channel);
            const health = getIntegrationHealth(integration);

            return (
              <div key={integration.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${channel.color}`}>
                      <Link2 className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-white font-medium text-sm truncate">{integration.name}</h3>
                      <span className="text-xs text-slate-500">{channel.label}</span>
                    </div>
                  </div>
                  <Badge variant={integration.isActive ? "success" : "neutral"}>{integration.isActive ? "Aktif" : "Pasif"}</Badge>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4">
                  <Stat label="Ürün" value={String(integration._count?.listings ?? 0)} />
                  <Stat label="Sipariş" value={String(integration._count?.orders ?? 0)} />
                  <Stat label="Sağlık" value={health.label} />
                </div>

                <Badge variant={HEALTH_VARIANT[health.tone]}>{health.label}</Badge>
                <div className="mt-2 space-y-1">
                  {health.reasons.slice(0, 2).map((reason) => (
                    <div key={reason} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <AlertCircle className="w-3 h-3" />
                      {reason}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800">
                  <span className="text-[10px] text-slate-600">
                    {integration.lastSyncAt ? `Son sync: ${formatDate(integration.lastSyncAt)}` : "Henüz senkronize edilmedi"}
                  </span>
                  <div className="flex items-center gap-1">
                    <IconButton title="Kimlik bilgileri" onClick={() => setCredentialTarget(integration)} icon={<KeyRound className="w-3.5 h-3.5" />} />
                    <IconButton title="Webhook" onClick={() => setWebhookTarget(integration)} icon={<Settings className="w-3.5 h-3.5" />} />
                    <IconButton
                      title={integration.isActive ? "Pasife al" : "Aktife al"}
                      onClick={() => update.mutate({ id: integration.id, data: { isActive: !integration.isActive } })}
                      icon={integration.isActive ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                    />
                    <IconButton title="Sil" danger onClick={() => remove.mutate(integration.id)} icon={<Trash2 className="w-3.5 h-3.5" />} />
                  </div>
                </div>

                {integration.channel === "TRENDYOL" && <TrendyolActions integrationId={integration.id} />}
                <OperationsPanel integrationId={integration.id} />
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni Pazaryeri Entegrasyonu"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
            <Button
              size="sm"
              loading={create.isPending}
              disabled={!form.name.trim()}
              onClick={() =>
                create.mutate(
                  {
                    channel: form.channel,
                    name: form.name,
                    apiKey: toOptional(form.apiKey),
                    apiSecret: toOptional(form.apiSecret),
                    storeId: toOptional(form.storeId),
                  },
                  {
                    onSuccess: () => {
                      setCreateOpen(false);
                      setForm(emptyForm());
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
          <Select label="Kanal" required options={CHANNELS.map((channel) => ({ value: channel.value, label: channel.label }))} value={form.channel} onChange={(e) => setForm((p) => ({ ...p, channel: e.target.value }))} />
          <Input label="Entegrasyon Adı" required placeholder="örn. Trendyol Mağazam" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <Input label="Satıcı / Mağaza ID" value={form.storeId} onChange={(e) => setForm((p) => ({ ...p, storeId: e.target.value }))} />
          <Input label="API Key" value={form.apiKey} onChange={(e) => setForm((p) => ({ ...p, apiKey: e.target.value }))} />
          <Input label="API Secret" type="password" value={form.apiSecret} onChange={(e) => setForm((p) => ({ ...p, apiSecret: e.target.value }))} />
        </div>
      </Modal>

      <CredentialsModal integration={credentialTarget} isOpen={!!credentialTarget} onClose={() => setCredentialTarget(null)} />
      <WebhookModal integration={webhookTarget} isOpen={!!webhookTarget} onClose={() => setWebhookTarget(null)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800/40 rounded-lg px-3 py-2">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="text-sm text-white font-medium truncate">{value}</div>
    </div>
  );
}

function IconButton({
  title,
  icon,
  danger,
  onClick,
}: {
  title: string;
  icon: ReactNode;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-1.5 rounded-lg text-slate-600 transition-colors ${
        danger ? "hover:text-red-400 hover:bg-red-500/10" : "hover:text-sky-400 hover:bg-sky-500/10"
      }`}
      title={title}
      aria-label={title}
    >
      {icon}
    </button>
  );
}
