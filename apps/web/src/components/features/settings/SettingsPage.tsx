'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Save, Plus, X, Building2, Layers, Pencil,
  Globe, Calendar, Receipt, DollarSign, Clock,
  Calculator, Package, FileText, ShieldCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ImageUploadBox, type ImageUploadStatus } from '@/components/shared/ImageUploadBox';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import {
  useTenantSettings,
  useUpsertTenantSetting,
  useDeleteTenantSetting,
  useModuleSettings,
  useUpsertModuleSetting,
  useTenantLogo,
  useUploadTenantLogo,
  useDeleteTenantLogo,
  useBusinessRules,
  useUpsertBusinessRule,
} from '@/hooks/useSettings';
import { cn } from '@/lib/utils';
import type { TenantSetting, ModuleSetting, BusinessRule } from '@/services/settings.service';

// ─────────────────────────────────────────────
// Turkish label maps
// ─────────────────────────────────────────────

const TENANT_KEY_META: Record<string, { label: string; description: string; icon: React.ReactNode }> = {
  date_format: { label: 'Tarih Formatı', description: 'Tarih gösterim biçimi', icon: <Calendar className="w-3.5 h-3.5 text-sky-400" /> },
  default_currency: { label: 'Varsayılan Para Birimi', description: 'Sistem genelinde kullanılan para birimi', icon: <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> },
  email_notifications: { label: 'E-posta Bildirimleri', description: 'Sistem bildirimleri e-posta ile gönderilsin', icon: <Globe className="w-3.5 h-3.5 text-sky-400" /> },
  fiscal_year_start: { label: 'Mali Yıl Başlangıcı', description: 'Mali yılın başladığı ay-gün', icon: <Calendar className="w-3.5 h-3.5 text-amber-400" /> },
  invoice_footer: { label: 'Fatura Alt Bilgisi', description: 'Fatura çıktılarında gösterilecek alt metin', icon: <FileText className="w-3.5 h-3.5 text-violet-400" /> },
  invoice_prefix: { label: 'Fatura Ön Eki', description: 'Otomatik fatura numarası ön eki', icon: <Receipt className="w-3.5 h-3.5 text-violet-400" /> },
  language: { label: 'Dil', description: 'Arayüz dili', icon: <Globe className="w-3.5 h-3.5 text-amber-400" /> },
  low_stock_alert: { label: 'Düşük Stok Uyarısı', description: 'Minimum stok altına düşünce uyarı verilsin', icon: <Package className="w-3.5 h-3.5 text-red-400" /> },
  timezone: { label: 'Saat Dilimi', description: 'Tarih/saat hesaplamaları için', icon: <Clock className="w-3.5 h-3.5 text-pink-400" /> },
};

const MODULE_KEY_META: Record<string, { label: string; description: string }> = {
  auto_journal: { label: 'Otomatik Muhasebe Fişi', description: 'İşlemler için muhasebe kayıtları otomatik oluşturulsun' },
  auto_number: { label: 'Otomatik Numara', description: 'Belgeler için numara otomatik oluşturulsun' },
  auto_sync_interval: { label: 'Otomatik Senkron Aralığı', description: 'Pazaryeri senkronizasyon aralığı (dakika)' },
  default_vat_rate: { label: 'Varsayılan KDV Oranı', description: 'Yeni kalem eklerken kullanılacak KDV oranı (%)' },
  default_tax_rate: { label: 'Varsayılan Vergi Oranı', description: 'Faturalarda kullanılacak varsayılan vergi oranı (%)' },
  fiscal_year_start: { label: 'Mali Yıl Başlangıcı', description: 'Mali yılın başladığı ay-gün' },
  costing_method: { label: 'Maliyetlendirme Yöntemi', description: 'Stok maliyeti hesaplama yöntemi' },
  low_stock_alert: { label: 'Düşük Stok Uyarısı', description: 'Minimum stok altına düşünce uyarı' },
  negative_stock: { label: 'Negatif Stok', description: 'Stok eksiye düşebilsin mi' },
  negative_stock_policy: { label: 'Negatif Stok Politikası', description: 'Stok çıkışı eksi bakiyeye düşerse uygulanacak davranış' },
  auto_invoice_number: { label: 'Otomatik Fatura Numarası', description: 'Fatura numarası otomatik oluşturulsun mu' },
  payment_terms: { label: 'Ödeme Vadesi', description: 'Varsayılan ödeme vadesi (gün)' },
  payment_terms_days: { label: 'Ödeme Vadesi (Gün)', description: 'Varsayılan ödeme vadesi' },
  sgk_rate: { label: 'SGK Oranı', description: 'Bordro hesaplamalarında kullanılan SGK oranı (%)' },
  work_hours_per_day: { label: 'Günlük Çalışma Saati', description: 'Mesai ve bordro hesaplamalarında kullanılan günlük saat' },
};

