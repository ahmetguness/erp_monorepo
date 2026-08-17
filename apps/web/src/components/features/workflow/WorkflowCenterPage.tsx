'use client';

import { useState } from 'react';
import {
  AlertOctagon, AlertTriangle, Bell, CalendarClock, CheckCircle2, Clock, ExternalLink, Sparkles, Play, Trash2, ToggleLeft, ToggleRight, Settings
} from 'lucide-react';
import Link from 'next/link';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { PageHeader } from '@/components/shared/PageHeader';
import { useExceptionCenter, useWorkflowTasks } from '@/hooks/useWorkflow';
import type { ExceptionCenterItem, WorkflowTask } from '@/services/task.service';
import type { AutomationExecution, AutomationRule, SchedulerJobDefinition } from '@/services/intelligence.service';
import {
  useAutomationExecutions, useAutomationRules, useAutomationRuleTemplates, useCreateAutomationRule, useUpdateAutomationRule, useDeleteAutomationRule, useRunAutomationRule, useRunActiveAutomationRules, useSchedulerJobs, useSchedulerRuns, useRunSchedulerJob
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

const EXECUTION_BADGE: Record<AutomationExecution['status'], BadgeVariant> = {
  RUNNING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'danger',
};

const SCHEDULER_STATUS_BADGE: Record<SchedulerJobDefinition['status'], BadgeVariant> = {
  ACTIVE: 'success',
  PLANNED: 'neutral',
};

const EXCEPTION_SEVERITY_BADGE: Record<ExceptionCenterItem['severity'], BadgeVariant> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
};

