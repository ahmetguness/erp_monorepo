'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, TrendingUp } from 'lucide-react';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { useCustomerTrackingDashboard } from '@/hooks/useContacts';
import type { CustomerTrackingRow } from '@/services/contact.service';

const TYPE_LABEL: Record<CustomerTrackingRow['contact']['type'], string> = {
  CUSTOMER: 'Müşteri',
  SUPPLIER: 'Tedarikçi',
  BOTH: 'Müşteri + Tedarikçi',
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
      <span className="block truncate text-xs font-medium text-slate-200 group-hover:text-sky-300 transition-colors">
        {label}
      </span>
      <span className="block truncate text-[11px] text-slate-500 tabular-nums">
        {formatCurrency(amount)}
      </span>
    </Link>
  );
}

function EmptyDocument({ label }: { label: string }) {
  return (
    <div className="min-w-0">
      <span className="block truncate text-xs text-slate-600">—</span>
      <span className="block text-[11px] text-slate-600 truncate">{label} yok</span>
    </div>
  );
}

function CustomerRow({ row }: { row: CustomerTrackingRow }) {
  const isReceivable = row.openBalance > 0;
  const isPayable = row.openBalance < 0;
  const balanceTone = isReceivable
    ? 'text-emerald-400'
    : isPayable
    ? 'text-rose-400'
    : 'text-slate-500';

  return (
    <div className="grid grid-cols-1 gap-2 border-b border-slate-800/40 px-3.5 py-2 text-xs md:grid-cols-[1.3fr_1fr_1fr_1.1fr_0.8fr] md:items-center hover:bg-slate-800/25 transition-colors">
      <div className="min-w-0">
        <Link
          href={`/dashboard/contacts/${row.contact.id}`}
          className="truncate font-medium text-slate-200 hover:text-sky-300 block text-xs"
        >
          {row.contact.name}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          <span className="text-slate-400">{TYPE_LABEL[row.contact.type]}</span>
          {row.contact.phone && <span>• {row.contact.phone}</span>}
          {row.contact.email && <span className="truncate max-w-[160px]">• {row.contact.email}</span>}
        </div>
      </div>

      <div className="min-w-0">
        {row.lastQuote ? (
          <DocumentLink
            href={`/dashboard/sales-orders/quotes/${row.lastQuote.id}`}
            label={row.lastQuote.number}
            amount={row.lastQuote.totalGross}
          />
        ) : (
          <EmptyDocument label="Son teklif" />
        )}
      </div>

      <div className="min-w-0">
        {row.lastInvoice ? (
          <DocumentLink
            href={`/dashboard/invoices/${row.lastInvoice.id}`}
            label={row.lastInvoice.number}
            amount={row.lastInvoice.totalGross}
          />
        ) : (
          <EmptyDocument label="Son fatura" />
        )}
      </div>

      <div className="min-w-0">
        {row.upcomingCollection ? (
          <Link href="/dashboard/collection-reminders" className="group block min-w-0">
            <span className="block truncate text-xs font-medium text-amber-300/90 group-hover:text-amber-200 transition-colors">
              {formatDate(row.upcomingCollection.dueDate)}
            </span>
            <span className="block truncate text-[11px] text-slate-500 tabular-nums">
              {formatCurrency(row.upcomingCollection.amount)}
              {row.upcomingCollection.invoiceNumber ? ` (${row.upcomingCollection.invoiceNumber})` : ''}
            </span>
          </Link>
        ) : (
          <EmptyDocument label="Yaklaşan tahsilat" />
        )}
      </div>

      <div className="md:text-right">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 md:hidden mr-1">
          Açık Bakiye:
        </span>
        <span className={cn('text-xs font-semibold tabular-nums', balanceTone)}>
          {formatCurrency(Math.abs(row.openBalance))}
        </span>
      </div>
    </div>
  );
}

interface CustomerTrackingPanelProps {
  defaultExpanded?: boolean;
}

export function CustomerTrackingPanel({ defaultExpanded = false }: CustomerTrackingPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { data, isLoading } = useCustomerTrackingDashboard(8);
  const rows = data?.rows ?? [];
  const summary = data?.summary;
  const openBalanceTotal = summary?.openBalanceTotal ?? 0;
  const openBalanceTone = openBalanceTotal >= 0 ? 'text-emerald-400' : 'text-rose-400';

  return (
    <section className="mb-3 overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/60 transition-colors">
      <div className="flex flex-col gap-2.5 px-3.5 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-200">Müşteri Takibi</h2>
          <span className="text-xs text-slate-500 hidden lg:inline">
            — Son teklif, fatura, açık bakiye ve yaklaşan tahsilatlar
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>
              Müşteri: <strong className="font-semibold text-slate-200">{summary?.customerCount ?? 0}</strong>
            </span>
            <span className="text-slate-700 hidden sm:inline">•</span>
            <span>
              Açık Bakiye: <strong className="font-semibold text-slate-200">{summary?.contactsWithOpenBalance ?? 0} cari</strong>
            </span>
            <span className="text-slate-700 hidden sm:inline">•</span>
            <span>
              Net: <strong className={cn('font-semibold tabular-nums', openBalanceTone)}>{formatCurrency(Math.abs(openBalanceTotal))}</strong>
            </span>
            <span className="text-slate-700 hidden sm:inline">•</span>
            <span>
              Yaklaşan: <strong className="font-semibold text-amber-400 tabular-nums">{formatCurrency(summary?.upcomingCollectionTotal ?? 0)}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-slate-800 bg-slate-950/40 px-2.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-700 hover:text-white"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span>{expanded ? 'Daralt' : 'Detay'}</span>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-800/80">
          <div className="hidden grid-cols-[1.3fr_1fr_1fr_1.1fr_0.8fr] bg-slate-950/40 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 md:grid">
            <span>Cari</span>
            <span>Son Teklif</span>
            <span>Son Fatura</span>
            <span>Yaklaşan Tahsilat</span>
            <span className="text-right">Açık Bakiye</span>
          </div>

          {rows.length > 0 ? (
            <div>
              {rows.map((row) => (
                <CustomerRow key={row.contact.id} row={row} />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-xs text-slate-500">
              <TrendingUp className="h-4 w-4" />
              <span>{isLoading ? 'Müşteri özeti yükleniyor…' : 'Takip edilecek müşteri hareketi yok'}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
