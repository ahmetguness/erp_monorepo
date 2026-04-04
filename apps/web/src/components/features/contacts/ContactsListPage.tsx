'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Phone, Mail } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { SearchInput } from '@/components/shared/SearchInput';
import { ActiveBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { useContacts } from '@/hooks/useContacts';
import type { Contact, ContactType } from '@/services/contact.service';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: '', label: 'Tümü' },
  { value: 'CUSTOMER', label: 'Müşteri' },
  { value: 'SUPPLIER', label: 'Tedarikçi' },
  { value: 'BOTH', label: 'Her İkisi' },
];

const TYPE_LABELS: Record<ContactType, string> = {
  CUSTOMER: 'Müşteri',
  SUPPLIER: 'Tedarikçi',
  BOTH: 'Her İkisi',
};

const TYPE_VARIANTS: Record<ContactType, 'info' | 'warning' | 'purple'> = {
  CUSTOMER: 'info',
  SUPPLIER: 'warning',
  BOTH: 'purple',
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function ContactsListPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [type, setType] = useState<ContactType | ''>('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useContacts({
    page,
    limit: 20,
    search: search || undefined,
    type: type || undefined,
  });

  const columns: ColumnDef<Contact>[] = [
    {
      key: 'name', header: 'Ad',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-200">{r.name}</p>
          {r.code && <p className="text-xs text-slate-500">{r.code}</p>}
        </div>
      ),
    },
    {
      key: 'type', header: 'Tip', width: '110px',
      render: (r) => <Badge variant={TYPE_VARIANTS[r.type]}>{TYPE_LABELS[r.type]}</Badge>,
    },
    {
      key: 'contact', header: 'İletişim',
      render: (r) => (
        <div className="flex flex-col gap-0.5">
          {r.email && <span className="flex items-center gap-1.5 text-xs text-slate-400"><Mail className="w-3 h-3" />{r.email}</span>}
          {r.phone && <span className="flex items-center gap-1.5 text-xs text-slate-400"><Phone className="w-3 h-3" />{r.phone}</span>}
        </div>
      ),
    },
    {
      key: 'taxNumber', header: 'Vergi No', width: '130px',
      render: (r) => <span className="text-sm text-slate-400">{r.taxNumber ?? '—'}</span>,
    },
    {
      key: 'isActive', header: 'Durum', width: '80px', align: 'center',
      render: (r) => <ActiveBadge isActive={r.isActive} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Cari Hesaplar"
        subtitle="Müşteri ve tedarikçilerinizi yönetin."
        action={
          <Button leftIcon={<Plus className="w-4 h-4" />} onClick={() => router.push('/dashboard/contacts/new')}>
            Yeni Cari
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Ad, kod, vergi no ara…" className="w-64" />
        <Select
          options={TYPE_OPTIONS}
          value={type}
          onChange={(e) => { setType(e.target.value as ContactType | ''); setPage(1); }}
          className="w-40"
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        onRowClick={(r) => router.push(`/dashboard/contacts/${r.id}`)}
        emptyTitle="Cari hesap bulunamadı"
        emptyDescription="Yeni bir cari hesap ekleyerek başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />
    </div>
  );
}
