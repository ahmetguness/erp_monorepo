'use client';

import { useState, useEffect } from 'react';
import { Database, Link2, Copy, Check, RefreshCw, Save, Play, Clock, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { useUIStore } from '@/store/ui.store';
import {
  useBiSettings,
  useUpdateBiSettings,
  useGenerateBiToken,
  useRunBiScheduleSimulation,
} from '@/hooks/useSettings';
import type { BiSettings } from '@/services/settings.service';

const DEFAULT_BI_SETTINGS: BiSettings = {
  enabled: false,
  interval: 'daily',
  entities: 'products,contacts,invoices',
  lastRun: null,
  token: '',
  connectorType: 'rest',
  destinationName: '',
  readReplicaHost: '',
  warehouseProject: '',
  scheduledExportTarget: 'none',
  scheduledExportFormat: 'json',
  status: {
    health: 'disabled',
    connectorLabel: 'REST/OData endpoint',
    nextRun: null,
    configuredConnectors: ['rest'],
    supportedTargets: ['none', 'read_replica', 'bigquery', 'snowflake', 'postgresql', 'sftp'],
  },
};

const CONNECTOR_OPTIONS: Array<{ value: BiSettings['connectorType']; label: string; description: string }> = [
  { value: 'rest', label: 'REST/OData', description: 'Power BI, Tableau ve Qlik icin mevcut JSON endpoint.' },
  { value: 'read_replica', label: 'Read replica', description: 'Analitik sorgulari operasyonel veritabanindan ayiran replica.' },
  { value: 'bigquery', label: 'BigQuery', description: 'Google BigQuery dataset veya scheduled export hedefi.' },
  { value: 'snowflake', label: 'Snowflake', description: 'Snowflake warehouse/schema aktarim hedefi.' },
  { value: 'postgresql', label: 'PostgreSQL', description: 'BI icin ayrilmis PostgreSQL warehouse baglantisi.' },
];

const EXPORT_TARGET_OPTIONS: Array<{ value: BiSettings['scheduledExportTarget']; label: string }> = [
  { value: 'none', label: 'Sadece API connector' },
  { value: 'read_replica', label: 'Read replica' },
  { value: 'bigquery', label: 'BigQuery scheduled export' },
  { value: 'snowflake', label: 'Snowflake scheduled export' },
  { value: 'postgresql', label: 'PostgreSQL scheduled export' },
  { value: 'sftp', label: 'SFTP dosya aktarimi' },
];

const HEALTH_LABELS: Record<BiSettings['status']['health'], string> = {
  disabled: 'Kapalı',
  needs_token: 'Token bekliyor',
  needs_destination: 'Hedef bilgisi eksik',
  ready: 'Hazir',
};

const CONNECTOR_LABELS: Record<BiSettings['connectorType'], string> = {
  rest: 'REST/OData endpoint',
  read_replica: 'Read replica',
  bigquery: 'BigQuery',
  snowflake: 'Snowflake',
  postgresql: 'PostgreSQL',
};

function getPreviewHealth(form: BiSettings): BiSettings['status']['health'] {
  if (!form.enabled) return 'disabled';
  if (!form.token) return 'needs_token';
  if ((form.connectorType === 'read_replica' || form.connectorType === 'postgresql') && !form.readReplicaHost.trim()) {
    return 'needs_destination';
  }
  if ((form.connectorType === 'bigquery' || form.connectorType === 'snowflake') && !form.destinationName.trim() && !form.warehouseProject.trim()) {
    return 'needs_destination';
  }

  return 'ready';
}

export default function BiWarehouseSettingsPage() {
  const { data: settings, isLoading } = useBiSettings();
  const generateBiToken = useGenerateBiToken();
  const runSimulation = useRunBiScheduleSimulation();
  const { toast } = useUIStore();

  const [form, setForm] = useState<BiSettings>(DEFAULT_BI_SETTINGS);

  const [copied, setCopied] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState('invoices');

  useEffect(() => {
    if (settings) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(settings);
    }
  }, [settings]);

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success('Bağlantı adresi panoya kopyalandı.');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateToken = () => {
    if (confirm('Yeni bir BI veri ambarı erişim tokenı oluşturmak istediğinize emin misiniz? Eski token geçersiz kalacaktır.')) {
      generateBiToken.mutate(undefined, {
        onSuccess: (data) => {
          setForm((prev) => ({ ...prev, token: data.token }));
        },
      });
    }
  };

  const handleUpdate = useUpdateBiSettings(); // Using the correct hook from useSettings

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleUpdate.mutate(form);
  };

  const handleRunSimulation = () => {
    runSimulation.mutate(undefined, {
      onSuccess: (data) => {
        setForm((prev) => ({ ...prev, lastRun: data.lastRun }));
      },
    });
  };

  const connectorUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/bi/v1/export/${selectedEntity}?token=${form.token || 'TOKEN'}`
    : `/api/bi/v1/export/${selectedEntity}?token=${form.token || 'TOKEN'}`;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const entitiesList = form.entities.split(',').map((e) => e.trim()).filter(Boolean);
  const previewHealth = getPreviewHealth(form);
  const configuredConnectors = form.connectorType === 'rest' ? ['rest'] : ['rest', form.connectorType];
  const healthClassName = previewHealth === 'ready'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    : previewHealth === 'disabled'
      ? 'border-slate-700 bg-slate-950 text-slate-300'
      : 'border-amber-500/30 bg-amber-500/10 text-amber-200';

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Veri Ambarı & BI Entegrasyonu"
        subtitle="Power BI, Tableau veya Qlik gibi dış BI araçları için planlı veri setlerini ve veri ambarı bağlayıcısını yönetin."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* BI Connection Setup */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
              <Link2 className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Dış BI Araçları Bağlantı Noktası</h3>
              <p className="text-xs text-slate-500">Power BI veya Tableau Web Veri Bağlayıcısı (Web Connector) için JSON veri kaynakları oluşturun.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-medium">BI Erişim Tokenı (Salt-Okunur)</label>
              <div className="flex gap-2">
                <input
                  type={form.token ? 'text' : 'password'}
                  readOnly
                  placeholder="Erişim tokenı oluşturmak için sağdaki butona tıklayın"
                  value={form.token || '••••••••••••••••••••••••••••••••'}
                  className="flex-1 h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-xs font-mono focus:outline-none"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerateToken}
                  loading={generateBiToken.isPending}
                  className="shrink-0"
                >
                  <RefreshCw className="w-4 h-4" />
                  Erişim Tokenı Üret
                </Button>
              </div>
            </div>

            {form.token && (
              <div className="space-y-3 pt-2">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-slate-400 font-medium">Veri Seti Seçin</label>
                    <select
                      value={selectedEntity}
                      onChange={(e) => setSelectedEntity(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:border-sky-500/50 focus:outline-none transition-colors"
                    >
                      <option value="invoices">Faturalar (invoices)</option>
                      <option value="products">Ürünler (products)</option>
                      <option value="contacts">Cariler (contacts)</option>
                      <option value="ledger">Yevmiye Kayıtları (ledger)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">BI Aracı Bağlantı Adresi (OData / REST URL)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={connectorUrl}
                      className="flex-1 h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-300 text-xs font-mono focus:outline-none"
                    />
                    <Button type="button" variant="secondary" size="sm" onClick={() => handleCopyUrl(connectorUrl)} className="px-3 shrink-0">
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Warehouse Connector Targets */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
                <Database className="w-5 h-5 text-violet-300" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-white">Enterprise Veri Ambari Connector</h3>
                <p className="text-xs text-slate-500">Read replica, BigQuery, Snowflake veya PostgreSQL hedefini ve scheduled export politikasini yonetin.</p>
              </div>
            </div>
            <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${healthClassName}`}>
              {HEALTH_LABELS[previewHealth]}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-2">
              <label className="text-xs text-slate-400 font-medium">Connector Tipi</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CONNECTOR_OPTIONS.map((option) => {
                  const active = form.connectorType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, connectorType: option.value }))}
                      className={`text-left rounded-xl border p-3 transition-colors ${
                        active ? 'border-sky-500/60 bg-sky-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                      }`}
                    >
                      <span className="block text-sm font-semibold text-slate-100">{option.label}</span>
                      <span className="mt-1 block text-xs leading-normal text-slate-500">{option.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-850 bg-slate-950/60 p-4">
              <div>
                <span className="block text-xs font-semibold text-slate-200">Aktif connector</span>
                <span className="text-xs text-slate-500">{CONNECTOR_LABELS[form.connectorType]}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-200">Sonraki planli aktarim</span>
                <span className="text-xs text-slate-500">
                  {form.status.nextRun ? new Date(form.status.nextRun).toLocaleString('tr-TR') : 'Planli zaman henuz olusmadi'}
                </span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-200">Hazir connectorlar</span>
                <span className="text-xs text-slate-500">{configuredConnectors.join(', ')}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-medium">Destination / Dataset Adi</label>
              <input
                type="text"
                value={form.destinationName}
                onChange={(e) => setForm((prev) => ({ ...prev, destinationName: e.target.value }))}
                placeholder="orn. erp_enterprise_dw"
                className="w-full h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:border-sky-500/50 focus:outline-none transition-colors"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-medium">Read Replica / PostgreSQL Host</label>
              <input
                type="text"
                value={form.readReplicaHost}
                onChange={(e) => setForm((prev) => ({ ...prev, readReplicaHost: e.target.value }))}
                placeholder="replica.company.internal:5432"
                className="w-full h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:border-sky-500/50 focus:outline-none transition-colors"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-slate-400 font-medium">Warehouse Project / Schema</label>
              <input
                type="text"
                value={form.warehouseProject}
                onChange={(e) => setForm((prev) => ({ ...prev, warehouseProject: e.target.value }))}
                placeholder="project.dataset veya warehouse.schema"
                className="w-full h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:border-sky-500/50 focus:outline-none transition-colors"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-medium">Export Hedefi</label>
                <select
                  value={form.scheduledExportTarget}
                  onChange={(e) => setForm((prev) => ({ ...prev, scheduledExportTarget: e.target.value as BiSettings['scheduledExportTarget'] }))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:border-sky-500/50 focus:outline-none transition-colors"
                >
                  {EXPORT_TARGET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-slate-400 font-medium">Format</label>
                <select
                  value={form.scheduledExportFormat}
                  onChange={(e) => setForm((prev) => ({ ...prev, scheduledExportFormat: e.target.value as BiSettings['scheduledExportFormat'] }))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:border-sky-500/50 focus:outline-none transition-colors"
                >
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="parquet">Parquet</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Scheduled Exports Panel */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Database className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Planlı Veri Setleri (Data Warehouse Sync)</h3>
              <p className="text-xs text-slate-500">Belirlediğiniz aralıklarla veri setlerinizi BI veri ambarı için otomatik hazır bulundurun.</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                className="w-4.5 h-4.5 rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-emerald-500/20"
              />
              <span className="text-sm text-slate-200 font-medium">Planlı Aktarımı Etkinleştir</span>
            </label>

            {form.enabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 pl-7 border-l-2 border-slate-800">
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-medium">Senkronizasyon Sıklığı</label>
                  <select
                    value={form.interval}
                    onChange={(e) => setForm((prev) => ({ ...prev, interval: e.target.value as BiSettings['interval'] }))}
                    className="w-full h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:border-sky-500/50 focus:outline-none transition-colors"
                  >
                    <option value="daily">Her Gün (Gece 02:00)</option>
                    <option value="weekly">Her Hafta (Pazar Gece 03:00)</option>
                    <option value="monthly">Her Ay (1. Gün Gece 04:00)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-medium font-semibold">Aktarılacak Veri Setleri</label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {['products', 'contacts', 'invoices', 'ledger'].map((entity) => {
                      const isChecked = entitiesList.includes(entity);
                      return (
                        <label key={entity} className="flex items-center gap-2 bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-lg text-xs cursor-pointer hover:border-slate-700 transition-colors">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const nextList = e.target.checked
                                ? [...entitiesList, entity]
                                : entitiesList.filter((item) => item !== entity);
                              setForm((prev) => ({ ...prev, entities: nextList.join(',') }));
                            }}
                            className="w-3.5 h-3.5 rounded border-slate-800 bg-slate-900 text-emerald-500 focus:ring-emerald-500/10"
                          />
                          <span className="text-slate-300 capitalize">{entity}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Incremental Sync Panel */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Artımlı (Incremental) Aktarım & Manuel Tetikleme</h3>
              <p className="text-xs text-slate-500">Power BI artımlı yenileme (Incremental Refresh) parametrelerini görün ve test edin.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl space-y-2">
              <div className="flex items-start gap-2.5">
                <ArrowRight className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-400 leading-normal">
                  Dış BI araçları, tüm veri setini baştan yüklemek yerine son güncelleme tarihinden (`updatedAt`) itibaren değişen verileri çekebilir. URL adresine <span className="font-mono text-amber-300">?since=YYYY-MM-DDT00:00:00Z</span> parametresini ekleyerek sadece o tarihten sonraki güncellemeleri çekebilirsiniz.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between bg-slate-950 border border-slate-850 p-4 rounded-xl">
              <div>
                <span className="text-xs font-semibold text-slate-200 block">Son Başarılı Aktarım/Çalıştırma</span>
                <span className="text-xs text-slate-500">
                  {form.lastRun ? new Date(form.lastRun).toLocaleString('tr-TR') : 'Hiç çalıştırılmadı'}
                </span>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleRunSimulation}
                loading={runSimulation.isPending}
              >
                <Play className="w-4 h-4 text-emerald-400" />
                Şimdi Test Çalıştırması Yap
              </Button>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" loading={handleUpdate.isPending}>
            <Save className="w-4 h-4" />
            BI Politikalarını Kaydet
          </Button>
        </div>
      </form>
    </div>
  );
}
