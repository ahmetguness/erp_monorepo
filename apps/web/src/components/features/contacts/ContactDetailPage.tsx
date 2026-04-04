'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, Phone, Mail, Globe, MapPin } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { ActiveBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useContact, useDeleteContact, useAccountEntries } from '@/hooks/useContacts';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { AccountEntry } from '@/services/contact.service';

// ─────────────────────────────────────────────
// Info row helper
// ─────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <span className="text-xs text-slate-500 w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-300">{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

interface Props { id: string }

export function ContactDetailPage({ id }: Props) {
  const router = useRouter();
  const { data: contact, isLoading } = useContact(id);
  const deleteContact = useDeleteContact();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [entryPage, setEntryPage] = useState(1);

  const { data: entriesData, isLoading: loadingEntries } = useAccountEntries(id, { page: entryPage, limit: 20 });

  const entryColumns: ColumnDef<AccountEntry>[] = [
    { key: 'date', header: 'Tarih', width: '110px', render: (r) => <span className="text-slate-400">{formatDate(r.date)}</span> },
    { key: 'description', header: 'Açıklama', render: (r) => <span className="text-slate-300">{r.description ?? '—'}</span> },
    { key: 'debit', header: 'Borç', width: '120px', align: 'right', render: (r) => r.debit > 0 ? <span className="text-red-400">{formatCurrency(r.debit)}</span> : <span className="text-slate-600">—</span> },
    { key: 'credit', header: 'Alacak', width: '120px', align: 'right', render: (r) => r.credit > 0 ? <span className="text-emerald-400">{formatCurrency(r.credit)}</span> : <span className="text-slate-600">—</span> },
    { key: 'balance', header: 'Bakiye', width: '120px', align: 'right', render: (r) => <span className={r.balance >= 0 ? 'text-slate-200 font-medium' : 'text-red-400 font-medium'}>{formatCurrency(r.balance)}</span> },
  ];

  if (isLoading) return <FullPageSpinner />;
  if (!contact) return <div className="text-slate-400 text-sm">Cari hesap bulunamadı.</div>;

  const TYPE_LABELS = { CUSTOMER: 'Müşteri', SUPPLIER: 'Tedarikçi', BOTH: 'Her İkisi' };
  const TYPE_VARIANTS = { CUSTOMER: 'info', SUPPLIER: 'warning', BOTH: 'purple' } as const;

  return (
    <div className="space-y-6">
      <PageHeader
        title={contact.name}
        subtitle={contact.code ?? undefined}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" leftIcon={<Pencil className="w-4 h-4" />} onClick={() => router.push(`/dashboard/contacts/${id}/edit`)}>
              Düzenle
            </Button>
            <Button variant="danger" leftIcon={<Trash2 className="w-4 h-4" />} onClick={() => setDeleteOpen(true)}>
              Sil
            </Button>
          </div>
        }
      />

      {/* Info card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-3 mb-4">
          <Badge variant={TYPE_VARIANTS[contact.type]}>{TYPE_LABELS[contact.type]}</Badge>
          <ActiveBadge isActive={contact.isActive} />
        </div>

        <InfoRow label="Vergi No" value={contact.taxNumber} />
        <InfoRow label="Vergi Dairesi" value={contact.taxOffice} />
        <InfoRow label="E-posta" value={contact.email && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-slate-500" />{contact.email}</span>} />
        <InfoRow label="Telefon" value={contact.phone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-500" />{contact.phone}</span>} />
        <InfoRow label="Website" value={contact.website && <span className="flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-slate-500" />{contact.website}</span>} />
        <InfoRow label="Adres" value={contact.address && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-500" />{[contact.address, contact.city, contact.country].filter(Boolean).join(', ')}</span>} />
        <InfoRow label="Kredi Limiti" value={contact.creditLimit != null ? formatCurrency(contact.creditLimit) : null} />
        <InfoRow label="Ödeme Vadesi" value={contact.paymentTermDays != null ? `${contact.paymentTermDays} gün` : null} />
        {contact.notes && <InfoRow label="Notlar" value={contact.notes} />}
      </div>

      {/* Account entries */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">Hesap Hareketleri</h2>
        <DataTable
          columns={entryColumns}
          data={entriesData?.data ?? []}
          keyExtractor={(r) => r.id}
          isLoading={loadingEntries}
          emptyTitle="Henüz hareket yok"
          pagination={entriesData ? { page: entryPage, pageSize: 20, total: entriesData.meta.total, totalPages: entriesData.meta.totalPages, onChange: setEntryPage } : undefined}
        />
      </div>

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteContact.mutate(id, { onSuccess: () => router.push('/dashboard/contacts') })}
        message={`"${contact.name}" cari hesabını silmek istediğinize emin misiniz?`}
        isLoading={deleteContact.isPending}
      />
    </div>
  );
}