const MODULE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  accounting: { label: 'Muhasebe', icon: <Calculator className="w-3.5 h-3.5 text-emerald-400" /> },
  hr: { label: 'İnsan Kaynakları', icon: <Building2 className="w-3.5 h-3.5 text-pink-400" /> },
  inventory: { label: 'Envanter', icon: <Package className="w-3.5 h-3.5 text-sky-400" /> },
  invoicing: { label: 'Faturalama', icon: <FileText className="w-3.5 h-3.5 text-violet-400" /> },
  marketplace: { label: 'Pazaryeri', icon: <Globe className="w-3.5 h-3.5 text-amber-400" /> },
  payroll: { label: 'Bordro', icon: <Receipt className="w-3.5 h-3.5 text-emerald-400" /> },
};

const LOGO_SETTING_KEYS = new Set(['company_logo', 'tenant_logo_storage_path']);
const NEGATIVE_STOCK_POLICY_KEY = 'negative_stock_policy';
const NEGATIVE_STOCK_POLICY_OPTIONS = [
  { value: 'BLOCK', label: 'Engelle', description: 'Stok çıkışı eksi bakiyeye düşüyorsa işlem durdurulur.' },
  { value: 'WARN', label: 'Uyar, izin ver', description: 'İşlem kaydedilir, fakat kullanıcıya stok uyarısı döner.' },
  { value: 'ALLOW', label: 'İzin ver', description: 'Eski davranış korunur; eksi stok hareketine izin verilir.' },
] as const;

function humanizeKey(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase('tr-TR') + part.slice(1))
    .join(' ');
}

function getModuleLabel(module: string): string {
  return MODULE_LABELS[module]?.label ?? humanizeKey(module);
}

function getValueDisplay(key: string, value: string): string {
  if (value === 'true') return 'Açık';
  if (value === 'false') return 'Kapalı';
  if (key === NEGATIVE_STOCK_POLICY_KEY) {
    return NEGATIVE_STOCK_POLICY_OPTIONS.find((option) => option.value === value)?.label ?? value;
  }
  if (key === 'costing_method') {
    const map: Record<string, string> = { MOVING_AVERAGE: 'Hareketli Ortalama', FIFO: 'İlk Giren İlk Çıkar', LIFO: 'Son Giren İlk Çıkar', STANDARD: 'Standart Maliyet' };
    return map[value] ?? value;
  }
  if (key === 'fiscal_year_start') {
    const map: Record<string, string> = { '01-01': '1 Ocak', '04-01': '1 Nisan', '07-01': '1 Temmuz', '10-01': '1 Ekim' };
    return map[value] ?? value;
  }
  if (key === 'auto_sync_interval') return `${value} dakika`;
  if (key === 'default_tax_rate' || key === 'default_vat_rate' || key === 'sgk_rate') return `%${value}`;
  if (key === 'payment_terms' || key === 'payment_terms_days') return value === '0' ? 'Peşin' : `${value} Gün`;
  if (key === 'work_hours_per_day') return `${value} saat`;
  if (key === 'language') return value === 'tr' ? 'Türkçe' : value === 'en' ? 'İngilizce' : value;
  if (key === 'timezone') return value.replace('_', ' ').replace('/', ' / ');
  if (key === 'date_format') {
    const map: Record<string, string> = { 'DD.MM.YYYY': '31.12.2026', 'DD/MM/YYYY': '31/12/2026', 'YYYY-MM-DD': '2026-12-31', 'MM/DD/YYYY': '12/31/2026' };
    return map[value] ?? value;
  }
  return value;
}

