'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, GitBranch, PlaySquare, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type {
  AutomationRule,
  AutomationRuleAction,
  AutomationRuleConfig,
  AutomationRuleTemplate,
  AutomationRuleTrigger,
  CreateAutomationRuleDTO,
} from '@/services/intelligence.service';

type AutomationRuleDraft = CreateAutomationRuleDTO;

interface RuleOption<TValue extends string> {
  value: TValue;
  label: string;
  detail: string;
}

interface ConfigPreset {
  label: string;
  detail: string;
  config: AutomationRuleConfig;
}

interface RuleFormState {
  name: string;
  module: string;
  description: string;
  trigger: AutomationRuleTrigger;
  action: AutomationRuleAction;
  conditions: AutomationRuleConfig;
  actionConfig: AutomationRuleConfig;
  isActive: boolean;
}

interface AutomationRuleBuilderProps {
  templates: AutomationRuleTemplate[];
  editingRule: AutomationRule | null;
  isSubmitting: boolean;
  onCreate: (data: AutomationRuleDraft) => void;
  onUpdate: (id: string, data: Partial<AutomationRuleDraft>) => void;
  onCancelEdit: () => void;
}

const TRIGGER_OPTIONS: Array<RuleOption<AutomationRuleTrigger>> = [
  { value: 'LOW_STOCK', label: 'Minimum stok altina dustu', detail: 'Tek depo toplam stok min seviyenin altina indiginde calisir.' },
  { value: 'OVERDUE_INVOICE', label: 'Fatura vadesi gecti', detail: 'Satis faturasi vadesi gecmis ve kapanmamis kayitlari yakalar.' },
  { value: 'HIGH_VALUE_INVOICE', label: 'Yuksek tutarli fatura', detail: 'Belirlenen tutar uzerindeki faturalar icin kontrol baslatir.' },
  { value: 'LOW_MARGIN', label: 'Dusuk kar marji', detail: 'Satis fiyati maliyete yaklasan urunleri isaretler.' },
  { value: 'CHECK_DUE_SOON', label: 'Cek/senet vadesi yaklasti', detail: 'Vadesi yaklasan cek ve senetleri takip listesine alir.' },
];

const ACTION_OPTIONS: Array<RuleOption<AutomationRuleAction>> = [
  { value: 'CREATE_TASK', label: 'Gorev olustur', detail: 'Workflow gorev listesine takip isi acar.' },
  { value: 'CREATE_NOTIFICATION', label: 'Sistem bildirimi gonder', detail: 'Sorumlu kullaniciya ya da tenant sahibine bildirim dusurur.' },
  { value: 'DRAFT_REMINDER_EMAIL', label: 'Mail taslagi hazirla', detail: 'Takip maili icin otomasyon gorevi olusturur.' },
  { value: 'REQUEST_APPROVAL', label: 'Onay kontrolu baslat', detail: 'Onay akisina gidecek kontrol gorevi olusturur.' },
  { value: 'CREATE_PURCHASE_REQUEST_DRAFT', label: 'Satin alma taslagi ac', detail: 'Kritik stok icin satin alma takip gorevi olusturur.' },
];

const MODULE_OPTIONS = ['workflow', 'inventory', 'invoicing', 'accounting', 'approvals', 'purchasing'];

const CONDITION_PRESETS: Record<AutomationRuleTrigger, ConfigPreset[]> = {
  LOW_STOCK: [
    { label: 'Minimum stok tanimli aktif urunler', detail: 'Stok toplamı urun min seviyesinin altindaysa eslesir.', config: { minStockRequired: true, scope: 'single_warehouse_total' } },
    { label: 'Acil stok acigi', detail: 'Stok acigi 10 adetten buyuk olan urunleri onceliklendirir.', config: { minStockRequired: true, minDeficit: 10, scope: 'single_warehouse_total' } },
  ],
  OVERDUE_INVOICE: [
    { label: 'Vadesi gecen satis faturasi', detail: 'SENT, PARTIALLY_PAID veya OVERDUE durumlarini izler.', config: { invoiceType: 'SALES', statuses: 'SENT,PARTIALLY_PAID,OVERDUE' } },
    { label: 'Kritik tahsilat gecikmesi', detail: '7 gunden fazla geciken faturalari ayirir.', config: { invoiceType: 'SALES', overdueDays: 7 } },
  ],
  HIGH_VALUE_INVOICE: [
    { label: '100.000 TRY ve uzeri', detail: 'Fatura toplam brut tutari limite esit veya ustundeyse calisir.', config: { minAmount: 100000, currency: 'TRY' } },
    { label: '250.000 TRY ve uzeri', detail: 'Daha yuksek finans kontrol limiti uygular.', config: { minAmount: 250000, currency: 'TRY' } },
  ],
  LOW_MARGIN: [
    { label: 'Marj yuzde 12 altinda', detail: 'Ortalama maliyet veya alis fiyatina gore dusuk marji yakalar.', config: { maxMarginRate: 0.12 } },
    { label: 'Zarar riski', detail: 'Maliyet satis fiyatini asiyorsa kritik gorev olusturur.', config: { maxMarginRate: 0 } },
  ],
  CHECK_DUE_SOON: [
    { label: '7 gun icinde vade', detail: 'Bekleyen veya bankaya verilen cek/senetleri izler.', config: { dueInDays: 7 } },
    { label: '3 gun icinde vade', detail: 'Daha yakin vadeler icin dar takip listesi olusturur.', config: { dueInDays: 3 } },
  ],
};

