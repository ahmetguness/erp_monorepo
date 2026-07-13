'use client';

import { useState } from 'react';
import {
  AlertTriangle, Bell, CheckCircle2, Clock, ExternalLink, Sparkles, Play, Trash2, ToggleLeft, ToggleRight, Settings, Plus, PlaySquare
} from 'lucide-react';
import Link from 'next/link';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { PageHeader } from '@/components/shared/PageHeader';
import { useWorkflowTasks } from '@/hooks/useWorkflow';
import type { WorkflowTask } from '@/services/task.service';
import type { AutomationRule } from '@/services/intelligence.service';
import {
  useAutomationRules, useAutomationRuleTemplates, useCreateAutomationRule, useUpdateAutomationRule, useDeleteAutomationRule, useRunAutomationRule, useRunActiveAutomationRules
} from '@/hooks/useAutomation';
import { AutomationRuleBuilder } from './AutomationRuleBuilder';

const TYPE_LABEL: Record<WorkflowTask['type'], string> = {
  APPROVAL: 'Onay',
  COLLECTION: 'Tahsilat',
  SERVICE: 'Servis',
  NOTIFICATION: 'Bildirim',
  CHECK: 'Cek/Senet',
  AUTOMATION: 'Otomasyon',
  STOCK: 'Stok',
  FISCAL: 'Donem',
  GENERAL: 'Gorev',
};

const PRIORITY_BADGE: Record<WorkflowTask['priority'], BadgeVariant> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
};

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function formatConfig(value: Record<string, string | number | boolean> | null): string {
  if (!value || Object.keys(value).length === 0) return 'Ek kosul yok';
  return Object.entries(value).map(([key, item]) => `${key}: ${String(item)}`).join(' / ');
}

function formatRunResult(rule: AutomationRule): string {
  if (!rule.lastRunAt) return 'Henuz calistirilmadi';
  const result = rule.lastResult;
  if (!result) return `${formatDate(rule.lastRunAt)} tarihinde calisti`;
  const actionCount = result.tasksCreated + result.notificationsCreated;
  return `${formatDate(rule.lastRunAt)} - ${result.matched} eslesme, ${actionCount} aksiyon`;
}

const TRIGGER_LABELS: Record<string, string> = {
  LOW_STOCK: 'Kritik Stok Seviyesi',
  OVERDUE_INVOICE: 'Geciken Fatura Vadesi',
  HIGH_VALUE_INVOICE: 'Yüksek Tutarlı Fatura',
  LOW_MARGIN: 'Düşük Kar Marjı',
  CHECK_DUE_SOON: 'Yaklaşan Çek/Senet Vadesi',
};

const ACTION_LABELS: Record<string, string> = {
  CREATE_TASK: 'Görev Oluştur',
  CREATE_NOTIFICATION: 'Bildirim Gönder',
  DRAFT_REMINDER_EMAIL: 'Hatırlatma E-postası Hazırla',
  REQUEST_APPROVAL: 'Onay Akışı Başlat',
  CREATE_PURCHASE_REQUEST_DRAFT: 'Satın Alma Talebi Taslağı Aç',
};

