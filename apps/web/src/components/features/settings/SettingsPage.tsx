'use client';

import { useState } from 'react';
import {
  Save, Plus, Trash2, X, Building2, Layers, Pencil,
  Globe, Calendar, Receipt, DollarSign, Clock,
  Calculator, Package, AlertTriangle, FileText, CreditCard,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { useTenantSettings, useUpsertTenantSetting, useDeleteTenantSetting, useModuleSettings, useUpsertModuleSetting } from '@/hooks/useSettings';
import { cn } from '@/lib/utils';
import type { TenantSetting, ModuleSetting } from '@/services/settings.service';

// ─────────────────────────────────────────────
// Turkish label maps
// ─────────────────────────────────────────────

const TENANT_KEY_META: Record<string, { label: string; description: string; icon: React.ReactNode }> = {
  date_format: { label: 'Tarih Formatı', description: 'Tarih gösterim biçimi', icon: <Calendar className="w-3.5 h-3.5 text-sky-400" /> },
  default_currency: { label: 'Varsayılan Para Birimi', description: 'Sistem genelinde kullanılan para birimi', icon: <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> },
  invoice_prefix: { label: 'Fatura Ön Eki', description: 'Otomatik fatura numarası ön eki', icon: <Receipt className="w-3.5 h-3.5 text-violet-400" /> },
  language: { label: 'Dil', description: 'Arayüz dili', icon: <Globe className="w-3.5 h-3.5 text-amber-400" /> },
  timezone: { label: 'Saat Dilimi', description: 'Tarih/saat hesaplamaları için', icon: <Clock className="w-3.5 h-3.5 text-pink-400" /> },
};

const MODULE_KEY_META: Record<string, { label: string; description: string }> = {
  default_vat_rate: { label: 'Varsayılan KDV Oranı', description: 'Yeni kalem eklerken kullanılacak KDV oranı (%)' },
  fiscal_year_start: { label: 'Mali Yıl Başlangıcı', description: 'Mali yılın başladığı ay-gün' },
  costing_method: { label: 'Maliyetlendirme Yöntemi', description: 'Stok maliyeti hesaplama yöntemi' },
  low_stock_alert: { label: 'Düşük Stok Uyarısı', description: 'Minimum stok altına düşünce uyarı' },
  auto_invoice_number: { label: 'Otomatik Fatura Numarası', description: 'Fatura numarası otomatik oluşturulsun mu' },
  payment_terms_days: { label: 'Ödeme Vadesi (Gün)', description: 'Varsayılan ödeme vadesi' },
};

const MODULE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  accounting: { label: 'Muhasebe', icon: <Calculator className="w-3.5 h-3.5 text-emerald-400" /> },
  inventory: { label: 'Envanter', icon: <Package className="w-3.5 h-3.5 text-sky-400" /> },
  invoicing: { label: 'Faturalama', icon: <FileText className="w-3.5 h-3.5 text-violet-400" /> },
};

function getValueDisplay(key: string, value: string): string {
  if (value === 'true') return 'Açık';
  if (value === 'false') return 'Kapalı';
  if (key === 'costing_method') {
    const map: Record<string, string> = { MOVING_AVERAGE: 'Hareketli Ortalama', FIFO: 'İlk Giren İlk Çıkar', LIFO: 'Son Giren İlk Çıkar', STANDARD: 'Standart Maliyet' };
    return map[value] ?? value;
  }
  if (key === 'language') return value === 'tr' ? 'Türkçe' : value === 'en' ? 'İngilizce' : value;
  if (key === 'timezone') return value.replace('_', ' ').replace('/', ' / ');
  if (key === 'date_format') {
    const map: Record<string, string> = { 'DD.MM.YYYY': '31.12.2026', 'DD/MM/YYYY': '31/12/2026', 'YYYY-MM-DD': '2026-12-31', 'MM/DD/YYYY': '12/31/2026' };
    return map[value] ?? value;
  }
  return value;
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
  auto_invoice_number: [
    { value: 'true', label: 'Açık' },
    { value: 'false', label: 'Kapalı' },
  ],
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
  const upsertTenant = useUpsertTenantSetting();
  const deleteTenant = useDeleteTenantSetting();
  const upsertModule = useUpsertModuleSetting();

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

  const handleAdd = () => {
    if (addType === 'tenant') {
      upsertTenant.mutate({ key: newKey, value: newValue }, { onSuccess: () => { setAddOpen(false); setNewKey(''); setNewValue(''); } });
    } else {
      upsertModule.mutate({ module: newModule, key: newKey, value: newValue }, { onSuccess: () => { setAddOpen(false); setNewKey(''); setNewValue(''); setNewModule(''); } });
    }
  };

  const moduleGroups = moduleSettings.reduce<Record<string, ModuleSetting[]>>((acc, s) => {
    (acc[s.module] ??= []).push(s);
    return acc;
  }, {});

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
        ) : tenantSettings.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-600">Henüz ayar eklenmemiş.</div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {tenantSettings.map((s) => {
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
                    <p className="text-sm font-medium text-slate-200">{meta?.label ?? s.key}</p>
                    {meta?.description && <p className="text-[10px] text-slate-500 mt-0.5">{meta.description}</p>}
                    {!meta && <p className="text-[10px] text-slate-600 font-mono">{s.key}</p>}
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
                <h2 className="text-sm font-semibold text-white">{modMeta?.label ?? mod}</h2>
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
                      <p className="text-sm font-medium text-slate-200">{meta?.label ?? s.key}</p>
                      {meta?.description && <p className="text-[10px] text-slate-500 mt-0.5">{meta.description}</p>}
                      {!meta && <p className="text-[10px] text-slate-600 font-mono">{s.key}</p>}
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
