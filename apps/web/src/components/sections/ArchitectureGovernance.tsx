'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type PillarId = 'maker-checker' | 'multi-tenant' | 'outbox' | 'api-hub';

interface Pillar {
  id: PillarId;
  title: string;
  badge: string;
  badgeColor: string;
  summary: string;
  description: string;
  specs: { label: string; value: string }[];
}

const PILLARS: Pillar[] = [
  {
    id: 'maker-checker',
    title: 'Maker-Checker: Çift Kişi Onay Güvencesi',
    badge: 'Hata & Yetki Aşımı Koruması',
    badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    summary: 'Büyük tutarlı harcamalar ve kritik sistem değişikliklerinde ikinci bir bağımsız yetkilinin onayı zorunludur.',
    description: 'Yüksek tutarlı satınalmalar (Örn: ₺500.000 üzeri), tedarikçi kredi limitleri veya hesap planı değişikliklerinde değişiklik talebi açılır. Talebi açan yönetici kendi işlemini onaylayamaz. İkinci bağımsız yetkili etki analizini inceleyerek onaylar veya revize ister.',
    specs: [
      { label: 'Onay Modeli', value: 'Bağımsız Çift Kontrol (Maker-Checker)' },
      { label: 'Önizleme Desteği', value: 'Etki Simülasyonu & Kilitlenen Siparişler' },
      { label: 'Geri Alma (Rollback)', value: 'Tek Tıkla Telafi / Ters Kayıt' },
      { label: 'Denetim Damgası', value: 'Kullanıcı, Tarih-Saat ve IP Damgası' },
    ],
  },
  {
    id: 'multi-tenant',
    title: 'Şubeler ve Şirketler Arası Veri İzolasyonu',
    badge: 'ISO 27001 & KVKK Uyumlu',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    summary: 'Grup şirketleri, fabrikalar ve şubeler tek sistemde çalışır ancak hiçbiri diğerinin gizli maliyetini veya cari bakiyesini göremez.',
    description: 'PostgreSQL Row-Level Security (RLS) ve TenantGuard seviyesinde mutlak mantıksal ayrım sağlanır. Kullanıcılar yalnızca atanmış oldukları rollerin (Örn: depocu sadece sevk fişini görür, satış kâr marjını göremez) izin verdiği ekranlara erişebilir.',
    specs: [
      { label: 'Veritabanı İzolasyonu', value: 'PostgreSQL Row-Level Security (RLS)' },
      { label: 'Rol Hassasiyeti', value: 'Ekran ve Alan Bazlı Granüler RBAC' },
      { label: 'İki Aşamalı Güvenlik', value: 'TOTP (Google Authenticator) & WebAuthn' },
      { label: 'Denetim İzi (Audit)', value: 'Her Değişiklikte Eski/Yeni Değer Kaydı' },
    ],
  },
  {
    id: 'outbox',
    title: 'İnternet Kopsa Bile Sıfır Veri Kaybı (Outbox)',
    badge: 'Garantili Mesaj Kuyruğu',
    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    summary: 'Pazaryeri siparişleri, stok düşüşleri ve e-faturalar asenkron kuyruklarla korunur; bağlantı kesintilerinde kayıtlar asla kaybolmaz.',
    description: 'Sipariş veritabanına yazıldığı anda ilgili bildirim aynı ACID veritabanı transaction’ında outbox tablosuna işlenir. Dış pazaryeri veya GİB sunucusu o an yanıt vermese bile, Redis BullMQ worker hattı sistem ayağa kalktığında işlemi kaldığı yerden tamamlar.',
    specs: [
      { label: 'İşlem Güvencesi', value: 'ACID Transactional Outbox' },
      { label: 'Kuyruk Motoru', value: 'Redis 7 & BullMQ Asenkron Hattı' },
      { label: 'Hata Toleransı', value: 'Dead-Letter Queue & Exponential Backoff' },
      { label: 'Mükerrerlik Önleme', value: 'Idempotency Key ile %100 Tekil İşlem' },
    ],
  },
  {
    id: 'api-hub',
    title: 'REST API & Güvenli Webhook Entegrasyonu',
    badge: 'Açık Standartlar',
    badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    summary: 'Kendi mobil uygulamalarınızı, e-ticaret sitenizi (Shopify, WooCommerce vb.) ve kargo firmalarınızı çift yönlü bağlayın.',
    description: 'Axon ERP, modern OpenAPI 3.1 standartlarında REST API sunar. İzin kapsamına (scope) göre sınırlandırılmış API anahtarları oluşturabilir, hız limitleri koyabilir ve giden webhook bildirimlerini HMAC-SHA256 imzasıyla doğrulayabilirsiniz.',
    specs: [
      { label: 'API Standardı', value: 'RESTful JSON API (OpenAPI 3.1)' },
      { label: 'Anahtar Kapsamı', value: 'Granüler Scopes (products:read, orders:write)' },
      { label: 'Webhook Koruması', value: 'HMAC-SHA256 İmza Doğrulaması' },
      { label: 'Kota & Hız Sınırı', value: 'Tenant Bazlı Dağıtık Rate-Limiting' },
    ],
  },
];