export function WorkflowCenterPage() {
  const [activeTab, setActiveTab] = useState<'tasks' | 'rules'>('tasks');
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const { data, isLoading, isError } = useWorkflowTasks();
  const tasks = data?.data ?? [];
  const counts = data?.meta.counts;
  const criticalCount = tasks.filter((task) => task.priority === 'CRITICAL').length;

  const { data: rules, isLoading: loadingRules } = useAutomationRules();
  const { data: templates } = useAutomationRuleTemplates();
  const createRule = useCreateAutomationRule();
  const updateRule = useUpdateAutomationRule();
  const deleteRule = useDeleteAutomationRule();
  const runRule = useRunAutomationRule();
  const runAllActive = useRunActiveAutomationRules();

  return (
    <div className="space-y-6">
      <PageHeader
        title="İş Akışı & Otomasyon Merkezi"
        subtitle="İş akışlarını, otomatik kuralları ve bekleyen görevleri tek bir merkezden yönetin."
        action={
          activeTab === 'rules' && (
            <button
              onClick={() => runAllActive.mutate()}
              disabled={runAllActive.isPending}
              className="inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 disabled:opacity-50 transition-all duration-200 active:scale-[0.97]"
            >
              <Play className="w-4 h-4" />
              Tüm Aktif Kuralları Tetikle
            </button>
          )
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-px">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all outline-none ${
            activeTab === 'tasks'
              ? 'border-sky-500 text-sky-400 font-semibold bg-sky-500/5 rounded-t-lg'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Bell className="w-4 h-4" />
          Bekleyen İşler ({tasks.length})
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all outline-none ${
            activeTab === 'rules'
              ? 'border-sky-500 text-sky-400 font-semibold bg-sky-500/5 rounded-t-lg'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Settings className="w-4 h-4" />
          Otomasyon Kuralları ({rules?.length ?? 0})
        </button>
      </div>

      {activeTab === 'tasks' && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <Bell className="mb-3 h-5 w-5 text-sky-400" />
              <p className="text-2xl font-semibold text-slate-100">{data?.meta.total ?? 0}</p>
              <p className="text-xs text-slate-500">Toplam bekleyen iş</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <CheckCircle2 className="mb-3 h-5 w-5 text-emerald-400" />
              <p className="text-2xl font-semibold text-slate-100">{counts?.APPROVAL ?? 0}</p>
              <p className="text-xs text-slate-500">Bekleyen onay</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <AlertTriangle className="mb-3 h-5 w-5 text-amber-400" />
              <p className="text-2xl font-semibold text-slate-100">{(counts?.STOCK ?? 0) + (counts?.COLLECTION ?? 0)}</p>
              <p className="text-xs text-slate-500">Stok ve tahsilat uyarısı</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <Clock className="mb-3 h-5 w-5 text-red-400" />
              <p className="text-2xl font-semibold text-slate-100">{criticalCount}</p>
              <p className="text-xs text-slate-500">Kritik öncelik</p>
            </div>
          </div>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40">
            {isLoading ? (
              <div className="p-6 text-sm text-slate-500">Yükleniyor...</div>
            ) : isError ? (
              <div className="p-6 text-sm text-red-400">İş akışı verisi alınamadı.</div>
            ) : tasks.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">Bekleyen iş bulunmuyor.</div>
            ) : (
              <div className="divide-y divide-slate-800">
                {tasks.map((task) => (
                  <Link
                    key={task.id}
                    href={task.href}
                    className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-slate-900 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant={PRIORITY_BADGE[task.priority]}>{task.priority}</Badge>
                        <Badge variant="neutral">{TYPE_LABEL[task.type]}</Badge>
                        {task.dueAt && <span className="text-xs text-slate-500">{formatDate(task.dueAt)}</span>}
                      </div>
                      <p className="truncate text-sm font-medium text-slate-200">{task.title}</p>
                      {task.detail && <p className="mt-1 truncate text-xs text-slate-500">{task.detail}</p>}
                    </div>
                    <ExternalLink className="h-4 w-4 shrink-0 text-slate-500" />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="space-y-8">
          <AutomationRuleBuilder
            templates={templates ?? []}
            editingRule={editingRule}
            isSubmitting={createRule.isPending || updateRule.isPending}
            onCreate={(payload) => createRule.mutate(payload)}
            onUpdate={(id, payload) => updateRule.mutate({ id, data: payload }, { onSuccess: () => setEditingRule(null) })}
            onCancelEdit={() => setEditingRule(null)}
          />

          {/* Rules Templates Section */}
          <div className="space-y-4 bg-slate-950/20 border border-slate-800/80 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-slate-400 border-b border-slate-800/60 pb-3 mb-1">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Hazır Otomasyon Kuralları Kütüphanesi
              </h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {templates?.map((tmpl) => (
                <div
                  key={tmpl.key}
                  className="bg-slate-900 border border-slate-800/60 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 hover:shadow-lg transition-all duration-300 group"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full border border-violet-500/20 uppercase">
                        {tmpl.module}
                      </span>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white group-hover:text-sky-400 transition-colors">
                        {tmpl.title}
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                        {tmpl.description}
                      </p>
                    </div>

                    <div className="space-y-2">
                      {tmpl.steps.map((step) => (
                        <div key={`${tmpl.key}-${step.label}`} className="rounded-lg border border-slate-800 bg-slate-950/30 p-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{step.label}</p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-300">{step.description}</p>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 space-y-1 bg-slate-950/40 p-2.5 rounded-lg border border-slate-850 text-[10px]">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-slate-500">Tetikleyici:</span>
                        <span className="font-semibold">{TRIGGER_LABELS[tmpl.trigger] ?? tmpl.trigger}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-slate-500">Koşul:</span>
                        <span className="max-w-40 truncate text-right font-semibold text-slate-300">{tmpl.conditionLabel}</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="text-slate-500">Aksiyon:</span>
                        <span className="max-w-40 truncate text-right font-semibold text-sky-400">{tmpl.actionLabel || ACTION_LABELS[tmpl.action] || tmpl.action}</span>
                      </div>
                    </div>
                    <p className="text-[10px] leading-relaxed text-emerald-300/80">{tmpl.outcomeLabel}</p>
                  </div>
                  <button
                    onClick={() => {
                      createRule.mutate({
                        name: tmpl.title,
                        module: tmpl.module,
                        trigger: tmpl.trigger,
                        action: tmpl.action,
                        description: tmpl.description,
                        conditions: tmpl.conditions,
                        actionConfig: tmpl.actionConfig,
                        isActive: true,
                      });
                    }}
                    disabled={createRule.isPending}
                    className="mt-4 w-full text-center py-2 rounded-lg text-xs font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 disabled:opacity-50 transition-all duration-200"
                  >
                    Şablonu Ekle
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Active Rules List */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-200">Kişiselleştirilmiş Otomasyon Kuralları</h3>
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
              {loadingRules ? (
                <div className="p-6 text-sm text-slate-500">Kurallar yükleniyor...</div>
              ) : !rules || rules.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">Kayıtlı otomasyon kuralı bulunmamaktadır. Yukarıdan bir şablon ekleyerek başlayabilirsiniz.</div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex flex-col gap-4 p-4 transition-colors hover:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-200">{rule.name}</span>
                          <span className={`w-2 h-2 rounded-full ${rule.isActive ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                        </div>
                        {rule.description && (
                          <p className="text-xs text-slate-500 line-clamp-1">{rule.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Badge variant="neutral">{TRIGGER_LABELS[rule.trigger] ?? rule.trigger}</Badge>
                          <span className="text-slate-600">➔</span>
                          <Badge variant="info">{ACTION_LABELS[rule.action] ?? rule.action}</Badge>
                        </div>
                        <div className="grid gap-1 pt-2 text-[11px] text-slate-500 md:grid-cols-2">
                          <p className="truncate"><span className="text-slate-400">Koşul:</span> {formatConfig(rule.conditions)}</p>
                          <p className="truncate"><span className="text-slate-400">Son calisma:</span> {formatRunResult(rule)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                        <button
                          onClick={() => setEditingRule(rule)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-400 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 transition-colors"
                        >
                          Duzenle
                        </button>
                        <button
                          onClick={() => {
                            updateRule.mutate({
                              id: rule.id,
                              data: { isActive: !rule.isActive },
                            });
                          }}
                          disabled={updateRule.isPending}
                          className="p-1.5 rounded-lg border border-slate-850 bg-slate-900/50 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                          title={rule.isActive ? "Pasifleştir" : "Aktifleştir"}
                        >
                          {rule.isActive ? (
                            <ToggleRight className="w-5 h-5 text-emerald-500" />
                          ) : (
                            <ToggleLeft className="w-5 h-5 text-slate-500" />
                          )}
                        </button>
                        <button
                          onClick={() => runRule.mutate(rule.id)}
                          disabled={runRule.isPending || !rule.isActive}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Çalıştır
                        </button>
                        <button
                          onClick={() => deleteRule.mutate(rule.id)}
                          disabled={deleteRule.isPending}
                          className="p-1.5 rounded-lg border border-slate-850 bg-slate-900/50 hover:bg-red-500/10 hover:border-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
