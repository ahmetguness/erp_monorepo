'use client';

import { ArrowRight, FileSignature, Receipt, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type SalesFlowStage = 'quote' | 'order' | 'invoice';

interface SalesConversionFlowCardProps {
  stage: SalesFlowStage;
  invoiceHref?: string;
  compact?: boolean;
}

const FLOW_STEPS: Array<{ key: SalesFlowStage; label: string; icon: typeof FileSignature }> = [
  { key: 'quote', label: 'Teklif', icon: FileSignature },
  { key: 'order', label: 'Siparis', icon: ShoppingCart },
  { key: 'invoice', label: 'Fatura', icon: Receipt },
];

export function SalesConversionFlowCard({ stage, invoiceHref = '/dashboard/invoices/new', compact = false }: SalesConversionFlowCardProps) {
  const activeIndex = FLOW_STEPS.findIndex((step) => step.key === stage);

  return (
    <section className={cn(
      'rounded-xl border border-sky-500/15 bg-slate-900 p-4',
      compact ? 'space-y-3' : 'mb-4 space-y-4',
    )}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Satis akisi</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Tekliften siparise, siparisten faturaya tek akis uzerinden ilerleyin.
          </p>
        </div>
        <Link
          href={invoiceHref}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-400"
        >
          <Receipt className="h-3.5 w-3.5" />
          Hizli Fatura
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {FLOW_STEPS.map((step, index) => {
          const Icon = step.icon;
          const isDone = index < activeIndex;
          const isActive = index === activeIndex;

          return (
            <div
              key={step.key}
              className={cn(
                'flex min-h-16 items-center justify-between rounded-lg border px-3 py-2',
                isActive
                  ? 'border-sky-500/30 bg-sky-500/10 text-sky-200'
                  : isDone
                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                    : 'border-slate-800 bg-slate-950/40 text-slate-500',
              )}
            >
              <div className="min-w-0">
                <Icon className="mb-1 h-4 w-4" />
                <p className="truncate text-xs font-semibold">{step.label}</p>
              </div>
              {index < FLOW_STEPS.length - 1 && <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-60" />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
