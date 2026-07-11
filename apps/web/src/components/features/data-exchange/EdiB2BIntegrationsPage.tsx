'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowLeftRight, CheckCircle2, Clock3, FileCheck, FileText, Link2, Map, RotateCcw, ShieldAlert, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { FeatureGate } from '@/components/shared/FeatureGate';
import { PageHeader } from '@/components/shared/PageHeader';
import { useCreateEdiB2BRetryTask, useEdiB2BHub } from '@/hooks/useDataExchange';
import type { EdiB2BExchangeStatus, EdiB2BSlaStatus } from '@/services/data-exchange.service';

const STATUS_VARIANT: Record<EdiB2BExchangeStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  ready: 'success',
  draft: 'warning',
  in_progress: 'info',
  completed: 'neutral',
  blocked: 'danger',
};

const SLA_VARIANT: Record<EdiB2BSlaStatus, 'success' | 'warning' | 'danger'> = {
  ok: 'success',
  warning: 'warning',
  breached: 'danger',
};

const DOCUMENT_LABELS = {
  sales_order: 'Satis siparisi',
  purchase_order: 'Satinalma siparisi',
  delivery_note: 'Irsaliye',
  invoice: 'Fatura',
} as const;

const ISSUE_LABELS: Record<string, string> = {
  partner_code_missing: 'Cari kodu eksik',
  tax_number_missing: 'Vergi no eksik',
  edi_email_missing: 'EDI e-posta eksik',
  partner_missing: 'Cari baglantisi yok',
  document_draft: 'Dokuman taslak',
  document_blocked: 'Dokuman bloke',
  sla_breached: 'SLA asildi',
};

const RETRY_ACTION_LABELS: Record<string, string> = {
  complete_partner_mapping: 'Mapping tamamla',
  approve_or_complete_document: 'Dokumani tamamla',
  review_blocked_document: 'Blokaj incele',
  retry_exchange: 'Tekrar dene',
};

function formatCurrency(value: number | null): string {
  if (value === null) return '-';
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('tr-TR');
}

function formatSlaMinutes(value: number): string {
  if (value < 0) return `${Math.abs(value)} dk gecikti`;
  if (value < 60) return `${value} dk kaldi`;
  return `${Math.round(value / 60)} sa kaldi`;
}

