"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  Clipboard,
  KeyRound,
  Link2,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
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
  useMarketplaceHealthCenter,
  useReplayWebhookEvent,
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

type StatusFilter = "ALL" | "ACTIVE" | "PASSIVE";
type HealthFilter = "ALL" | "success" | "warning" | "danger";

function emptyForm(): IntegrationForm {
  return { channel: "TRENDYOL", name: "", apiKey: "", apiSecret: "", storeId: "" };
}

function formFromIntegration(integration: MarketplaceIntegration): IntegrationForm {
  return {
    channel: integration.channel,
    name: integration.name,
    apiKey: "",
    apiSecret: "",
    storeId: integration.storeId ?? "",
  };
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

function isCredentialComplete(integration: MarketplaceIntegration): boolean {
  return Boolean(integration.hasApiKey && integration.hasApiSecret && integration.storeId);
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
  const replayWebhook = useReplayWebhookEvent();
  const lastJob = syncJobs?.data[0];
  const replayableWebhook = webhookEvents?.data.find((event) => event.errorMessage || !event.processedAt);

  return (
    <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-1 gap-2">
      <MiniMetric
        label="Son Job"
        value={lastJob?.status ?? "Yok"}
        detail={lastJob ? formatDate(lastJob.createdAt) : undefined}
        action={lastJob?.status === "FAILED" ? { label: "Tekrar dene", onClick: () => retry.mutate(lastJob.id) } : undefined}
      />
      <MiniMetric
        label="Son Webhook"
        value={webhookEvents?.data[0]?.eventType ?? "Yok"}
        detail={webhookEvents?.data[0]?.errorMessage ?? undefined}
        action={replayableWebhook ? { label: "Replay", onClick: () => replayWebhook.mutate(replayableWebhook.id) } : undefined}
      />
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

function SummaryTile({
  icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "text-sky-300 bg-sky-500/10 border-sky-500/20",
    success: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    warning: "text-amber-300 bg-amber-500/10 border-amber-500/20",
    danger: "text-red-300 bg-red-500/10 border-red-500/20",
  }[tone];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium text-slate-500">{label}</div>
          <div className="text-xl font-semibold text-white tabular-nums mt-1">{value}</div>
        </div>
        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${toneClass}`}>
          {icon}
        </div>
      </div>
      <div className="text-[11px] text-slate-500 mt-2 truncate">{detail}</div>
    </div>
  );
}

function IntegrationHealthCenter() {
  const { data, isLoading } = useMarketplaceHealthCenter();
  const totals = data?.totals;
  const topRiskItems = data?.items
    .filter((item) => item.failedJobCount > 0 || item.webhookReplayCount > 0 || item.runningJobCount > 0 || item.pendingJobCount > 0)
    .slice(0, 4) ?? [];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Integration Health Center</h2>
          <p className="text-xs text-slate-500 mt-1">Sync job, webhook replay ve API limit durumunu tek yerden izleyin.</p>
        </div>
        {isLoading && <RefreshCw className="w-4 h-4 text-slate-500 animate-spin" />}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
        <HealthMetric label="Entegrasyon" value={totals?.integrations ?? 0} />
        <HealthMetric label="Bekleyen Job" value={totals?.pendingJobs ?? 0} tone={(totals?.pendingJobs ?? 0) > 0 ? "warning" : "neutral"} />
        <HealthMetric label="Calisan Job" value={totals?.runningJobs ?? 0} tone={(totals?.runningJobs ?? 0) > 0 ? "success" : "neutral"} />
        <HealthMetric label="Failed Job" value={totals?.failedJobs ?? 0} tone={(totals?.failedJobs ?? 0) > 0 ? "danger" : "neutral"} />
        <HealthMetric label="Retry" value={totals?.retryAvailable ?? 0} tone={(totals?.retryAvailable ?? 0) > 0 ? "warning" : "neutral"} />
        <HealthMetric label="Webhook Replay" value={totals?.webhookReplayAvailable ?? 0} tone={(totals?.webhookReplayAvailable ?? 0) > 0 ? "danger" : "neutral"} />
      </div>

      {topRiskItems.length > 0 && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
          {topRiskItems.map((item) => (
            <div key={item.integration.id} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-medium text-slate-200 truncate">{item.integration.name}</div>
                <Badge variant={item.failedJobCount > 0 || item.webhookFailureCount > 0 ? "danger" : "warning"}>
                  %{item.errorRate}
                </Badge>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-slate-500">
                <span>Job: {item.pendingJobCount + item.runningJobCount}</span>
                <span>Fail: {item.failedJobCount}</span>
                <span>Replay: {item.webhookReplayCount}</span>
              </div>
              <div className="mt-2 text-[10px] text-slate-500 truncate">
                {item.lastErrorMessage ?? (item.lastSuccessfulSyncAt ? `Son basarili sync: ${formatDate(item.lastSuccessfulSyncAt)}` : "Basarili sync yok")}
              </div>
              <div className="mt-1 text-[10px] text-slate-600">
                API limit: {item.apiLimit.remaining ?? item.apiLimit.status}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HealthMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "text-slate-200",
    success: "text-emerald-300",
    warning: "text-amber-300",
    danger: "text-red-300",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
      <div className="text-[10px] text-slate-500 truncate">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
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
  const [form, setForm] = useState<IntegrationForm>(() =>
    integration ? formFromIntegration(integration) : emptyForm(),
  );

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
  const [deleteTarget, setDeleteTarget] = useState<MarketplaceIntegration | null>(null);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("ALL");
  const [form, setForm] = useState<IntegrationForm>(emptyForm);

  const { data: integrations = [], isLoading } = useIntegrations();
  const create = useCreateIntegration();
  const update = useUpdateIntegration();
  const remove = useDeleteIntegration();

  const summary = useMemo(() => {
    const active = integrations.filter((integration) => integration.isActive).length;
    const healthy = integrations.filter((integration) => getIntegrationHealth(integration).tone === "success").length;
    const syncErrors = integrations.reduce((total, integration) => total + integration.syncErrors, 0);
    const listings = integrations.reduce((total, integration) => total + (integration._count?.listings ?? 0), 0);
    const orders = integrations.reduce((total, integration) => total + (integration._count?.orders ?? 0), 0);

    return { active, healthy, syncErrors, listings, orders };
  }, [integrations]);

  const filteredIntegrations = useMemo(() => {
    const query = search.trim().toLowerCase();

    return integrations.filter((integration) => {
      const channel = getChannelInfo(integration.channel);
      const health = getIntegrationHealth(integration);
      const matchesSearch =
        query.length === 0 ||
        integration.name.toLowerCase().includes(query) ||
        channel.label.toLowerCase().includes(query) ||
        (integration.storeId ?? "").toLowerCase().includes(query);
      const matchesChannel = channelFilter === "ALL" || integration.channel === channelFilter;
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" ? integration.isActive : !integration.isActive);
      const matchesHealth = healthFilter === "ALL" || health.tone === healthFilter;

      return matchesSearch && matchesChannel && matchesStatus && matchesHealth;
    });
  }, [channelFilter, healthFilter, integrations, search, statusFilter]);

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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
        <SummaryTile icon={<Link2 className="w-4 h-4" />} label="Toplam" value={String(integrations.length)} detail={`${summary.active} aktif entegrasyon`} />
        <SummaryTile icon={<ShieldCheck className="w-4 h-4" />} label="Saglikli" value={String(summary.healthy)} detail="Eksiksiz ve hatasiz kanal" tone="success" />
        <SummaryTile icon={<AlertCircle className="w-4 h-4" />} label="Sync Hatasi" value={String(summary.syncErrors)} detail="Mudahale bekleyen hata" tone={summary.syncErrors > 0 ? "danger" : "neutral"} />
        <SummaryTile icon={<Package className="w-4 h-4" />} label="Listeleme" value={String(summary.listings)} detail="Pazaryerine bagli urun" tone="warning" />
        <SummaryTile icon={<ShoppingCart className="w-4 h-4" />} label="Siparis" value={String(summary.orders)} detail="Senkronize edilen siparis" />
      </div>

      <IntegrationHealthCenter />

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_180px_150px_150px] gap-3">
          <Input
            placeholder="Entegrasyon, kanal veya magaza ID ara"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            prefixIcon={<Search className="w-4 h-4" />}
          />
          <Select
            options={[
              { value: "ALL", label: "Tüm Kanallar" },
              ...CHANNELS.map((channel) => ({ value: channel.value, label: channel.label })),
            ]}
            value={channelFilter}
            onChange={(event) => setChannelFilter(event.target.value)}
          />
          <Select
            options={[
              { value: "ALL", label: "Tüm Durumlar" },
              { value: "ACTIVE", label: "Aktif" },
              { value: "PASSIVE", label: "Pasif" },
            ]}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          />
          <Select
            options={[
              { value: "ALL", label: "Sağlık Durumu" },
              { value: "success", label: "Sağlıklı" },
              { value: "warning", label: "Uyarı" },
              { value: "danger", label: "Hatalı" },
            ]}
            value={healthFilter}
            onChange={(event) => setHealthFilter(event.target.value as HealthFilter)}
          />
        </div>
      </div>

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
      ) : filteredIntegrations.length === 0 ? (
        <div className="text-center py-16 bg-slate-900 border border-slate-800 rounded-xl">
          <Search className="w-9 h-9 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-300 text-sm font-medium">Filtrelerle eslesen entegrasyon yok.</p>
          <p className="text-slate-600 text-xs mt-1">Arama veya filtreleri temizleyip tekrar deneyin.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setSearch("");
              setChannelFilter("ALL");
              setStatusFilter("ALL");
              setHealthFilter("ALL");
            }}
          >
            Filtreleri Temizle
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredIntegrations.map((integration) => {
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
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 rounded-lg bg-slate-800/30 border border-slate-700/40 px-3 py-2">
                    <KeyRound className={`w-3.5 h-3.5 ${isCredentialComplete(integration) ? "text-emerald-400" : "text-amber-400"}`} />
                    <div className="min-w-0">
                      <div className="text-[10px] text-slate-500">Kimlik</div>
                      <div className="text-xs text-slate-200 truncate">{isCredentialComplete(integration) ? "Hazir" : "Eksik"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-lg bg-slate-800/30 border border-slate-700/40 px-3 py-2">
                    <Clock3 className="w-3.5 h-3.5 text-sky-400" />
                    <div className="min-w-0">
                      <div className="text-[10px] text-slate-500">Son Sync</div>
                      <div className="text-xs text-slate-200 truncate">{integration.lastSyncAt ? formatDate(integration.lastSyncAt) : "Yok"}</div>
                    </div>
                  </div>
                </div>
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
                    <IconButton title="Sil" danger onClick={() => setDeleteTarget(integration)} icon={<Trash2 className="w-3.5 h-3.5" />} />
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

      <CredentialsModal
        key={credentialTarget?.id ?? "credentials-modal-empty"}
        integration={credentialTarget}
        isOpen={!!credentialTarget}
        onClose={() => setCredentialTarget(null)}
      />
      <WebhookModal integration={webhookTarget} isOpen={!!webhookTarget} onClose={() => setWebhookTarget(null)} />
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Entegrasyonu Sil"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>Vazgec</Button>
            <Button
              variant="danger"
              size="sm"
              loading={remove.isPending}
              disabled={!deleteTarget}
              onClick={() => {
                if (!deleteTarget) return;
                remove.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
              }}
            >
              Sil
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-3">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-slate-200">{deleteTarget?.name} entegrasyonu silinecek.</p>
              <p className="text-xs text-slate-500 mt-1">Bagli listeleme, siparis ve sync gecmisi etkilenebilir. Bu islem geri alinamaz.</p>
            </div>
          </div>
        </div>
      </Modal>
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