function getBusinessRuleValueDisplay(rule: BusinessRule): string {
  if (Array.isArray(rule.value)) return rule.value.length > 0 ? rule.value.join(', ') : 'Boş';
  if (rule.type === 'number') {
    if (rule.key.includes('days')) return `${rule.value} gün`;
    if (rule.key.includes('hours')) return `${rule.value} saat`;
    if (rule.key.includes('limit')) return `${rule.value} TL`;
  }
  return String(rule.value || 'Boş');
}

function getBusinessRuleEditValue(rule: BusinessRule): string {
  return Array.isArray(rule.value) ? rule.value.join(', ') : String(rule.value);
}

function parseBusinessRuleEditValue(rule: BusinessRule, value: string): BusinessRule['value'] {
  if (rule.type === 'number') return Number(value);
  if (rule.type === 'string_list') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return value;
}

function getPlanLabel(plan: BusinessRule['minPlan']): string {
  if (plan === 'STARTER') return 'Starter';
  if (plan === 'PROFESSIONAL') return 'Pro';
  return 'Enterprise';
}

// Options for select-based editing
const KEY_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  date_format: [
    { value: 'DD.MM.YYYY', label: 'GG.AA.YYYY (31.12.2026)' },
    { value: 'DD/MM/YYYY', label: 'GG/AA/YYYY (31/12/2026)' },
    { value: 'YYYY-MM-DD', label: 'YYYY-AA-GG (2026-12-31)' },
    { value: 'MM/DD/YYYY', label: 'AA/GG/YYYY (12/31/2026)' },
  ],
  default_currency: [
    { value: 'TRY', label: '₺ Türk Lirası (TRY)' },
    { value: 'USD', label: '$ ABD Doları (USD)' },
    { value: 'EUR', label: '€ Euro (EUR)' },
    { value: 'GBP', label: '£ İngiliz Sterlini (GBP)' },
  ],
  language: [
    { value: 'tr', label: '🇹🇷 Türkçe' },
    { value: 'en', label: '🇬🇧 İngilizce' },
  ],
  timezone: [
    { value: 'Europe/Istanbul', label: 'İstanbul (UTC+3)' },
    { value: 'Europe/London', label: 'Londra (UTC+0)' },
    { value: 'America/New_York', label: 'New York (UTC-5)' },
    { value: 'Asia/Dubai', label: 'Dubai (UTC+4)' },
    { value: 'Europe/Berlin', label: 'Berlin (UTC+1)' },
  ],
  costing_method: [
    { value: 'MOVING_AVERAGE', label: 'Hareketli Ortalama' },
    { value: 'FIFO', label: 'İlk Giren İlk Çıkar (FIFO)' },
    { value: 'LIFO', label: 'Son Giren İlk Çıkar (LIFO)' },
    { value: 'STANDARD', label: 'Standart Maliyet' },
  ],
  default_vat_rate: [
    { value: '0', label: '%0 (KDV Yok)' },
    { value: '1', label: '%1' },
    { value: '10', label: '%10' },
    { value: '20', label: '%20' },
  ],
  low_stock_alert: [
    { value: 'true', label: 'Açık' },
    { value: 'false', label: 'Kapalı' },
  ],
  email_notifications: [
    { value: 'true', label: 'Açık' },
    { value: 'false', label: 'Kapalı' },
  ],
  auto_journal: [
    { value: 'true', label: 'Açık' },
    { value: 'false', label: 'Kapalı' },
  ],
  auto_number: [
    { value: 'true', label: 'Açık' },
    { value: 'false', label: 'Kapalı' },
  ],
  auto_invoice_number: [
    { value: 'true', label: 'Açık' },
    { value: 'false', label: 'Kapalı' },
  ],
  negative_stock: [
    { value: 'true', label: 'Açık' },
    { value: 'false', label: 'Kapalı' },
  ],
  negative_stock_policy: NEGATIVE_STOCK_POLICY_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  })),
  fiscal_year_start: [
    { value: '01-01', label: '1 Ocak' },
    { value: '04-01', label: '1 Nisan' },
    { value: '07-01', label: '1 Temmuz' },
    { value: '10-01', label: '1 Ekim' },
  ],
  payment_terms_days: [
    { value: '0', label: 'Peşin' },
    { value: '7', label: '7 Gün' },
    { value: '15', label: '15 Gün' },
    { value: '30', label: '30 Gün' },
    { value: '45', label: '45 Gün' },
    { value: '60', label: '60 Gün' },
    { value: '90', label: '90 Gün' },
  ],
  payment_terms: [
    { value: '0', label: 'Peşin' },
    { value: '7', label: '7 Gün' },
    { value: '15', label: '15 Gün' },
    { value: '30', label: '30 Gün' },
    { value: '45', label: '45 Gün' },
    { value: '60', label: '60 Gün' },
    { value: '90', label: '90 Gün' },
  ],
  default_tax_rate: [
    { value: '0', label: '%0 (KDV Yok)' },
    { value: '1', label: '%1' },
    { value: '10', label: '%10' },
    { value: '20', label: '%20' },
  ],
  auto_sync_interval: [
    { value: '15', label: '15 dakika' },
    { value: '30', label: '30 dakika' },
    { value: '60', label: '60 dakika' },
    { value: '120', label: '120 dakika' },
  ],
};