export default function ArchitectureGovernance() {
  const [activePillarId, setActivePillarId] = useState<PillarId>('maker-checker');
  const [makerApproved, setMakerApproved] = useState<boolean>(false);
  const [selectedRole, setSelectedRole] = useState<'admin' | 'staff'>('staff');

  const activePillar = PILLARS.find((p) => p.id === activePillarId) || PILLARS[0];

  return (
    <section id="architecture" className="py-20 lg:py-28 relative bg-[#0F172A] border-t border-slate-800 text-slate-100 overflow-hidden">
      <div className="section-container relative z-10">
        
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="max-w-3xl mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] text-xs font-mono text-slate-400 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>KURUMSAL GÜVENLİK & DENETİM</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-[-0.02em] leading-tight mb-4">
            Yetki aşımı, veri sızıntısı ve kesintiye<br />
            <span className="text-slate-400 font-normal">
              sıfır toleranslı kurumsal altyapı.
            </span>
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
            Tek bir personelin hatasıyla yüz binlerce liralık harcama onaylanamaz, şubeler birbirinin mali tablolarını göremez, internet kopsa bile kuyruktaki işlemler kaybolmaz.
          </p>
        </motion.div>

        {/* 4 Pillars Navigation Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {PILLARS.map((pillar) => {
            const isActive = pillar.id === activePillarId;
            return (
              <button
                key={pillar.id}
                onClick={() => setActivePillarId(pillar.id)}
                className={`p-4 rounded-xl text-left transition-all duration-200 cursor-pointer border flex flex-col justify-between ${
                  isActive
                    ? 'bg-slate-800/90 border-blue-500/60 shadow-lg shadow-blue-500/10'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                }`}
              >
                <div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border inline-block mb-2 ${pillar.badgeColor}`}>
                    {pillar.badge}
                  </span>
                  <h3 className={`text-xs sm:text-sm font-bold leading-snug ${isActive ? 'text-white' : 'text-slate-300'}`}>
                    {pillar.title}
                  </h3>
                </div>
                <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">
                  {pillar.summary}
                </p>
              </button>
            );
          })}
        </div>

        {/* Detailed Pillar Showcase Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activePillar.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 backdrop-blur-sm shadow-xl"
          >
            {/* Left Content */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
              <div>
                <div className="inline-block mb-2">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded border ${activePillar.badgeColor}`}>
                    {activePillar.badge}
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">
                  {activePillar.title}
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {activePillar.description}
                </p>
              </div>

              {/* Technical Specifications Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                {activePillar.specs.map((spec, i) => (
                  <div key={i} className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg">
                    <span className="text-[10px] text-slate-400 block mb-1">
                      {spec.label}
                    </span>
                    <span className="text-xs font-semibold text-slate-200">
                      {spec.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Interactive Visual Simulation Card */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-slate-950/90 border border-slate-800 rounded-xl p-5 shadow-inner">
              {activePillar.id === 'maker-checker' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="text-xs font-bold text-white">Maker-Checker Canlı Simülasyonu</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 font-medium">
                      Çift Kontrol
                    </span>
                  </div>

                  {/* Maker Request */}
                  <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-300">1. Adım: Maker (Talep Eden)</span>
                      <span className="text-[10px] text-slate-400">Ahmet Y. • Satınalma Müdürü</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Tedarikçi Kredi Limiti Artışı: <span className="font-semibold text-white">₺1.200.000</span>
                    </p>
                    <div className="text-[10px] text-emerald-400">✓ Talep oluşturuldu, kendi kendini onaylayamaz.</div>
                  </div>

                  {/* Checker Approval */}
                  <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-300">2. Adım: Checker (Onaylayan)</span>
                      <span className="text-[10px] text-slate-400">Zeynep K. • Finans Direktörü</span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Etki Analizi: 3 bekleyen hammadde siparişi otomatik onaylanacak.
                    </p>
                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={() => setMakerApproved(!makerApproved)}
                        className={`text-xs px-3 py-1.5 rounded font-semibold transition-colors cursor-pointer ${
                          makerApproved
                            ? 'bg-emerald-600 text-white'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        {makerApproved ? '✓ Onaylandı (Geri Al)' : 'Talebi Onayla (Simüle Et)'}
                      </button>
                      <span className={`text-[11px] font-medium ${makerApproved ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {makerApproved ? 'Değişiklik Yürürlükte' : 'Onay Bekliyor'}
                      </span>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 pt-1">
                    Denetim İzi: Zorunlu onay gerekçesi, tarih-saat ve IP damgası loglandı.
                  </div>
                </div>
              )}

              {activePillar.id === 'multi-tenant' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="text-xs font-bold text-white">Rol & İzolasyon Simülatörü</span>
                    <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
                      <button
                        onClick={() => setSelectedRole('staff')}
                        className={`text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer ${
                          selectedRole === 'staff' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400'
                        }`}
                      >
                        Şube Satış
                      </button>
                      <button
                        onClick={() => setSelectedRole('admin')}
                        className={`text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer ${
                          selectedRole === 'admin' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400'
                        }`}
                      >
                        Holding CFO
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-300">Kendi Şube Stoklarını Görme</span>
                      <span className="text-emerald-400 font-semibold">✓ İzin Verildi</span>
                    </div>
                    <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-300">Tüm Grup Şirket Finans Raporları</span>
                      <span className={selectedRole === 'admin' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {selectedRole === 'admin' ? '✓ İzin Verildi' : '✕ Yetki Yok (Korumalı)'}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                      <span className="text-slate-300">Yevmiye Defteri Ters Kayıt</span>
                      <span className={selectedRole === 'admin' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {selectedRole === 'admin' ? '✓ Çift Onay Şartıyla' : '✕ Yetki Yok (Korumalı)'}
                      </span>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 pt-1">
                    PostgreSQL Row-Level Security (RLS) ve TenantGuard ile veritabanı seviyesinde izolasyon.
                  </div>
                </div>
              )}

              {activePillar.id === 'outbox' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="text-xs font-bold text-white">Domain Event Outbox Hattı</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium">
                      %100 Güvenilirlik
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-slate-200">1. Veritabanı ACID Kaydı</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">0.4ms</span>
                    </div>

                    <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                        <span className="text-slate-200">2. Outbox Kuyruk İşleme (Redis)</span>
                      </div>
                      <span className="text-[11px] text-emerald-400 font-medium">Kuyrukta Sıfır Kayıp</span>
                    </div>

                    <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-400" />
                        <span className="text-slate-200">3. Pazaryeri & GİB İletimi</span>
                      </div>
                      <span className="text-[11px] text-emerald-400 font-medium">Garantili İletim</span>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 pt-1">
                    Dış servis kesintilerinde exponential backoff ile otomatik tekrar denenir.
                  </div>
                </div>
              )}

              {activePillar.id === 'api-hub' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="text-xs font-bold text-white">Webhook & REST Güvenliği</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-medium">
                      HMAC-SHA256
                    </span>
                  </div>

                  <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Olay: order.created</span>
                      <span className="text-emerald-400">200 OK (38ms)</span>
                    </div>
                    <div className="p-2 bg-slate-950 rounded border border-slate-800 text-[11px] text-slate-300 font-mono">
                      X-Axon-Signature: sha256=9f8a2...3b4
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Kapsam: products:read, orders:write</span>
                      <span className="text-slate-300">Rate Limit: 1200/dk</span>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 pt-1">
                    E-ticaret siteleriniz, lojistik depolarınız ve mobil uygulamalarınızla çift yönlü güvenli entegrasyon.
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

      </div>
    </section>
  );
}