export function EdiB2BIntegrationsPage() {
  const hub = useEdiB2BHub();
  const retryTask = useCreateEdiB2BRetryTask();
  const data = hub.data;

  return (
    <FeatureGate plan="ENTERPRISE">
      <div>
        <PageHeader
          title="EDI / B2B Entegrasyonlari"
          subtitle="Buyuk musteri ve tedarikcilerle siparis, irsaliye ve fatura alisverisini tek noktadan izle."
          action={
            <Link
              href="/dashboard/api-keys"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950/20 px-3.5 text-sm font-medium text-slate-300 transition-all duration-150 hover:border-slate-500 hover:text-white"
            >
              <Link2 className="h-4 w-4" />
              API anahtarlari
            </Link>
          }
        />

        {hub.isLoading ? (
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-28 animate-pulse rounded-lg bg-slate-800/60" />)}
          </div>
        ) : !data ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-500">
            EDI / B2B ozeti alinamadi.
          </div>
        ) : (
          <div className="space-y-5">
            <section className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <p className="text-xs text-slate-500">Aktif partner</p>
                <p className="mt-2 text-2xl font-semibold text-slate-100">{data.summary.partnerCount}</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <p className="text-xs text-slate-500">Hazir dokuman</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-200">{data.summary.readyDocumentCount}</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <p className="text-xs text-slate-500">Bloke / taslak</p>
                <p className="mt-2 text-2xl font-semibold text-amber-200">{data.summary.blockedDocumentCount}</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <p className="text-xs text-slate-500">Esleme uyarisi</p>
                <p className="mt-2 text-2xl font-semibold text-rose-200">{data.summary.issueCount}</p>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Map className="h-4 w-4 text-violet-300" />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-200">Partner bazli mapping</h2>
                    <p className="mt-1 text-xs text-slate-500">Kurumsal partnerler icin zorunlu alanlar ve desteklenen dokuman tipleri.</p>
                  </div>
                </div>
                <div className="grid gap-2 lg:grid-cols-2">
                  {data.partnerMappings.length === 0 ? (
                    <p className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-500">Mapping icin partner bulunamadi.</p>
                  ) : data.partnerMappings.slice(0, 6).map((mapping) => (
                    <div key={mapping.contactId} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-200">{mapping.partnerName}</p>
                          <p className="mt-1 text-xs text-slate-500">{mapping.partnerCode ?? 'Partner kodu yok'}</p>
                        </div>
                        <Badge variant={mapping.mappingStatus === 'complete' ? 'success' : mapping.mappingStatus === 'partial' ? 'warning' : 'danger'}>
                          {mapping.mappedFieldCount}/{mapping.requiredFieldCount}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {mapping.supportedDocumentTypes.map((documentType) => (
                          <Badge key={documentType} variant="neutral">{DOCUMENT_LABELS[documentType]}</Badge>
                        ))}
                      </div>
                      {mapping.missingFields.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {mapping.missingFields.map((field) => (
                            <Badge key={field} variant="warning">{ISSUE_LABELS[field] ?? field}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-cyan-300" />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-200">SLA takibi</h2>
                    <p className="mt-1 text-xs text-slate-500">Acik B2B dokumanlar icin servis seviyesi.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <p className="text-xs text-slate-500">Takipte</p>
                    <p className="mt-1 text-xl font-semibold text-slate-100">{data.sla.trackedCount}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <p className="text-xs text-slate-500">Ortalama yas</p>
                    <p className="mt-1 text-xl font-semibold text-slate-100">{data.sla.averageAgeHours} sa</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <p className="text-xs text-slate-500">Uyari</p>
                    <p className="mt-1 text-xl font-semibold text-amber-200">{data.sla.warningCount}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <p className="text-xs text-slate-500">SLA asimi</p>
                    <p className="mt-1 text-xl font-semibold text-rose-200">{data.sla.breachedCount}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-200">Dokuman akislari</h2>
                    <p className="mt-1 text-xs text-slate-500">Siparis, irsaliye ve fatura mesajlari icin endpoint ve hazirlik durumu.</p>
                  </div>
                  <Badge variant="neutral">{formatDate(data.generatedAt)}</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {data.documentFlows.map((flow) => (
                    <div key={flow.key} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            {flow.key === 'delivery_note' ? <Truck className="h-4 w-4 text-sky-300" /> : <FileText className="h-4 w-4 text-sky-300" />}
                            <h3 className="text-sm font-semibold text-slate-200">{flow.title}</h3>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">{flow.endpoint.startsWith('mapping_required:') ? 'Partner mapping gerekli' : flow.endpoint}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{flow.note}</p>
                        </div>
                        <Badge variant={flow.status === 'configured' ? 'success' : 'warning'}>{flow.format}</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="info">{flow.direction}</Badge>
                        <Badge variant="neutral">{flow.scope}</Badge>
                        <Badge variant={flow.blockedCount > 0 ? 'warning' : 'success'}>{flow.readyCount} hazir</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <ArrowLeftRight className="h-4 w-4 text-cyan-300" />
                  <h2 className="text-sm font-semibold text-slate-200">Endpoint ornekleri</h2>
                </div>
                <div className="space-y-3">
                  {data.endpointExamples.map((example) => (
                    <div key={`${example.method}:${example.path}`} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={example.method === 'GET' ? 'info' : 'success'}>{example.method}</Badge>
                        <code className="truncate text-xs text-slate-300">{example.path}</code>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{example.description}</p>
                      <p className="mt-2 text-xs text-slate-400">{example.scope}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-300" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-200">Hata kuyrugu ve yeniden deneme</h2>
                  <p className="mt-1 text-xs text-slate-500">Mapping, taslak/blokaj ve SLA sorunlari icin operasyon kuyrugu.</p>
                </div>
              </div>
              <div className="overflow-auto rounded-lg border border-slate-800">
                <table className="min-w-full divide-y divide-slate-800 text-sm">
                  <thead className="bg-slate-950/60">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Dokuman</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Sorun</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Oncelik</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Aksiyon</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {data.errorQueue.map((item) => (
                      <tr key={item.itemKey}>
                        <td className="px-3 py-2">
                          <Link href={item.href} className="font-medium text-sky-300 hover:text-sky-200">
                            {item.documentNumber}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">{DOCUMENT_LABELS[item.documentType]} / {item.partnerName}</p>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1.5">
                            {item.issues.map((issue) => (
                              <Badge key={issue} variant="warning">{ISSUE_LABELS[issue] ?? issue}</Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={item.severity === 'high' ? 'danger' : 'warning'}>{item.severity}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                            disabled={!item.retryEligible}
                            loading={retryTask.isPending && retryTask.variables === item.itemKey}
                            onClick={() => retryTask.mutate(item.itemKey)}
                          >
                            {RETRY_ACTION_LABELS[item.retryAction] ?? 'Retry'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.errorQueue.length === 0 && (
                  <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
                    <FileCheck className="h-4 w-4" />
                    Hata kuyrugunda kayit yok.
                  </div>
                )}
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  <h2 className="text-sm font-semibold text-slate-200">Partner hazirligi</h2>
                </div>
                <div className="space-y-2">
                  {data.partners.length === 0 ? (
                    <p className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-500">Henuz B2B partner verisi yok.</p>
                  ) : data.partners.map((partner) => (
                    <div key={partner.contactId} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-200">{partner.name}</p>
                          <p className="mt-1 text-xs text-slate-500">{partner.code ?? 'Kod yok'} / {partner.type}</p>
                        </div>
                        <Badge variant={partner.status === 'active' ? 'success' : 'warning'}>{partner.documentCount} dokuman</Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {partner.directions.map((direction) => <Badge key={direction} variant="info">{direction}</Badge>)}
                        <Badge variant="neutral">{formatCurrency(partner.totalValue)}</Badge>
                        {partner.issues.map((issue) => (
                          <Badge key={issue} variant="warning">{ISSUE_LABELS[issue] ?? issue}</Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-300" />
                  <h2 className="text-sm font-semibold text-slate-200">Son B2B kuyrugu</h2>
                </div>
                <div className="overflow-auto rounded-lg border border-slate-800">
                  <table className="min-w-full divide-y divide-slate-800 text-sm">
                    <thead className="bg-slate-950/60">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Dokuman</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Partner</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Durum</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Tutar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {data.exchangeQueue.map((item) => (
                        <tr key={`${item.documentType}:${item.id}`}>
                          <td className="px-3 py-2">
                            <Link href={item.href} className="font-medium text-sky-300 hover:text-sky-200">
                              {item.number}
                            </Link>
                            <p className="mt-1 text-xs text-slate-500">{DOCUMENT_LABELS[item.documentType]} / {formatDate(item.documentDate)}</p>
                          </td>
                          <td className="px-3 py-2 text-slate-400">{item.partnerName}</td>
                          <td className="px-3 py-2">
                            <Badge variant={STATUS_VARIANT[item.status]}>{item.status}</Badge>
                            <div className="mt-1">
                              <Badge variant={SLA_VARIANT[item.slaStatus]}>{formatSlaMinutes(item.slaRemainingMinutes)}</Badge>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-400">{formatCurrency(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.exchangeQueue.length === 0 && (
                    <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
                      <FileCheck className="h-4 w-4" />
                      Kuyrukta dokuman yok.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </FeatureGate>
  );
}
