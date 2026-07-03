'use client';

import { useMemo, useState } from 'react';
import {
  Clock,
  Key,
  RefreshCw,
  Search,
  Copy,
  Check,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { useContacts } from '@/hooks/useContacts';
import { useServiceRequests } from '@/hooks/useService';
import {
  usePortalToken,
  useGeneratePortalToken,
  useRunSlaSweep,
} from '@/hooks/useSettings';
import { formatDateTime } from '@/lib/utils';
import { useUIStore } from '@/store/ui.store';

// Helper component to manage portal token generation per contact
function ContactTokenActions({ contactId }: { contactId: string }) {
  const { data: tokenData, isLoading } = usePortalToken(contactId);
  const generateToken = useGeneratePortalToken(contactId);
  const { toast } = useUIStore();
  const [copied, setCopied] = useState(false);

  const token = tokenData?.token;

  const handleCopy = () => {
    if (!token) return;
    navigator.clipboard.writeText(token);
    setCopied(true);
    toast.success('Token kopyalandı.');
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return <span className="text-xs text-slate-500">Yükleniyor...</span>;
  }

  return (
    <div className="flex items-center gap-2">
      {token ? (
        <>
          <code className="rounded bg-slate-900 px-2 py-1 text-xs font-mono text-emerald-400">
            {token.slice(0, 10)}...
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            leftIcon={copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          >
            {copied ? 'Kopyalandı' : 'Kopyala'}
          </Button>
          <Button
            size="sm"
            variant="danger"
            loading={generateToken.isPending}
            onClick={() => generateToken.mutate()}
          >
            Yenile
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          variant="primary"
          loading={generateToken.isPending}
          onClick={() => generateToken.mutate()}
          leftIcon={<Key className="h-3 w-3" />}
        >
          Token Üret
        </Button>
      )}
    </div>
  );
}

export default function PortalSettingsPage() {
  const [activeTab, setActiveTab] = useState<'sla' | 'portal'>('sla');
  const [contactSearch, setContactSearch] = useState('');
  const [contactPage, setContactPage] = useState(1);

  // Queries
  const { data: contactsData, isLoading: isLoadingContacts } = useContacts({
    page: contactPage,
    limit: 10,
    search: contactSearch || undefined,
  });

  const { data: requestsData, isLoading: isLoadingRequests, refetch: refetchRequests } = useServiceRequests({
    page: 1,
    limit: 50,
  });

  const runSweep = useRunSlaSweep();

  // Handle manual SLA check
  const handleSlaSweep = async () => {
    await runSweep.mutateAsync();
    refetchRequests();
  };

  // Contacts columns
  const contactColumns = useMemo<ColumnDef<any>[]>(() => [
    {
      key: 'code',
      header: 'Cari Kod',
      width: '120px',
      render: (row) => <span className="text-xs font-mono text-slate-400">{row.code || '-'}</span>,
    },
    {
      key: 'name',
      header: 'Müşteri Adı',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-200">{row.name}</p>
          <p className="text-xs text-slate-500">{row.email || '-'}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Tip',
      width: '100px',
      render: (row) => <Badge variant={row.type === 'CUSTOMER' ? 'info' : 'neutral'}>{row.type}</Badge>,
    },
    {
      key: 'actions',
      header: 'Portal Bağlantısı',
      width: '300px',
      align: 'right',
      render: (row) => <ContactTokenActions contactId={row.id} />,
    },
  ], []);

  // Requests / SLA columns
  const requestColumns = useMemo<ColumnDef<any>[]>(() => [
    {
      key: 'number',
      header: 'Talep No',
      width: '120px',
      render: (row) => <span className="text-xs font-mono font-medium text-slate-300">{row.number}</span>,
    },
    {
      key: 'subject',
      header: 'Konu & Müşteri',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-200">{row.subject}</p>
          <p className="text-xs text-slate-500">{row.contact?.name || 'Müşteri atanmamış'}</p>
        </div>
      ),
    },
    {
      key: 'priority',
      header: 'Öncelik',
      width: '100px',
      render: (row) => {
        const variants: Record<string, BadgeVariant> = {
          CRITICAL: 'danger',
          HIGH: 'warning',
          MEDIUM: 'info',
          LOW: 'neutral',
        };
        return <Badge variant={variants[row.priority] || 'neutral'}>{row.priority}</Badge>;
      },
    },
    {
      key: 'status',
      header: 'Durum',
      width: '120px',
      render: (row) => {
        const variants: Record<string, BadgeVariant> = {
          OPEN: 'info',
          IN_PROGRESS: 'warning',
          COMPLETED: 'success',
          CANCELLED: 'danger',
        };
        return <Badge variant={variants[row.status] || 'neutral'}>{row.status}</Badge>;
      },
    },
    {
      key: 'sla',
      header: 'SLA Durumu',
      width: '240px',
      render: (row) => {
        if (!row.sla) return <span className="text-xs text-slate-500">-</span>;
        const { isBreached, remainingMinutes, targetDate } = row.sla;
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Badge variant={isBreached ? 'danger' : 'success'}>
                {isBreached ? 'SLA İHLALİ' : 'SLA UYGUN'}
              </Badge>
              {['COMPLETED', 'CANCELLED'].includes(row.status) ? (
                <span className="text-[10px] text-slate-500">Çözüldü</span>
              ) : (
                <span className={`text-[10px] tabular-nums ${isBreached ? 'text-rose-400 font-medium' : 'text-slate-400'}`}>
                  {isBreached
                    ? `${Math.abs(remainingMinutes)} dk aşıldı`
                    : `${remainingMinutes} dk kaldı`}
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500 tabular-nums">
              Hedef: {formatDateTime(targetDate)}
            </p>
          </div>
        );
      },
    },
  ], []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Müşteri Portalı & SLA"
        subtitle="Müşteri bilet portal yetkilendirmesi, gerçek zamanlı SLA takipleri ve ihlal sweeps yönetimi."
      />

      {/* Tabs */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab('sla')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'sla'
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="h-4 w-4" />
          SLA & Servis Takip
        </button>
        <button
          onClick={() => setActiveTab('portal')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'portal'
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Key className="h-4 w-4" />
          Müşteri Portal Yetkileri
        </button>
      </div>

      {activeTab === 'sla' && (
        <div className="space-y-4">
          {/* SLA Overview */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">SLA Kuralları</span>
                <Clock className="h-4 w-4 text-sky-400" />
              </div>
              <div className="mt-2 space-y-1">
                <p className="text-xs text-slate-300">
                  <span className="font-semibold text-rose-400">Critical:</span> 2 Saat
                </p>
                <p className="text-xs text-slate-300">
                  <span className="font-semibold text-amber-400">High:</span> 4 Saat
                </p>
                <p className="text-xs text-slate-300">
                  <span className="font-semibold text-sky-400">Medium:</span> 24 Saat
                </p>
                <p className="text-xs text-slate-300">
                  <span className="font-semibold text-slate-400">Low:</span> 72 Saat
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex flex-col justify-between">
              <div>
                <span className="text-xs text-slate-400">SLA Sweeper</span>
                <p className="mt-1 text-xs text-slate-500">
                  Açık servis taleplerini denetler ve ihlalleri sistem denetim kayıtlarına işler.
                </p>
              </div>
              <Button
                className="mt-3 w-full justify-center"
                leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                loading={runSweep.isPending}
                onClick={handleSlaSweep}
              >
                SLA Denetimi Çalıştır
              </Button>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex flex-col justify-between">
              <div>
                <span className="text-xs text-slate-400">Portal API Endpoint</span>
                <p className="mt-1 text-xs text-slate-500 font-mono break-all">
                  GET /api/portal/v1/requests
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  Headers: X-Contact-Id, X-Portal-Token
                </p>
              </div>
              <a
                href="/api/portal/v1/requests"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center justify-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 hover:underline"
              >
                Portal API Test Et <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          {/* Active tickets */}
          <section className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4 space-y-4">
            <h2 className="text-sm font-semibold text-slate-100">Servis Talepleri & SLA Durumları</h2>
            <DataTable
              columns={requestColumns}
              data={requestsData?.data ?? []}
              keyExtractor={(row) => row.id}
              isLoading={isLoadingRequests}
              emptyTitle="Aktif servis talebi bulunamadı."
            />
          </section>
        </div>
      )}

      {activeTab === 'portal' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex gap-3 items-start">
            <ShieldAlert className="h-5 w-5 text-sky-400 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Müşteri Portalı Yetkilendirme Kılavuzu</h3>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                Müşterilerinizin kendi sistemleri üzerinden bilet (servis talebi) açması ve bilet durumlarını
                takip etmesi için özel tokenlar üretebilirsiniz. Portal çağrıları güvenli bir şekilde
                müşteri bazlı sınırlandırılmaktadır.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Müşteri ara..."
                className="w-full rounded-lg border border-slate-700 bg-slate-800 pl-9 pr-4 py-1.5 text-sm text-slate-300 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                value={contactSearch}
                onChange={(e) => {
                  setContactSearch(e.target.value);
                  setContactPage(1);
                }}
              />
            </div>
          </div>

          <DataTable
            columns={contactColumns}
            data={contactsData?.data ?? []}
            keyExtractor={(row) => row.id}
            isLoading={isLoadingContacts}
            emptyTitle="Müşteri bulunamadı."
            pagination={
              contactsData
                ? {
                    page: contactPage,
                    pageSize: 10,
                    total: contactsData.meta.total,
                    totalPages: contactsData.meta.totalPages,
                    onChange: setContactPage,
                  }
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
