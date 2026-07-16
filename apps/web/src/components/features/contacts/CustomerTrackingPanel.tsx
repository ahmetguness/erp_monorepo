'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronDown, ChevronUp, FileSignature, Receipt, TrendingUp, Users } from 'lucide-react';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { useCustomerTrackingDashboard } from '@/hooks/useContacts';
import type { CustomerTrackingRow } from '@/services/contact.service';

const TYPE_LABEL: Record<CustomerTrackingRow['contact']['type'], string> = {
  CUSTOMER: 'Müşteri',
  SUPPLIER: 'Tedarikçi',
  BOTH: 'Müşteri/Tedarikçi',
};

function DocumentLink({
  href,
  label,
  amount,
}: {
  href: string;
  label: string;
  amount: number;
}) {
  return (
    <Link href={href} className="group block min-w-0">
      <span className="block truncate text-xs font-semibold text-slate-200 group-hover:text-sky-300">{label}</span>
      <span className="block truncate text-[11px] text-slate-500">{formatCurrency(amount)}</span>
    </Link>
  );
}

function EmptyDocument({ label }: { label: string }) {
  return (
    <div className="min-w-0">
      <span className="block truncate text-xs text-slate-600">{label}</span>
      <span className="block text-[11px] text-slate-700">Kayıt yok</span>
    </div>
  );
}

function CustomerRow({ row }: { row: CustomerTrackingRow }) {
  const balanceTone = row.openBalance > 0 ? 'text-emerald-400' : row.openBalance < 0 ? 'text-red-400' : 'text-slate-500';

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-slate-800/70 px-4 py-3 md:grid-cols-[1.3fr_1fr_1fr_1fr_0.8fr] md:items-center">
      <div className="min-w-0">
        <Link href={`/dashboard/contacts/${row.contact.id}`} className="truncate text-sm font-semibold text-white hover:text-sky-300">
          {row.contact.name}
        </Link>
        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
          <span>{TYPE_LABEL[row.contact.type]}</span>
          {row.contact.phone && <span>{row.contact.phone}</span>}
          {row.contact.email && <span className="truncate">{row.contact.email}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <FileSignature className="h-4 w-4 shrink-0 text-violet-400" />
        {row.lastQuote ? (
          <DocumentLink href={`/dashboard/sales-orders/quotes/${row.lastQuote.id}`} label={row.lastQuote.number} amount={row.lastQuote.totalGross} />
        ) : (
          <EmptyDocument label="Son teklif" />
        )}
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <Receipt className="h-4 w-4 shrink-0 text-sky-400" />
        {row.lastInvoice ? (
          <DocumentLink href={`/dashboard/invoices/${row.lastInvoice.id}`} label={row.lastInvoice.number} amount={row.lastInvoice.totalGross} />
        ) : (
          <EmptyDocument label="Son fatura" />
        )}
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <CalendarClock className="h-4 w-4 shrink-0 text-amber-400" />
        {row.upcomingCollection ? (
          <Link href="/dashboard/collection-reminders" className="group min-w-0">
            <span className="block truncate text-xs font-semibold text-slate-200 group-hover:text-amber-300">
              {formatDate(row.upcomingCollection.dueDate)}
            </span>
            <span className="block truncate text-[11px] text-slate-500">
              {formatCurrency(row.upcomingCollection.amount)}
              {row.upcomingCollection.invoiceNumber ? ` / ${row.upcomingCollection.invoiceNumber}` : ''}
            </span>
          </Link>
        ) : (
          <EmptyDocument label="Yaklaşan tahsilat" />
        )}
      </div>

      <div className="md:text-right">
        <span className="text-[11px] text-slate-500">Açık bakiye</span>
        <p className={cn('text-sm font-bold tabular-nums', balanceTone)}>{formatCurrency(Math.abs(row.openBalance))}</p>
      </div>
    </div>
  );
}

interface CustomerTrackingPanelProps {
  defaultExpanded?: boolean;
}

export function CustomerTrackingPanel({ defaultExpanded = true }: CustomerTrackingPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { data, isLoading } = useCustomerTrackingDashboard(8);
  const rows = data?.rows ?? [];
  const summary = data?.summary;
  const openBalanceTotal = summary?.openBalanceTotal ?? 0;
  const openBalanceTone = openBalanceTotal >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <section className="mb-4 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-lg ring-1 ring-white/[0.03]">
      <div className="flex flex-col gap-3 border-b border-slate-800/80 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-sky-400" />
            <h2 className="text-sm font-semibold text-white">Müşteri takip panosu</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">Son teklif, son fatura, açık bakiye ve yaklaşan tahsilatları tek ekranda izleyin.</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2">
              <p className="text-[10px] text-slate-500">Müşteri</p>
              <p className="text-sm font-bold text-white">{summary?.customerCount ?? 0}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2">
              <p className="text-[10px] text-slate-500">Açık bakiye</p>
              <p className="text-sm font-bold text-slate-200">{summary?.contactsWithOpenBalance ?? 0}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2">
              <p className="text-[10px] text-slate-500">Net bakiye</p>
              <p className={cn('text-sm font-bold', openBalanceTone)}>{formatCurrency(Math.abs(openBalanceTotal))}</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950/35 px-3 py-2">
              <p className="text-[10px] text-slate-500">Yaklaşan</p>
              <p className="text-sm font-bold text-amber-400">{formatCurrency(summary?.upcomingCollectionTotal ?? 0)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/40 px-3 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700 hover:text-white"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? 'Daralt' : 'Detay'}
          </button>
        </div>
      </div>

      {expanded && rows.length > 0 ? (
        <div>
          {rows.map((row) => <CustomerRow key={row.contact.id} row={row} />)}
        </div>
      ) : expanded ? (
        <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500">
          <TrendingUp className="h-4 w-4" />
          {isLoading ? 'Müşteri özeti yükleniyor' : 'Takip edilecek müşteri hareketi yok'}
        </div>
      ) : null}
    </section>
  );
}