const ACTION_PRESETS: Record<AutomationRuleAction, ConfigPreset[]> = {
  CREATE_TASK: [
    { label: 'Otomatik gorev', detail: 'Eslesen kayit icin tekil workflow gorevi acar.', config: { taskType: 'AUTOMATION', priorityPolicy: 'source_based' } },
    { label: 'Acil takip gorevi', detail: 'Onceligi tetikleyici riskine gore yukseltir.', config: { taskType: 'AUTOMATION', priorityPolicy: 'risk_based' } },
  ],
  CREATE_NOTIFICATION: [
    { label: 'Sistem ici bildirim', detail: 'Atanan kullanici yoksa tenant sahibine bildirim gonderir.', config: { channel: 'in_app', audience: 'assigned_or_owner' } },
  ],
  DRAFT_REMINDER_EMAIL: [
    { label: 'Hatirlatma mail taslagi', detail: 'Mail gonderimi yerine onaylanacak gorev taslagi acar.', config: { mailMode: 'draft_only', template: 'payment_reminder' } },
  ],
  REQUEST_APPROVAL: [
    { label: 'Finans kontrol onayi', detail: 'Onay akisina tasinacak kontrol gorevi olusturur.', config: { approvalScope: 'finance_review' } },
  ],
  CREATE_PURCHASE_REQUEST_DRAFT: [
    { label: 'Satin alma talebi taslagi', detail: 'Eksik stok icin satin alma hazirlik gorevi acar.', config: { draftType: 'purchase_request', quantityPolicy: 'deficit' } },
  ],
};

const DEFAULT_FORM: RuleFormState = {
  name: '',
  module: 'workflow',
  description: '',
  trigger: 'LOW_STOCK',
  action: 'CREATE_TASK',
  conditions: CONDITION_PRESETS.LOW_STOCK[0].config,
  actionConfig: ACTION_PRESETS.CREATE_TASK[0].config,
  isActive: true,
};

function sameConfig(left: AutomationRuleConfig, right: AutomationRuleConfig): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([key, value]) => right[key] === value);
}

function configSummary(config: AutomationRuleConfig): string {
  const entries = Object.entries(config);
  if (entries.length === 0) return 'Ek kosul yok';
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(' / ');
}

function toFormState(rule: AutomationRule | null): RuleFormState {
  if (!rule) return DEFAULT_FORM;
  return {
    name: rule.name,
    module: rule.module,
    description: rule.description ?? '',
    trigger: rule.trigger,
    action: rule.action,
    conditions: rule.conditions ?? CONDITION_PRESETS[rule.trigger][0].config,
    actionConfig: rule.actionConfig ?? ACTION_PRESETS[rule.action][0].config,
    isActive: rule.isActive,
  };
}

