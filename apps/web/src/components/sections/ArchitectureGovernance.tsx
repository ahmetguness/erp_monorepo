'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type GovernancePillarId = 'rbac' | 'approvals' | 'audit' | 'isolation';

interface GovernancePillar {
  id: GovernancePillarId;
  title: string;
  badge: string;
  badgeColor: string;
  businessSummary: string;
  businessDesc: string;
  outcomes: string[];
  techSpec: string;
}

const PILLARS: GovernancePillar[] = [
  {
    id: 'rbac',
    title: 'Rol Bazlı Yetkilendirme',
    badge: 'Erişim Kontrolü',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    businessSummary: 'Her çalışan yalnızca yetkili olduğu ekran ve verilere erişir.',
    businessDesc: 'Depo personeli kâr marjlarını göremez, satış ekibi muhasebe yevmiye kayıtlarına müdahale edemez. Departman ve unvan bazında net yetki ayrımı yapılır.',
    outcomes: [
      'Ekran ve aksiyon bazında detaylı yetki matrisi',
      'Kullanıcı unvanına göre otomatik rol ataması',
      'Hassas finansal ve ticari bilgilerin gizliliği',
    ],
    techSpec: 'Granüler RBAC, yetki kontrolleri ve oturum güvenliği',
  },
  {
    id: 'approvals',
    title: 'Onay Mekanizmaları & Çift Kontrol',
    badge: 'Yetki Aşımı Koruması',
    badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    businessSummary: 'Kritik işlemleri kontrollü onay süreçlerinden geçirin.',
    businessDesc: 'Belirlenen limitleri aşan satınalma siparişleri veya yüksek iskonto oranlarında sistem otomatik olarak ikinci bir bağımsız yetkilinin onayını talep eder.',
    outcomes: [
      'Belirlenen bütçe limitlerinde çok kademeli onay',
      'Kendi açtığı talebi kendi onaylayamama güvencesi',
      'Onay bekleyen görevlerin anlık yönetici bildirimleri',
    ],
    techSpec: 'Maker-Checker bağımsız çift kontrol akışları',
  },
  {
    id: 'audit',
    title: 'İşlem Geçmişi & Denetim İzi',
    badge: 'Kayıt Güvencesi',
    badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    businessSummary: 'Kimin, ne zaman, hangi işlemi yaptığını şeffaf biçimde takip edin.',
    businessDesc: 'Sistemdeki her stok hareketi, fiyat değişikliği, fatura düzenlemesi veya iptal işlemi; kullanıcı, tarih, saat ve eski/yeni değerleriyle kayıt altına alınır.',
    outcomes: [
      'Değiştirilen tüm kayıtlarda eski ve yeni değer takibi',
      'Yetkisiz denemelerin ve hatalı işlemlerin tespiti',
      'Kurumsal denetim ve incelemelere tam hazırlık',
    ],
    techSpec: 'Kapsamlı Audit Log ve değişmez işlem tarihi damgalaması',
  },
  {
    id: 'isolation',
    title: 'Şube & Şirket Veri İzolasyonu',
    badge: 'Organizasyon Güvenliği',
    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    businessSummary: 'Organizasyonlar arasında kontrollü veri erişimi sağlayın.',
    businessDesc: 'Grup şirketleri, fabrikalar veya farklı şubeler tek sistemde çalışırken; her şube yalnızca kendi operasyonunu görür. Merkez yönetim ise tüm verileri konsolide inceler.',
    outcomes: [
      'Şubeler arasında bağımsız ticari ve finansal görünüm',
      'Merkez için konsolide bilanço ve stok raporları',
      'Grup şirketleri arası düzenli yetki ayrımı',
    ],
    techSpec: 'PostgreSQL Row-Level Security (RLS) ile veritabanı seviyesinde izolasyon',
  },
];