const EXCEPTION_STATUS_BADGE: Record<ExceptionCenterItem['status'], BadgeVariant> = {
  OPEN: 'warning',
  IN_PROGRESS: 'info',
  FAILED: 'danger',
  BLOCKED: 'danger',
};

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
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
  const [activeTab, setActiveTab] = useState<'exceptions' | 'tasks' | 'rules' | 'scheduler'>('exceptions');
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const { data, isLoading, isError } = useWorkflowTasks();
  const tasks = data?.data ?? [];
  const counts = data?.meta.counts;
  const criticalCount = tasks.filter((task) => task.priority === 'CRITICAL').length;
  const { data: exceptions, isLoading: loadingExceptions, isError: exceptionError } = useExceptionCenter();
  const exceptionItems = exceptions?.items ?? [];

  const { data: rules, isLoading: loadingRules } = useAutomationRules();
  const { data: templates } = useAutomationRuleTemplates();
  const createRule = useCreateAutomationRule();
  const updateRule = useUpdateAutomationRule();
  const deleteRule = useDeleteAutomationRule();
  const runRule = useRunAutomationRule();
  const runAllActive = useRunActiveAutomationRules();
  const { data: executions = [], isLoading: loadingExecutions } = useAutomationExecutions();
  const { data: schedulerJobs = [], isLoading: loadingSchedulerJobs } = useSchedulerJobs();
  const { data: schedulerRuns = [], isLoading: loadingSchedulerRuns } = useSchedulerRuns();
  const runScheduler = useRunSchedulerJob();
  const activeSchedulerCount = schedulerJobs.filter((job) => job.status === 'ACTIVE').length;
  const plannedSchedulerCount = schedulerJobs.filter((job) => job.status === 'PLANNED').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="İş Akışı & Otomasyon Merkezi"
        subtitle="İş akışlarını, otomatik kuralları ve bekleyen görevleri tek bir merkezden yönetin."
        action={
          activeTab === 'rules' ? (
            <button
              onClick={() => runAllActive.mutate()}
              disabled={runAllActive.isPending}
              className="inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 disabled:opacity-50 transition-all duration-200 active:scale-[0.97]"
            >
              <Play className="w-4 h-4" />
              Tüm Aktif Kuralları Tetikle
            </button>
          ) : activeTab === 'scheduler' ? (
            <button
              onClick={() => runScheduler.mutate('all')}
              disabled={runScheduler.isPending || activeSchedulerCount === 0}
              className="inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-emerald-500 to-sky-600 hover:from-emerald-400 hover:to-sky-500 shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-all duration-200 active:scale-[0.97]"
            >
              <Play className="w-4 h-4" />
              Tum Aktif Joblari Calistir
            </button>
          ) : null
        }
      />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-px">
        <button
          onClick={() => setActiveTab('exceptions')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all outline-none ${
            activeTab === 'exceptions'
              ? 'border-sky-500 text-sky-400 font-semibold bg-sky-500/5 rounded-t-lg'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertOctagon className="w-4 h-4" />
          Exceptions ({exceptions?.total ?? 0})
        </button>
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
        <button
          onClick={() => setActiveTab('scheduler')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all outline-none ${
            activeTab === 'scheduler'
              ? 'border-sky-500 text-sky-400 font-semibold bg-sky-500/5 rounded-t-lg'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <CalendarClock className="w-4 h-4" />
          Scheduler ({activeSchedulerCount})
        </button>
      </div>

      {activeTab === 'exceptions' && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <AlertOctagon className="mb-3 h-5 w-5 text-red-400" />
              <p className="text-2xl font-semibold text-slate-100">{exceptions?.total ?? 0}</p>
              <p className="text-xs text-slate-500">Acil islem bekleyen</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <AlertTriangle className="mb-3 h-5 w-5 text-amber-400" />
              <p className="text-2xl font-semibold text-slate-100">{exceptions?.critical ?? 0}</p>
              <p className="text-xs text-slate-500">Kritik istisna</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <Clock className="mb-3 h-5 w-5 text-sky-400" />
              <p className="text-2xl font-semibold text-slate-100">{exceptions?.high ?? 0}</p>
              <p className="text-xs text-slate-500">Yuksek oncelik</p>
            </div>
          </div>

          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(exceptions?.byCategory ?? []).filter((item) => item.count > 0).map((item) => (
              <div key={item.category} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-slate-200">{item.label}</p>
                  {item.highestSeverity && <Badge variant={EXCEPTION_SEVERITY_BADGE[item.highestSeverity]}>{item.highestSeverity}</Badge>}
                </div>
                <p className="text-2xl font-semibold text-slate-100">{item.count}</p>
              </div>
            ))}
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40">
            {loadingExceptions ? (
              <div className="p-6 text-sm text-slate-500">Exception Center yukleniyor...</div>
            ) : exceptionError ? (
              <div className="p-6 text-sm text-red-400">Exception Center verisi alinamadi.</div>
            ) : exceptionItems.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">Mudahale gerektiren istisna bulunmuyor.</div>
            ) : (
              <div className="divide-y divide-slate-800">
                {exceptionItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="grid gap-3 px-4 py-3 text-sm transition-colors hover:bg-slate-900 md:grid-cols-[minmax(0,1fr)_150px_150px] md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant={EXCEPTION_SEVERITY_BADGE[item.severity]}>{item.severity}</Badge>
                        <Badge variant={EXCEPTION_STATUS_BADGE[item.status]}>{item.status}</Badge>
                        <Badge variant="neutral">{item.module}</Badge>
                      </div>
                      <p className="truncate font-medium text-slate-200">{item.title}</p>
                      {item.detail && <p className="mt-1 truncate text-xs text-slate-500">{item.detail}</p>}
                    </div>
                    <p className="truncate text-xs text-slate-500">{item.category}</p>
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500 md:justify-end">
                      <span>{formatDateTime(item.occurredAt)}</span>
                      <ExternalLink className="h-4 w-4 shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

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

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-200">Son Otomasyon Çalışmaları</h3>
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
              {loadingExecutions ? (
                <div className="p-6 text-sm text-slate-500">Çalışma geçmişi yükleniyor...</div>
              ) : executions.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">Henüz otomasyon çalışması bulunmuyor.</div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {executions.map((execution) => (
                    <div key={execution.id} className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_130px_160px] md:items-center">
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <Badge variant={EXECUTION_BADGE[execution.status]}>{execution.status}</Badge>
                          <Badge variant="neutral">{TRIGGER_LABELS[execution.trigger ?? ''] ?? execution.trigger ?? '-'}</Badge>
                          <Badge variant="info">{ACTION_LABELS[execution.action ?? ''] ?? execution.action ?? '-'}</Badge>
                        </div>
                        <p className="truncate font-medium text-slate-200">{execution.rule?.name ?? 'Manuel / sistem çalışması'}</p>
                        {execution.error && <p className="mt-1 truncate text-xs text-red-300">{execution.error}</p>}
                      </div>
                      <div className="text-xs text-slate-500">
                        <p>Deneme: {execution.attempt}</p>
                        <p>{execution.entityType ?? '-'}{execution.entityId ? ` / ${execution.entityId}` : ''}</p>
                      </div>
                      <div className="text-xs text-slate-500 md:text-right">
                        <p>Başlangıç: {formatDateTime(execution.startedAt)}</p>
                        <p>Bitiş: {formatDateTime(execution.completedAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'scheduler' && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <CalendarClock className="mb-3 h-5 w-5 text-emerald-400" />
              <p className="text-2xl font-semibold text-slate-100">{activeSchedulerCount}</p>
              <p className="text-xs text-slate-500">Aktif job</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <Clock className="mb-3 h-5 w-5 text-slate-400" />
              <p className="text-2xl font-semibold text-slate-100">{plannedSchedulerCount}</p>
              <p className="text-xs text-slate-500">Planli job</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
              <CheckCircle2 className="mb-3 h-5 w-5 text-sky-400" />
              <p className="text-2xl font-semibold text-slate-100">{schedulerRuns.length}</p>
              <p className="text-xs text-slate-500">Kayitli calisma</p>
            </div>
          </div>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40">
            {loadingSchedulerJobs ? (
              <div className="p-6 text-sm text-slate-500">Scheduler joblari yukleniyor...</div>
            ) : schedulerJobs.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">Tanimli scheduler job bulunmuyor.</div>
            ) : (
              <div className="divide-y divide-slate-800">
                {schedulerJobs.map((job) => (
                  <div key={job.key} className="grid gap-4 px-4 py-3 md:grid-cols-[minmax(0,1fr)_160px_120px] md:items-center">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant={SCHEDULER_STATUS_BADGE[job.status]}>{job.status}</Badge>
                        <Badge variant="info">{job.module}</Badge>
                        <span className="text-xs text-slate-500">{job.cadence}</span>
                      </div>
                      <p className="truncate text-sm font-medium text-slate-200">{job.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{job.description}</p>
                    </div>
                    <p className="truncate text-xs text-slate-500">{job.key}</p>
                    <button
                      onClick={() => runScheduler.mutate(job.key)}
                      disabled={runScheduler.isPending || job.status !== 'ACTIVE'}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Calistir
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900/40">
            {loadingSchedulerRuns ? (
              <div className="p-6 text-sm text-slate-500">Scheduler gecmisi yukleniyor...</div>
            ) : schedulerRuns.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">Henuz scheduler calismasi bulunmuyor.</div>
            ) : (
              <div className="divide-y divide-slate-800">
                {schedulerRuns.map((execution) => (
                  <div key={execution.id} className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_130px_160px] md:items-center">
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant={EXECUTION_BADGE[execution.status]}>{execution.status}</Badge>
                        <Badge variant="neutral">{execution.entityId ?? '-'}</Badge>
                      </div>
                      <p className="truncate font-medium text-slate-200">Scheduler job calismasi</p>
                      {execution.error && <p className="mt-1 truncate text-xs text-red-300">{execution.error}</p>}
                    </div>
                    <div className="text-xs text-slate-500">
                      <p>Deneme: {execution.attempt}</p>
                      <p>{execution.entityType ?? '-'}</p>
                    </div>
                    <div className="text-xs text-slate-500 md:text-right">
                      <p>Baslangic: {formatDateTime(execution.startedAt)}</p>
                      <p>Bitis: {formatDateTime(execution.completedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
