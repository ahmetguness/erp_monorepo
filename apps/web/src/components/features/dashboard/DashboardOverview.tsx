'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, AlertTriangle, FileText, Users } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useCurrentUser } from '@/hooks/useAuth';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import { z } from 'zod';
import type { Invoice } from '@repo/types';

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

const RevenueSummarySchema = SingleResponseSchema(
  z.object({
    period: z.object({ from: z.string(), to: z.string() }),
    invoiceCount: z.number(),
    totalNet: z.number(),
    totalTax: z.number(),
    totalGross: z.number(),
  }),
);

const StockSummarySchema = SingleResponseSchema(
  z.object({
    summary: z.object({
      totalLines: z.number(),
      belowMinStockCount: z.number(),
      totalStockValue: z.number(),
    }),
    belowMinStock: z.array(z.object({
      productId: z.string(),
      productCode: z.string(),
      productName: z.string(),
      warehouseName: z.string(),
      quantity: z.number(),
      minStockLevel: z.number(),
    })),
    stockLevels: z.array(z.unknown()),
  }),
);

const InvoiceSchema = z.object({
  id: z.string(),
  number: z.string(),
  date: z.string(),
  status: z.string(),
  totalGross: z.number(),
  contact: z.object({ id: z.string(), name: z.string() }).optional(),
});

const InvoiceListSchema = PaginatedResponseSchema(InvoiceSchema);

// ─────────────────────────────────────────────
// Stat card
// ─────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}

function StatCard({ label, value, sub, icon, accent }: StatCardProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-slate-400">{label}</p>
        <div className={`p-2 rounded-lg ${accent}`}>{icon}</div>
      </div>
      <p className="text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  DRAFT:         'bg-slate-700 text-slate-300',
  SENT:          'bg-blue-500/20 text-blue-400',
  PAID:          'bg-emerald-500/20 text-emerald-400',
  PARTIALLY_PAID:'bg-amber-500/20 text-amber-400',
  OVERDUE:       'bg-red-500/20 text-red-400',
  CANCELLED:     'bg-slate-700 text-slate-500',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Taslak', SENT: 'Gönderildi', PAID: 'Ödendi',
  PARTIALLY_PAID: 'Kısmi', OVERDUE: 'Gecikmiş', CANCELLED: 'İptal',
};

// ─────────────────────────────────────────────
// Dashboard Overview
// ─────────────────────────────────────────────

export function DashboardOverview() {
  const { user, tenant } = useCurrentUser();

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const { data: revenueData } = useQuery({
    queryKey: ['reports', 'revenue', firstDay, lastDay],
    queryFn: async () => {
      const res = await apiClient.get('/api/reports/revenue-summary', {
        params: { dateFrom: firstDay, dateTo: lastDay },
      });
      return RevenueSummarySchema.parse(res.data).data;
    },
  });

  const { data: stockData } = useQuery({
    queryKey: ['reports', 'stock'],
    queryFn: async () => {
      const res = await apiClient.get('/api/reports/stock-summary');
      return StockSummarySchema.parse(res.data).data;
    },
  });

  const { data: invoicesData } = useQuery({
    queryKey: ['invoices', 'recent'],
    queryFn: async () => {
      const res = await apiClient.get('/api/invoices', {
        params: { limit: 5, page: 1 },
      });
      return InvoiceListSchema.parse(res.data);
    },
  });

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Günaydın';
    if (h < 18) return 'İyi günler';
    return 'İyi akşamlar';
  };

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-semibold text-white">
          {greeting()}, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {tenant?.companyName} — {new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Bu Ay Gelir"
          value={revenueData ? formatCurrency(revenueData.totalGross) : '—'}
          sub={revenueData ? `${revenueData.invoiceCount} fatura` : undefined}
          icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
          accent="bg-emerald-500/10"
        />
        <StatCard
          label="Kritik Stok"
          value={stockData ? String(stockData.summary.belowMinStockCount) : '—'}
          sub="Minimum altında ürün"
          icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
          accent="bg-amber-500/10"
        />
        <StatCard
          label="Son Faturalar"
          value={invoicesData ? String(invoicesData.meta.total) : '—'}
          sub="Toplam fatura"
          icon={<FileText className="w-4 h-4 text-sky-400" />}
          accent="bg-sky-500/10"
        />
        <StatCard
          label="Stok Değeri"
          value={stockData ? formatCurrency(stockData.summary.totalStockValue) : '—'}
          sub="Toplam envanter"
          icon={<Users className="w-4 h-4 text-violet-400" />}
          accent="bg-violet-500/10"
        />
      </div>

      {/* Recent invoices */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Son Faturalar</h2>
        </div>

        {!invoicesData || invoicesData.data.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            Henüz fatura bulunmuyor.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {invoicesData.data.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{inv.number}</p>
                  <p className="text-xs text-slate-500">{inv.contact?.name ?? '—'}</p>
                </div>
                <p className="text-xs text-slate-400 shrink-0">{formatDate(inv.date)}</p>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[inv.status] ?? 'bg-slate-700 text-slate-300'}`}>
                  {STATUS_LABELS[inv.status] ?? inv.status}
                </span>
                <p className="text-sm font-semibold text-white shrink-0 w-24 text-right">
                  {formatCurrency(inv.totalGross)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Critical stock alerts */}
      {stockData && stockData.belowMinStock.length > 0 && (
        <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-800/40 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-amber-300">Kritik Stok Uyarıları</h2>
          </div>
          <div className="divide-y divide-amber-800/20">
            {stockData.belowMinStock.slice(0, 5).map((item) => (
              <div key={item.productId} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-200 truncate">{item.productName}</p>
                  <p className="text-xs text-amber-500">{item.warehouseName}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-red-400">{item.quantity}</p>
                  <p className="text-xs text-amber-600">min: {item.minStockLevel}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