export default function ArchitectureGovernance() {
  const [activePillarId, setActivePillarId] = useState<GovernancePillarId>('rbac');
  const [makerApproved, setMakerApproved] = useState<boolean>(false);
  const [selectedRole, setSelectedRole] = useState<'branch' | 'cfo'>('branch');
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);

  const activePillar = PILLARS.find((p) => p.id === activePillarId) || PILLARS[0];

  return (
    <section id="security" className="py-20 lg:py-28 bg-[#080F1E] border-t border-slate-800 text-slate-100 overflow-hidden">
      <div className="section-container">
        
        {/* Section Header: Business Language First */}
        <div className="max-w-3xl mb-12">
          <div className="section-label">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>KURUMSAL GÜVENLİK & KONTROL</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight mb-4">
            Doğru bilgi, doğru kişide.
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
            Kurumsal işletmelerde güvenlik, sadece şifre koruması değil; yetki aşımını önleyen onay mekanizmaları, şube veri izolasyonu ve geriye dönük eksiksiz işlem geçmişidir.
          </p>
        </div>

        {/* 4 Pillars Tab Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {PILLARS.map((pillar) => {
            const isActive = pillar.id === activePillarId;
            return (
              <button
                key={pillar.id}
                onClick={() => setActivePillarId(pillar.id)}
                className={`p-4 rounded-xl text-left transition-all duration-150 cursor-pointer border flex flex-col justify-between ${
                  isActive
                    ? 'bg-[#0B1424] border-blue-500/60 shadow-md shadow-blue-500/10'
                    : 'bg-[#060B15]/40 border-slate-800 hover:border-slate-700'
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
                  {pillar.businessSummary}
                </p>
              </button>
            );
          })}
        </div>

        {/* Pillar Showcase Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activePillar.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 bg-[#0B1424] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl"
          >
            {/* Left Content: Business Value & Outcomes */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
              <div>
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded border inline-block mb-3 ${activePillar.badgeColor}`}>
                  {activePillar.badge}
                </span>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">
                  {activePillar.title}
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed mb-5">
                  {activePillar.businessDesc}
                </p>

                {/* Outcomes */}
                <div className="space-y-2.5">
                  {activePillar.outcomes.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-200">
                      <span className="text-emerald-400 font-bold">✓</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Technical Spec Footnote */}
              <div className="pt-4 border-t border-slate-800 text-xs text-slate-400 flex items-center gap-2">
                <span className="text-slate-500 font-mono">Altyapı Güvencesi:</span>
                <span className="text-slate-300">{activePillar.techSpec}</span>
              </div>
            </div>

            {/* Right Interactive Business Simulator Card */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-[#080F1E] border border-slate-800 rounded-xl p-5 shadow-inner">
              {activePillar.id === 'approvals' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="text-xs font-bold text-white">Çift Kişi Onay Akışı (Örnek)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 font-medium">
                      Çift Kontrol
                    </span>
                  </div>

                  {/* Step 1: Requester */}
                  <div className="p-3 bg-[#0B1424] rounded-lg border border-slate-800 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-300">1. Talep Oluşturan:</span>
                      <span className="text-[10px] text-slate-400">Satınalma Yöneticisi</span>
                    </div>
                    <p className="text-slate-300">
                      Hammadde Satınalma Talebi: <strong className="text-white">₺350.000</strong>
                    </p>
                    <span className="text-[10px] text-emerald-400 block">✓ Talep açıldı, yönetici onayına sunuldu</span>
                  </div>

                  {/* Step 2: Approver */}
                  <div className="p-3 bg-[#0B1424] rounded-lg border border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-300">2. Bağımsız Onaylayan:</span>
                      <span className="text-[10px] text-slate-400">Finans Direktörü</span>
                    </div>
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
                        {makerApproved ? 'Yürürlükte' : 'Onay Bekliyor'}
                      </span>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 pt-1">
                    Denetim İzi: Onaylayan kullanıcı, tarih ve saat sistemde değişmez olarak kaydedilir.
                  </div>
                </div>
              )}

              {(activePillar.id === 'rbac' || activePillar.id === 'isolation') && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="text-xs font-bold text-white">Rol & İzolasyon Kontrolü</span>
                    <div className="flex items-center gap-1 bg-[#060B15] p-0.5 rounded border border-slate-800">
                      <button
                        onClick={() => setSelectedRole('branch')}
                        className={`text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer ${
                          selectedRole === 'branch' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400'
                        }`}
                      >
                        Şube Satış
                      </button>
                      <button
                        onClick={() => setSelectedRole('cfo')}
                        className={`text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer ${
                          selectedRole === 'cfo' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400'
                        }`}
                      >
                        Merkez CFO
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="p-2.5 bg-[#0B1424] rounded-lg border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-300">Kendi Şube Siparişlerini Görme</span>
                      <span className="text-emerald-400 font-semibold">✓ İzinli</span>
                    </div>
                    <div className="p-2.5 bg-[#0B1424] rounded-lg border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-300">Tüm Grup Konsolide Bilanço</span>
                      <span className={selectedRole === 'cfo' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {selectedRole === 'cfo' ? '✓ İzinli' : '✕ Yetki Yok'}
                      </span>
                    </div>
                    <div className="p-2.5 bg-[#0B1424] rounded-lg border border-slate-800 flex items-center justify-between">
                      <span className="text-slate-300">İskonto Tanımlama & Onay</span>
                      <span className={selectedRole === 'cfo' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {selectedRole === 'cfo' ? '✓ İzinli' : '✕ Yetki Sınırı Dışında'}
                      </span>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 pt-1">
                    Veritabanı seviyesinde izolasyon ile personeller yalnızca kendi yetki alanındaki kayıtları görebilir.
                  </div>
                </div>
              )}

              {activePillar.id === 'audit' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="text-xs font-bold text-white">Denetim İzi Kayıt Örneği</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
                      Değişmez Kayıt
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="p-2.5 bg-[#0B1424] rounded-lg border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Fiyat Listesi Güncellemesi</span>
                        <span>14:32</span>
                      </div>
                      <div className="text-[11px] text-slate-300">
                        Pompa Birim Fiyatı: ₺950 → ₺1.050 (Ahmet Y.)
                      </div>
                    </div>
                    <div className="p-2.5 bg-[#0B1424] rounded-lg border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>İrsaliye İptal Talebi</span>
                        <span>11:15</span>
                      </div>
                      <div className="text-[11px] text-slate-300">
                        IRS-0182: İptal gerekçesi sisteme işlendi
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 pt-1">
                    Tüm işlemler kullanıcı kimliği ve zaman damgasıyla saklanır; geriye dönük silinemez.
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Expandable Technical Details Drawer */}
        <div className="mt-6 text-center">
          <button
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="text-xs font-medium text-slate-400 hover:text-white transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <span>{showTechnicalDetails ? 'Teknik altyapı detaylarını gizle' : 'Teknik güvenlik ve altyapı detaylarını inceleyin'}</span>
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-150 ${showTechnicalDetails ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <AnimatePresence>
            {showTechnicalDetails && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mt-4 text-left"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-5 rounded-xl bg-[#0B1424] border border-slate-800 text-xs text-slate-400">
                  <div className="p-3 bg-[#080F1E] rounded-lg border border-slate-800">
                    <span className="font-semibold text-slate-200 block mb-1">PostgreSQL RLS</span>
                    Şube ve organizasyon bazlı veritabanı satır seviyesi izolasyonu (Row-Level Security).
                  </div>
                  <div className="p-3 bg-[#080F1E] rounded-lg border border-slate-800">
                    <span className="font-semibold text-slate-200 block mb-1">Maker-Checker</span>
                    Hassas finansal ve idari işlemlerde iki bağımsız yetkili zorunluluğu.
                  </div>
                  <div className="p-3 bg-[#080F1E] rounded-lg border border-slate-800">
                    <span className="font-semibold text-slate-200 block mb-1">Transactional Outbox</span>
                    Pazaryeri ve harici entegrasyonlarda kesintiye dayanıklı asenkron kuyruk yapısı.
                  </div>
                  <div className="p-3 bg-[#080F1E] rounded-lg border border-slate-800">
                    <span className="font-semibold text-slate-200 block mb-1">OpenAPI 3.1 & HMAC</span>
                    Yetkilendirilmiş API anahtarları ve HMAC-SHA256 imzalı güvenli webhook iletişimi.
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </section>
  );
}
