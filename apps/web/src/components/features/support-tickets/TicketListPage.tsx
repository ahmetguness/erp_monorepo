'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LifeBuoy,
  Plus,
  Search,
  Clock,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Filter,
  X,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/shared/PageHeader';
import { listTenantTickets } from '@/services/support-ticket.service';
import { TicketCard } from './TicketCard';
import { CreateTicketModal } from './CreateTicketModal';
import type { PlatformTicketCategory } from '@repo/types';

export function TicketListPage() {
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: tickets = [], isLoading, refetch } = useQuery({
    queryKey: ['tenant-tickets', selectedStatus, selectedCategory, search],
    queryFn: () =>
      listTenantTickets({
        status: selectedStatus === 'ALL' ? undefined : selectedStatus,
        category: selectedCategory === 'ALL' ? undefined : selectedCategory,
        search: search.trim() || undefined,
      }),
  });

  const stats = {
    total: tickets.length,
    open: tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length,
    waitingAction: tickets.filter((t) => t.status === 'WAITING_TENANT').length,
    resolved: tickets.filter((t) => t.status === 'RESOLVED' || t.status === 'CLOSED').length,
  };

  const isFiltered = search || selectedStatus !== 'ALL' || selectedCategory !== 'ALL';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Destek & Yardım Masası"
        subtitle="Teknik sorularınızı, hata bildirimlerinizi ve önerilerinizi platform yöneticilerine iletin; çözüm süreçlerini canlı izleyin."
        action={
          <Button
            variant="primary"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setIsCreateOpen(true)}
            className="shadow-lg shadow-sky-600/20 hover:shadow-sky-600/30"
          >
            Yeni Destek Talebi
          </Button>
        }
      />

      {/* Modern KPI Cards with glowing icons */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/80 to-slate-950/80 p-4 transition-all duration-200 hover:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Toplam Bilet</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800/80 text-slate-400 group-hover:text-white transition-colors">
              <FolderOpen className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-white tracking-tight">{stats.total}</p>
          <p className="mt-1 text-[11px] text-slate-500">Kayıtlı destek geçmişi</p>
        </div>

        <div className="group relative overflow-hidden rounded-2xl border border-sky-900/30 bg-gradient-to-b from-sky-950/20 via-slate-900/80 to-slate-950/80 p-4 transition-all duration-200 hover:border-sky-700/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-sky-400">Açık & İşlemde</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Clock className="h-4 w-4 animate-pulse" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-sky-400 tracking-tight">{stats.open}</p>
          <p className="mt-1 text-[11px] text-slate-500">Müdahale bekleyen / devam eden</p>
        </div>

        <div className="group relative overflow-hidden rounded-2xl border border-rose-900/40 bg-gradient-to-b from-rose-950/20 via-slate-900/80 to-slate-950/80 p-4 transition-all duration-200 hover:border-rose-700/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-rose-400">Yanıtınız Bekleniyor</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-rose-400 tracking-tight">{stats.waitingAction}</p>
          <p className="mt-1 text-[11px] text-rose-400/70">Müşteri aksiyonu gerekiyor</p>
        </div>

        <div className="group relative overflow-hidden rounded-2xl border border-emerald-900/30 bg-gradient-to-b from-emerald-950/20 via-slate-900/80 to-slate-950/80 p-4 transition-all duration-200 hover:border-emerald-700/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-400">Çözümlenen</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-emerald-400 tracking-tight">{stats.resolved}</p>
          <p className="mt-1 text-[11px] text-slate-500">Başarıyla sonuçlanan talepler</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3.5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        {/* Status Tabs */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: 'ALL', label: 'Tümü' },
            { key: 'OPEN', label: 'Açık' },
            { key: 'IN_PROGRESS', label: 'İşlemde' },
            { key: 'WAITING_TENANT', label: 'Yanıt Bekleniyor' },
            { key: 'RESOLVED', label: 'Çözülen' },
            { key: 'CLOSED', label: 'Kapatılan' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSelectedStatus(tab.key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${selectedStatus === tab.key
                ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search & Category Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-xl border border-slate-700/80 bg-slate-800/90 px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-sky-500"
          >
            <option value="ALL">Tüm Kategoriler</option>
            <option value="TECHNICAL">Teknik Sorun</option>
            <option value="BILLING">Fatura & Abonelik</option>
            <option value="ACCOUNT">Hesap & Giriş</option>
            <option value="FEATURE_REQUEST">Özellik Talebi</option>
            <option value="OTHER">Diğer</option>
          </select>

          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Bilet no veya konu ara..."
              className="w-full rounded-xl border border-slate-700/80 bg-slate-800/90 py-1.5 pl-8 pr-8 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {isFiltered && (
            <button
              onClick={() => {
                setSearch('');
                setSelectedStatus('ALL');
                setSelectedCategory('ALL');
              }}
              className="text-xs text-slate-400 hover:text-rose-400 transition-colors px-1"
            >
              Temizle
            </button>
          )}
        </div>
      </div>

      {/* Tickets List */}
      <div className="space-y-3">
        {isLoading && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40 p-16 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent mb-3" />
            <span className="text-xs text-slate-400">Destek talepleri yükleniyor...</span>
          </div>
        )}

        {!isLoading && tickets.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800/80 text-sky-400 shadow-inner">
              <LifeBuoy className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-sm font-bold text-slate-200">
              {isFiltered ? 'Kriterlere uygun talep bulunamadı' : 'Henüz bir destek talebiniz bulunmuyor'}
            </h3>
            <p className="mt-1.5 text-xs text-slate-400 max-w-sm mx-auto">
              {isFiltered
                ? 'Arama ve filtre kriterlerinizi değiştirerek tekrar deneyebilirsiniz.'
                : 'Sistemsel bir soru, geliştirme önerisi veya teknik arıza durumunda dilediğiniz an yeni bir destek bileti açabilirsiniz.'}
            </p>
            {!isFiltered ? (
              <Button
                variant="primary"
                size="sm"
                className="mt-5"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={() => setIsCreateOpen(true)}
              >
                İlk Talebini Oluştur
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setSearch('');
                  setSelectedStatus('ALL');
                  setSelectedCategory('ALL');
                }}
              >
                Filtreleri Sıfırla
              </Button>
            )}
          </div>
        )}

        {!isLoading &&
          tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
      </div>

      <CreateTicketModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
  );
}