export function AutomationRuleBuilder({
  templates,
  editingRule,
  isSubmitting,
  onCreate,
  onUpdate,
  onCancelEdit,
}: AutomationRuleBuilderProps) {
  const [form, setForm] = useState<RuleFormState>(() => toFormState(editingRule));

  useEffect(() => {
    setForm(toFormState(editingRule));
  }, [editingRule]);

  const selectedConditionIndex = useMemo(
    () => CONDITION_PRESETS[form.trigger].findIndex((preset) => sameConfig(preset.config, form.conditions)),
    [form.conditions, form.trigger],
  );
  const selectedActionIndex = useMemo(
    () => ACTION_PRESETS[form.action].findIndex((preset) => sameConfig(preset.config, form.actionConfig)),
    [form.action, form.actionConfig],
  );

  const submitLabel = editingRule ? 'Kuralı güncelle' : 'Kuralı oluştur';
  const canSubmit = form.name.trim().length > 0 && form.module.trim().length > 0;

  return (
    <section className="grid gap-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-slate-200">
          <GitBranch className="h-4 w-4 text-sky-400" />
          <h3 className="text-sm font-semibold">Kural tasarimcisi</h3>
        </div>
        <p className="text-xs leading-relaxed text-slate-500">
          Sablondan baslayin veya tetikleyici, kosul ve aksiyonu adim adim secerek backend automation-rule yapisina uygun kural olusturun.
        </p>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-400">Hazir sablon</span>
          <select
            value=""
            onChange={(event) => {
              const template = templates.find((item) => item.key === event.target.value);
              if (!template) return;
              setForm({
                name: template.title,
                module: template.module,
                description: template.description,
                trigger: template.trigger,
                action: template.action,
                conditions: template.conditions,
                actionConfig: template.actionConfig,
                isActive: true,
              });
            }}
            className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-200 outline-none focus:border-sky-500"
          >
            <option value="">Sablon sec</option>
            {templates.map((template) => (
              <option key={template.key} value={template.key}>{template.title}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Kural adi</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-sky-500"
              placeholder="Or. Vadesi gecen fatura bildirimi"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-400">Modul</span>
            <select
              value={form.module}
              onChange={(event) => setForm((current) => ({ ...current, module: event.target.value }))}
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-200 outline-none focus:border-sky-500"
            >
              {MODULE_OPTIONS.map((module) => (
                <option key={module} value={module}>{module}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-400">Aciklama</span>
          <textarea
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            className="min-h-16 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500"
            placeholder="Kuralin hangi is riskini azalttigini yazin"
          />
        </label>

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <PlaySquare className="h-3.5 w-3.5 text-sky-400" />
              Tetikleyici
            </div>
            <select
              value={form.trigger}
              onChange={(event) => {
                const trigger = event.target.value as AutomationRuleTrigger;
                setForm((current) => ({ ...current, trigger, conditions: CONDITION_PRESETS[trigger][0].config }));
              }}
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-200 outline-none focus:border-sky-500"
            >
              {TRIGGER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="text-[11px] leading-relaxed text-slate-500">
              {TRIGGER_OPTIONS.find((option) => option.value === form.trigger)?.detail}
            </p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <SlidersHorizontal className="h-3.5 w-3.5 text-amber-400" />
              Kosul
            </div>
            <select
              value={selectedConditionIndex >= 0 ? String(selectedConditionIndex) : 'custom'}
              onChange={(event) => {
                const preset = CONDITION_PRESETS[form.trigger][Number(event.target.value)];
                if (preset) setForm((current) => ({ ...current, conditions: preset.config }));
              }}
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-200 outline-none focus:border-sky-500"
            >
              {CONDITION_PRESETS[form.trigger].map((preset, index) => (
                <option key={preset.label} value={index}>{preset.label}</option>
              ))}
              {selectedConditionIndex < 0 && <option value="custom">Ozel kosul</option>}
            </select>
            <p className="text-[11px] leading-relaxed text-slate-500">
              {selectedConditionIndex >= 0 ? CONDITION_PRESETS[form.trigger][selectedConditionIndex].detail : configSummary(form.conditions)}
            </p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Aksiyon
            </div>
            <select
              value={form.action}
              onChange={(event) => {
                const action = event.target.value as AutomationRuleAction;
                setForm((current) => ({ ...current, action, actionConfig: ACTION_PRESETS[action][0].config }));
              }}
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-200 outline-none focus:border-sky-500"
            >
              {ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={selectedActionIndex >= 0 ? String(selectedActionIndex) : 'custom'}
              onChange={(event) => {
                const preset = ACTION_PRESETS[form.action][Number(event.target.value)];
                if (preset) setForm((current) => ({ ...current, actionConfig: preset.config }));
              }}
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-xs text-slate-200 outline-none focus:border-sky-500"
            >
              {ACTION_PRESETS[form.action].map((preset, index) => (
                <option key={preset.label} value={index}>{preset.label}</option>
              ))}
              {selectedActionIndex < 0 && <option value="custom">Ozel aksiyon ayari</option>}
            </select>
          </div>
        </div>

        <div className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400 md:grid-cols-2">
          <div>
            <span className="font-semibold text-slate-300">Kosul verisi: </span>
            {configSummary(form.conditions)}
          </div>
          <div>
            <span className="font-semibold text-slate-300">Aksiyon ayari: </span>
            {configSummary(form.actionConfig)}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950"
            />
            Aktif olarak kaydet
          </label>
          <div className="flex items-center gap-2">
            {editingRule && (
              <Button variant="ghost" size="sm" leftIcon={<X className="h-3.5 w-3.5" />} onClick={onCancelEdit}>
                Vazgec
              </Button>
            )}
            <Button
              size="sm"
              loading={isSubmitting}
              disabled={!canSubmit}
              onClick={() => {
                const payload: AutomationRuleDraft = {
                  name: form.name.trim(),
                  module: form.module,
                  description: form.description.trim() || undefined,
                  trigger: form.trigger,
                  action: form.action,
                  conditions: form.conditions,
                  actionConfig: form.actionConfig,
                  isActive: form.isActive,
                };
                if (editingRule) {
                  onUpdate(editingRule.id, payload);
                } else {
                  onCreate(payload);
                  setForm(DEFAULT_FORM);
                }
              }}
              className={cn(!canSubmit && 'pointer-events-none')}
            >
              {submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