function hasOptions(key: string): boolean {
  return key in KEY_OPTIONS;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function SettingsPage() {
  const { data: tenantSettings = [], isLoading: loadingTenant } = useTenantSettings();
  const { data: moduleSettings = [], isLoading: loadingModule } = useModuleSettings();
  const { data: businessRules = [], isLoading: loadingBusinessRules } = useBusinessRules();
  const { data: logoBlob } = useTenantLogo();
  const upsertTenant = useUpsertTenantSetting();
  const deleteTenant = useDeleteTenantSetting();
  const upsertModule = useUpsertModuleSetting();
  const uploadLogo = useUploadTenantLogo();
  const deleteLogo = useDeleteTenantLogo();
  const upsertBusinessRule = useUpsertBusinessRule();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [logoStatus, setLogoStatus] = useState<ImageUploadStatus>('idle');

  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<'tenant' | 'module'>('tenant');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newModule, setNewModule] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleSaveTenant = (key: string, value: string) => {
    upsertTenant.mutate({ key, value }, { onSuccess: () => setEditingId(null) });
  };

  const handleSaveModule = (module: string, key: string, value: string) => {
    upsertModule.mutate({ module, key, value }, { onSuccess: () => setEditingId(null) });
  };

  const handleSaveBusinessRule = (rule: BusinessRule, value: string) => {
    upsertBusinessRule.mutate(
      { key: rule.key, value: parseBusinessRuleEditValue(rule, value) },
      { onSuccess: () => setEditingId(null) },
    );
  };

  const handleAdd = () => {
    if (addType === 'tenant') {
      upsertTenant.mutate({ key: newKey, value: newValue }, { onSuccess: () => { setAddOpen(false); setNewKey(''); setNewValue(''); } });
    } else {
      upsertModule.mutate({ module: newModule, key: newKey, value: newValue }, { onSuccess: () => { setAddOpen(false); setNewKey(''); setNewValue(''); setNewModule(''); } });
    }
  };

  useEffect(() => {
    const logoSource = logoFile ?? logoBlob;
    if (!logoSource) {
      setLogoPreviewUrl(null);
      return undefined;
    }

    const objectUrl = URL.createObjectURL(logoSource);
    setLogoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [logoBlob, logoFile]);

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (file) {
      setLogoFile(file);
      setLogoStatus('uploading');
      uploadLogo.mutate(file, {
        onSuccess: () => {
          setLogoFile(null);
          setLogoStatus('uploaded');
        },
        onError: () => setLogoStatus('error'),
      });
    }
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const removeLogo = () => {
    setLogoStatus('removing');
    deleteLogo.mutate(undefined, {
      onSuccess: () => {
        setLogoFile(null);
        setLogoStatus('idle');
      },
      onError: () => setLogoStatus('error'),
    });
  };

  const moduleGroups = moduleSettings.reduce<Record<string, ModuleSetting[]>>((acc, s) => {
    if (s.module === 'inventory' && s.key === NEGATIVE_STOCK_POLICY_KEY) return acc;
    (acc[s.module] ??= []).push(s);
    return acc;
  }, {});
  const visibleTenantSettings = tenantSettings.filter((setting) => !LOGO_SETTING_KEYS.has(setting.key));
  const negativeStockPolicy = moduleSettings.find(
    (setting) => setting.module === 'inventory' && setting.key === NEGATIVE_STOCK_POLICY_KEY,
  )?.value ?? 'ALLOW';

  return (
    <div className="space-y-5">
      <PageHeader title="Genel Ayarlar" subtitle="Sistem ve modül yapılandırmasını yönetin."
        action={
          <button onClick={() => setAddOpen(true)}
            className="group inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 transition-all duration-200 active:scale-[0.97]">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15"><Plus className="w-3.5 h-3.5" /></span>
            Yeni Ayar
          </button>
        }
      />

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <ImageUploadBox
          label="Şirket logosu"
          description="Logo sidebar ve tenant görünümlerinde kullanılır."
          previewUrl={logoPreviewUrl}
          fileName={logoFile?.name ?? null}
          status={logoStatus}
          hasImage={!!logoFile || !!logoBlob}
          disabled={uploadLogo.isPending || deleteLogo.isPending}
          maxSizeLabel="JPG, PNG veya WebP, en fazla 2MB"
          onSelect={() => logoInputRef.current?.click()}
          onRemove={logoBlob ? removeLogo : undefined}
        />
        <input
          ref={logoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleLogoChange}
        />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-800/60">
          <div className="p-2 rounded-lg bg-sky-500/10"><Package className="w-4 h-4 text-sky-400" /></div>
          <div>
            <h2 className="text-sm font-semibold text-white">Stok Politikası</h2>
            <p className="text-xs text-slate-500">Eksi stok oluştuğunda uygulanacak envanter davranışı</p>
          </div>
          <span className="ml-auto text-xs font-medium text-sky-300 bg-sky-500/10 px-2.5 py-1 rounded-lg">
            {getValueDisplay(NEGATIVE_STOCK_POLICY_KEY, negativeStockPolicy)}
          </span>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-3">
          {NEGATIVE_STOCK_POLICY_OPTIONS.map((option) => {
            const selected = option.value === negativeStockPolicy;

            return (
              <button
                key={option.value}
                type="button"
                disabled={upsertModule.isPending}
                onClick={() => upsertModule.mutate({
                  module: 'inventory',
                  key: NEGATIVE_STOCK_POLICY_KEY,
                  value: option.value,
                })}
                className={cn(
                  'min-h-24 rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                  selected
                    ? 'border-sky-500/50 bg-sky-500/10 text-white'
                    : 'border-slate-800 bg-slate-950/30 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40',
                )}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="mt-2 block text-xs leading-5 text-slate-500">{option.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-800/60">
          <div className="p-2 rounded-lg bg-emerald-500/10"><ShieldCheck className="w-4 h-4 text-emerald-400" /></div>
          <div>
            <h2 className="text-sm font-semibold text-white">İş Kuralları</h2>
            <p className="text-xs text-slate-500">Form varsayılanları, otomasyonlar ve paket bazlı ERP davranışları</p>
          </div>
          <span className="ml-auto text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">{businessRules.length}</span>
        </div>
        {loadingBusinessRules ? (
          <div className="py-8 text-center text-sm text-slate-600">İş kuralları yükleniyor…</div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {businessRules.map((rule) => {
              const editKey = `business-rule:${rule.key}`;
              const isEditing = editingId === editKey;
              const disabled = !rule.isAvailable || upsertBusinessRule.isPending;

              return (
                <div key={rule.key} className={cn('px-5 py-4 transition-colors group hover:bg-slate-800/20', !rule.isAvailable && 'opacity-60')}>
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-slate-200">{rule.label}</p>
                        <span className="text-[10px] font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">{getModuleLabel(rule.module)}</span>
                        <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', rule.isAvailable ? 'text-emerald-300 bg-emerald-500/10' : 'text-amber-300 bg-amber-500/10')}>
                          {getPlanLabel(rule.minPlan)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{rule.description}</p>
                      <p className="mt-1 text-[10px] text-slate-600">Kullanım: {rule.consumingModules.join(', ')}</p>
                    </div>

                    {isEditing ? (
                      <div className="flex items-start gap-2 shrink-0">
                        {rule.type === 'string' ? (
                          <textarea value={editValue} onChange={(e) => setEditValue(e.target.value)}
                            className="w-80 min-h-20 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                        ) : (
                          <input type={rule.type === 'number' ? 'number' : 'text'} value={editValue} min={rule.validation.min} max={rule.validation.max}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-64 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500" autoFocus />
                        )}
                        <button disabled={disabled} onClick={() => handleSaveBusinessRule(rule, editValue)} className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"><Save className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-800 transition-colors"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="max-w-72 truncate text-sm font-medium text-white bg-slate-800 px-3 py-1 rounded-lg">{getBusinessRuleValueDisplay(rule)}</span>
                        <button disabled={disabled} onClick={() => { setEditingId(editKey); setEditValue(getBusinessRuleEditValue(rule)); }}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-emerald-400 hover:bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-all disabled:cursor-not-allowed disabled:opacity-30">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Tenant Settings ─────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-800/60">
          <div className="p-2 rounded-lg bg-sky-500/10"><Building2 className="w-4 h-4 text-sky-400" /></div>
          <div>
            <h2 className="text-sm font-semibold text-white">Sistem Ayarları</h2>
            <p className="text-xs text-slate-500">Genel sistem yapılandırması</p>
          </div>
        </div>
        {loadingTenant ? (
          <div className="py-8 text-center text-sm text-slate-600">Yükleniyor…</div>
        ) : visibleTenantSettings.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-600">Henüz ayar eklenmemiş.</div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {visibleTenantSettings.map((s) => {
              const meta = TENANT_KEY_META[s.key];
              const isEditing = editingId === s.id;

              return (
                <div key={s.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-800/20 transition-colors group">
                  {/* Icon */}
                  <div className="p-2 rounded-lg bg-slate-800 shrink-0">
                    {meta?.icon ?? <Building2 className="w-3.5 h-3.5 text-slate-500" />}
                  </div>

                  {/* Label + description */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-200">{meta?.label ?? humanizeKey(s.key)}</p>
                    {meta?.description && <p className="text-[10px] text-slate-500 mt-0.5">{meta.description}</p>}
                  </div>

                  {/* Value / edit */}
                  {isEditing ? (
                    <div className="flex items-center gap-2 shrink-0">
                      {hasOptions(s.key) ? (
                        <select value={editValue} onChange={(e) => setEditValue(e.target.value)}
                          className="w-56 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500">
                          {KEY_OPTIONS[s.key].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (
                        <input value={editValue} onChange={(e) => setEditValue(e.target.value)}
                          className="w-48 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-500" autoFocus />
                      )}
                      <button onClick={() => handleSaveTenant(s.key, editValue)} className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors"><Save className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-800 transition-colors"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-medium text-white bg-slate-800 px-3 py-1 rounded-lg">{getValueDisplay(s.key, s.value)}</span>
                      <button onClick={() => { setEditingId(s.id); setEditValue(s.value); }}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-sky-400 hover:bg-sky-500/10 opacity-0 group-hover:opacity-100 transition-all"><Pencil className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Module Settings ─────────────────────── */}
      {Object.entries(moduleGroups).map(([mod, items]) => {
        const modMeta = MODULE_LABELS[mod];
        return (
          <div key={mod} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-800/60">
              <div className="p-2 rounded-lg bg-violet-500/10">
                {modMeta?.icon ?? <Layers className="w-4 h-4 text-violet-400" />}
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">{getModuleLabel(mod)}</h2>
                <p className="text-xs text-slate-500">Modül ayarları</p>
              </div>
              <span className="ml-auto text-[10px] font-medium text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">{items.length}</span>
            </div>
            <div className="divide-y divide-slate-800/40">
              {items.map((s) => {
                const meta = MODULE_KEY_META[s.key];
                const isEditing = editingId === s.id;

                return (
                  <div key={s.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-800/20 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200">{meta?.label ?? humanizeKey(s.key)}</p>
                      {meta?.description && <p className="text-[10px] text-slate-500 mt-0.5">{meta.description}</p>}
                    </div>

                    {isEditing ? (
                      <div className="flex items-center gap-2 shrink-0">
                        {hasOptions(s.key) ? (
                          <select value={editValue} onChange={(e) => setEditValue(e.target.value)}
                            className="w-56 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500">
                            {KEY_OPTIONS[s.key].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        ) : (
                          <input value={editValue} onChange={(e) => setEditValue(e.target.value)}
                            className="w-48 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500" autoFocus />
                        )}
                        <button onClick={() => handleSaveModule(s.module, s.key, editValue)} className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors"><Save className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-800 transition-colors"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        {(s.value === 'true' || s.value === 'false') ? (
                          <span className={cn(
                            'text-xs font-medium px-2.5 py-1 rounded-lg',
                            s.value === 'true' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500',
                          )}>{s.value === 'true' ? 'Açık' : 'Kapalı'}</span>
                        ) : (
                          <span className="text-sm font-medium text-white bg-slate-800 px-3 py-1 rounded-lg">{getValueDisplay(s.key, s.value)}</span>
                        )}
                        <button onClick={() => { setEditingId(s.id); setEditValue(s.value); }}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-violet-400 hover:bg-violet-500/10 opacity-0 group-hover:opacity-100 transition-all"><Pencil className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {loadingModule && Object.keys(moduleGroups).length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-sm text-slate-600">Modül ayarları yükleniyor…</div>
      )}

      {/* ── Add setting modal ───────────────────── */}
      <Modal isOpen={addOpen} onClose={() => setAddOpen(false)} title="Yeni Ayar Ekle" description="Sistem veya modül ayarı ekleyin." size="sm"
        footer={<>
          <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>İptal</Button>
          <Button size="sm" leftIcon={<Save className="w-3.5 h-3.5" />} onClick={handleAdd} disabled={!newKey || !newValue}
            className="bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20">Kaydet</Button>
        </>}>
        <div className="space-y-4">
          <div className="flex gap-2">
            {(['tenant', 'module'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setAddType(t)}
                className={cn('flex-1 py-2 rounded-lg text-xs font-medium border transition-all',
                  addType === t ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-slate-800 text-slate-500 border-slate-700')}>
                {t === 'tenant' ? 'Sistem Ayarı' : 'Modül Ayarı'}
              </button>
            ))}
          </div>
          {addType === 'module' && (
            <Select label="Modül" options={[
              { value: '', label: '— Modül seçin —' },
              { value: 'accounting', label: 'Muhasebe' },
              { value: 'inventory', label: 'Envanter' },
              { value: 'invoicing', label: 'Faturalama' },
              { value: 'reporting', label: 'Raporlama' },
            ]} value={newModule} onChange={(e) => setNewModule(e.target.value)} />
          )}
          <Input label="Anahtar" placeholder="ornek_ayar" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          <Input label="Değer" placeholder="değer" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}
