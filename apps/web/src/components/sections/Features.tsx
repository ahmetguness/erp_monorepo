'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const modules = [
  {
    title: 'Stok Yönetimi',
    desc: 'Gerçek zamanlı stok takibi, depo hareketleri ve minimum stok uyarıları.',
    detail: 'Çok depolu yapı, barkod entegrasyonu, otomatik sipariş tetikleyicileri ve stok maliyet analizi ile envanter süreçlerinizi tam kontrol altına alın.',
    color: 'blue',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    title: 'Satış ve Teklif',
    desc: 'Teklif hazırlama, sipariş takibi ve satış performans raporları.',
    detail: 'Müşteriye özel fiyat listeleri, onay akışları, sipariş-fatura dönüşümü ve satış ekibi performans takibi tek ekranda.',
    color: 'indigo',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: 'Cari Hesap',
    desc: 'Müşteri ve tedarikçi cari hesap yönetimi, bakiye ve mutabakat takibi.',
    detail: 'Açık hesap takibi, vade analizi, otomatik mutabakat mektupları ve risk limiti yönetimi ile cari süreçlerinizi düzenleyin.',
    color: 'violet',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    title: 'Fatura Yönetimi',
    desc: 'E-Fatura, e-Arşiv ve e-İrsaliye entegrasyonu ile tam uyumluluk.',
    detail: 'GİB entegrasyonu, toplu fatura gönderimi, fatura iptali ve itiraz süreçleri ile yasal uyumluluğunuzu otomatik sağlayın.',
    color: 'blue',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: 'Muhasebe',
    desc: 'Genel muhasebe, beyanname takibi, maliyet analizi ve finansal tablolar.',
    detail: 'Yevmiye, mizan, bilanço ve gelir tablosu otomatik oluşturma. KDV, muhtasar ve kurumlar vergisi beyanname hazırlığı.',
    color: 'indigo',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    title: 'Raporlama',
    desc: 'Özelleştirilebilir raporlar, yönetim panoları ve veri dışa aktarma.',
    detail: 'Sürükle-bırak rapor tasarımcısı, zamanlanmış rapor gönderimi, Excel/PDF export ve yönetici dashboard\'ları.',
    color: 'violet',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: 'Personel Takibi',
    desc: 'Bordro, izin yönetimi, mesai takibi ve personel özlük dosyaları.',
    detail: 'SGK bildirgeleri, bordro hesaplama, izin onay akışları ve performans değerlendirme süreçleri entegre şekilde çalışır.',
    color: 'blue',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    title: 'Satın Alma',
    desc: 'Tedarikçi yönetimi, satın alma talepleri ve onay süreçleri.',
    detail: 'Talep-onay-sipariş akışı, tedarikçi performans değerlendirmesi, fiyat karşılaştırma ve bütçe kontrol mekanizmaları.',
    color: 'indigo',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    title: 'Depo Yönetimi',
    desc: 'Çok depolu yapı, raf yönetimi, sayım ve transfer işlemleri.',
    detail: 'Lokasyon bazlı stok takibi, FIFO/LIFO yöntemi, sayım fişleri ve depolar arası transfer süreçleri.',
    color: 'violet',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
      </svg>
    ),
  },
  {
    title: 'Üretim Takibi',
    desc: 'İş emirleri, kaynak planlama (MRP) ve üretim verimlilik analizi.',
    detail: 'Reçete yönetimi, iş emri takibi, fire ve hurda kayıtları, makine duruş analizleri ve OEE raporları.',
    color: 'blue',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    title: 'Teknik Servis',
    desc: 'Servis talepleri, iş emirleri, garanti takibi ve saha ekip yönetimi.',
    detail: 'Müşteri bazlı servis geçmişi, SLA takibi, saha teknisyen ataması ve yedek parça yönetimi.',
    color: 'indigo',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
      </svg>
    ),
  },
  {
    title: 'E-Ticaret',
    desc: 'Trendyol, Hepsiburada ve diğer pazaryerleriyle otomatik senkronizasyon.',
    detail: 'Stok ve fiyat senkronizasyonu, sipariş otomasyonu, kargo entegrasyonu ve pazaryeri performans raporları.',
    color: 'violet',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
    ),
  },
];

const colorMap: Record<string, { bg: string; icon: string; border: string; dot: string }> = {
  blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600',   border: 'border-blue-100', dot: 'bg-blue-500' },
  indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600', border: 'border-indigo-100', dot: 'bg-indigo-500' },
  violet: { bg: 'bg-violet-50', icon: 'text-violet-600', border: 'border-violet-100', dot: 'bg-violet-500' },
};

export default function Features() {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  return (
    <section id="features" className="pt-0 pb-16 lg:pb-24 relative bg-[#0F172A] overflow-hidden">
      {/* Radial glows — hero ile uyumlu */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-600/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-indigo-600/6 rounded-full blur-[100px] pointer-events-none" />

      <div className="section-container relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12"
        >
          <div className="max-w-xl">
            <div className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">Modüller</div>
            <h2 className="text-2xl lg:text-3xl font-bold text-white mb-3">
              İşletmenizin tüm süreçleri için entegre modüller
            </h2>
            <p className="text-slate-400 leading-relaxed text-sm">
              Birbirine tam entegre çalışan modüller sayesinde departmanlar arası veri akışı kesintisiz devam eder.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            {modules.length} modül mevcut
          </div>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-800 rounded-xl overflow-hidden border border-slate-800">
          {modules.map((m, idx) => {
            const c = colorMap[m.color];
            const isActive = activeIdx === idx;
            return (
              <motion.article
                key={idx}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: idx * 0.03 }}
                onClick={() => setActiveIdx(isActive ? null : idx)}
                className={`relative bg-[#0F172A] p-5 cursor-pointer group transition-colors duration-200 ${
                  isActive ? 'bg-slate-800/80' : 'hover:bg-slate-800/50'
                }`}
              >
                {/* Active indicator */}
                {isActive && (
                  <motion.div
                    layoutId="active-module"
                    className="absolute inset-0 bg-slate-800/60 border border-slate-600"
                  />
                )}

                <div className="relative z-10">
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 transition-colors duration-200 ${
                    isActive ? `${c.bg} ${c.icon}` : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-200'
                  }`}>
                    {m.icon}
                  </div>

                  <h3 className={`text-sm font-semibold mb-1.5 transition-colors duration-200 ${
                    isActive ? 'text-white' : 'text-slate-300 group-hover:text-white'
                  }`}>
                    {m.title}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">{m.desc}</p>

                  {/* Expanded detail */}
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <p className="text-xs text-slate-400 leading-relaxed mt-3 pt-3 border-t border-slate-700">
                          {m.detail}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Corner dot */}
                <div className={`absolute top-3 right-3 w-1.5 h-1.5 rounded-full transition-colors duration-200 ${
                  isActive ? c.dot : 'bg-slate-700 group-hover:bg-slate-500'
                }`} />
              </motion.article>
            );
          })}
        </div>


        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-8 pt-8 border-t border-slate-800"
        >
          <p className="text-sm text-slate-400">
            Tüm modüller birbirine entegre çalışır. İhtiyacınıza göre seçin, sonradan genişletin.
          </p>
          <button className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors">
            Tüm Modülleri İncele
          </button>
        </motion.div>
      </div>
    </section>
  );
}
