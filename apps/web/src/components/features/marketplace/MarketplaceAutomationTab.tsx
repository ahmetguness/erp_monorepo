'use client';

import {
  Sparkles,
  Bot,
  RefreshCw,
  Users,
  ShoppingCart,
  Layers,
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  Play,
  FileCheck,
  PackageCheck,
  ShieldCheck,
  Settings2,
} from 'lucide-react';
import {
  useMarketplaceAutomationSummary,
  useUpdateMarketplaceAutomationPolicy,
  useTriggerOrderAutomation,
} from '@/hooks/useMarketplaceAutomation';
import { useMarketplaceOrders } from '@/hooks/useMarketplace';
import { cn } from '@/lib/utils';
import type { MarketplaceAutomationPolicy } from '@/services/marketplace.automation.service';

export function MarketplaceAutomationTab() {
  const { data: summary, isLoading, refetch } = useMarketplaceAutomationSummary();
  const { data: ordersData, isLoading: isOrdersLoading } = useMarketplaceOrders({ limit: 15 });
  const updatePolicy = useUpdateMarketplaceAutomationPolicy();
  const triggerAutomation = useTriggerOrderAutomation();

  const policy = summary?.policy;
  const orders = ordersData?.data ?? [];

  const handleTogglePolicy = (key: keyof MarketplaceAutomationPolicy) => {
    if (!policy) return;
    updatePolicy.mutate({ [key]: !policy[key] });
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-amber-950/30 p-6 border border-slate-800 shadow-xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
              <Bot className="w-4 h-4 text-amber-400" />
              <span>Pazaryeri Tam Otomasyon Motoru</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Pazaryeri Sipariş & Stok Boru Hattı
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-xl leading-relaxed">
              Gelen siparişlerin cari eşleştirmesinden stok rezervasyonuna ve iki yönlü stok güncellemesine kadar tüm süreçleri otomatikleştirin.
            </p>
          </div>

          <button
            onClick={() => refetch()}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all border border-slate-700/80 flex items-center gap-2 shadow-sm self-start md:self-auto"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            <span>Verileri Güncelle</span>
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Orders */}
        <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider">Pazaryeri Siparişleri</span>
            <ShoppingCart className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white">{summary?.totalMarketplaceOrders ?? 0}</div>
          <p className="text-[10px] text-slate-500 mt-1">İşlenen tüm pazaryeri siparişleri</p>
        </div>

        {/* Matched Contacts */}
        <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">Eşleşen Cariler</span>
            <Users className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400">{summary?.matchedContactCount ?? 0}</div>
          <p className="text-[10px] text-slate-500 mt-1">Otomatik eşleşen müşteri kartları</p>
        </div>

        {/* Sales Orders */}
        <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">ERP Siparişleri</span>
            <PackageCheck className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-400">{summary?.salesOrderCount ?? 0}</div>
          <p className="text-[10px] text-slate-500 mt-1">Oluşturulan satış siparişleri</p>
        </div>

        {/* Stock Reservations */}
        <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Stok Rezervasyonları</span>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-400">{summary?.reservationCount ?? 0}</div>
          <p className="text-[10px] text-slate-500 mt-1">Aktif stok koruma kilitleri</p>
        </div>

        {/* Unmatched SKUs */}
        <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">Eşleşmeyen SKU&apos;lar</span>
            <AlertCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-400">{summary?.unmatchedSkuCount ?? 0}</div>
          <p className="text-[10px] text-slate-500 mt-1">Stok eşleşmesi bekleyen kalemler</p>
        </div>
      </div>

      {/* Main Grid: Policy Settings & Order Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Automation Policy Rules */}
        <div className="lg:col-span-1 p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-slate-800 pb-3">
            <Settings2 className="w-4 h-4 text-amber-400" />
            <span>Otomasyon Politikası & Kurallar</span>
          </div>

          {policy && (
            <div className="space-y-3">
              {/* Rule 1 */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-semibold text-white">Otomatik Müşteri Carisi Oluştur</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">E-posta/telefon eşleşmezse yeni cari aç</p>
                </div>
                <button
                  onClick={() => handleTogglePolicy('autoCreateContact')}
                  className={cn(
                    'w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 focus:outline-none',
                    policy.autoCreateContact ? 'bg-amber-500' : 'bg-slate-800',
                  )}
                >
                  <div className={cn('w-5 h-5 rounded-full bg-white transition-transform shadow-md', policy.autoCreateContact && 'translate-x-5')} />
                </button>
              </div>

              {/* Rule 2 */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-semibold text-white">Otomatik Satış Siparişi Oluştur</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">MarketplaceOrder → SalesOrder (CONFIRMED)</p>
                </div>
                <button
                  onClick={() => handleTogglePolicy('autoCreateSalesOrder')}
                  className={cn(
                    'w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 focus:outline-none',
                    policy.autoCreateSalesOrder ? 'bg-amber-500' : 'bg-slate-800',
                  )}
                >
                  <div className={cn('w-5 h-5 rounded-full bg-white transition-transform shadow-md', policy.autoCreateSalesOrder && 'translate-x-5')} />
                </button>
              </div>

              {/* Rule 3 */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-semibold text-white">Otomatik Stok Rezerve Et</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">Eşleşen ürünler için stok kilidi koy</p>
                </div>
                <button
                  onClick={() => handleTogglePolicy('autoReserveStock')}
                  className={cn(
                    'w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 focus:outline-none',
                    policy.autoReserveStock ? 'bg-amber-500' : 'bg-slate-800',
                  )}
                >
                  <div className={cn('w-5 h-5 rounded-full bg-white transition-transform shadow-md', policy.autoReserveStock && 'translate-x-5')} />
                </button>
              </div>

              {/* Rule 4 */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-semibold text-white">Çift Yönlü Stok Senkronizasyonu</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5">ERP stok değişince pazaryerine gönder</p>
                </div>
                <button
                  onClick={() => handleTogglePolicy('autoSyncErpStockToMarketplace')}
                  className={cn(
                    'w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 focus:outline-none',
                    policy.autoSyncErpStockToMarketplace ? 'bg-amber-500' : 'bg-slate-800',
                  )}
                >
                  <div className={cn('w-5 h-5 rounded-full bg-white transition-transform shadow-md', policy.autoSyncErpStockToMarketplace && 'translate-x-5')} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Recent Marketplace Orders Pipeline */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <ArrowRightLeft className="w-4 h-4 text-sky-400" />
              <span>Son Pazaryeri Sipariş Akışları</span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium">Boru Hattı Durumu</span>
          </div>

          <div className="space-y-3 max-h-110 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
            {orders.map((order) => (
              <div
                key={order.id}
                className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 hover:border-slate-700 transition-all space-y-2 group"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-bold uppercase">
                      {order.channel}
                    </span>
                    <span className="text-xs font-bold text-white">
                      #{order.externalId}
                    </span>
                    <span className="text-[11px] text-slate-400 truncate max-w-[150px]">
                      {order.customerName || 'Müşteri belirtilmedi'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-slate-200">
                      {Number(order.totalAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TL
                    </span>
                    <button
                      onClick={() => triggerAutomation.mutate(order.id)}
                      disabled={triggerAutomation.isPending}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-sky-500/20 text-slate-300 hover:text-sky-300 text-[10px] font-semibold transition-colors flex items-center gap-1 border border-slate-700/80"
                      title="Otomasyonu Yeniden Çalıştır"
                    >
                      <Play className="w-3 h-3 text-sky-400" />
                      <span>Çalıştır</span>
                    </button>
                  </div>
                </div>

                {/* Pipeline Steps Visualizer */}
                <div className="flex items-center gap-2 pt-1 text-[10px]">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Cari Eşleşti
                  </span>
                  <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    ERP Siparişi Oluştu
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Stok Rezerve
                  </span>
                </div>
              </div>
            ))}

            {orders.length === 0 && !isOrdersLoading && (
              <div className="py-10 text-center text-slate-500 text-xs">
                Henüz pazaryeri siparişi kaydı bulunmuyor.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
