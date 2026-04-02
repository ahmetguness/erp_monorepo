'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const sectors = [
  {
    title: 'Üretim',
    desc: 'Kaynak planlama, iş emirleri, kalite kontrol ve üretim maliyet analizi.',
    modules: ['MRP', 'İş Emirleri', 'Kalite Kontrol', 'Maliyet Analizi'],
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    title: 'Perakende',
    desc: 'Mağaza yönetimi, kasa entegrasyonu, stok takibi ve müşteri sadakat programları.',
    modules: ['Kasa Entegrasyonu', 'Stok Takibi', 'Sadakat Programı', 'Mağaza Yönetimi'],
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    ),
  },
  {
    title: 'Toptan Satış',
    desc: 'Büyük hacimli sipariş yönetimi, fiyat listeleri, iskonto yapıları ve bayi takibi.',
    modules: ['Sipariş Yönetimi', 'Fiyat Listeleri', 'Bayi Takibi', 'İskonto Yapıları'],
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    title: 'Hizmet',
    desc: 'Proje bazlı faturalama, sözleşme yönetimi ve hizmet performans takibi.',
    modules: ['Proje Yönetimi', 'Sözleşme Takibi', 'Faturalama', 'Performans Raporu'],
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: 'Lojistik',
    desc: 'Araç takibi, depo yönetimi, nakliye planlaması ve tedarik zinciri kontrolü.',
    modules: ['Araç Takibi', 'Depo Yönetimi', 'Nakliye Planı', 'Tedarik Zinciri'],
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
  },
  {
    title: 'Teknik Servis',
    desc: 'Servis talepleri, iş emirleri, garanti takibi ve saha ekip koordinasyonu.',
    modules: ['Servis Talepleri', 'Garanti Takibi', 'Saha Ekibi', 'SLA Yönetimi'],
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
      </svg>
    ),
  },
];

const whyItems = [
  {
    title: 'Veri Güvenliği',
    desc: 'ISO 27001 sertifikalı altyapı, 256-bit SSL şifreleme ve rol bazlı yetkilendirme.',
    badge: 'ISO 27001',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    title: 'Ölçeklenebilir Mimari',
    desc: 'Modüler yapı büyümenize paralel genişler. Yeni modüller mevcut sistemi etkilemeden eklenir.',
    badge: 'Modüler',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
    ),
  },
  {
    title: 'Yerli Mevzuat Uyumu',
    desc: 'E-Fatura, e-Arşiv, e-İrsaliye ve SGK entegrasyonları dahil. Yasal güncellemeler otomatik.',
    badge: 'GİB Onaylı',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: '7/24 Teknik Destek',
    desc: 'Telefon, e-posta ve uzaktan bağlantı ile kesintisiz destek. Yerinde danışmanlık seçeneği.',
    badge: '7/24',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
];

export default function Sectors() {
  const [activeTab, setActiveTab] = useState<'sectors' | 'why'>('sectors');
  const [activeSector, setActiveSector] = useState(0);

  return (
    <section id="solutions" className="section-spacing relative bg-[#0F172A] overflow-hidden">
      <div className="absolute top-1/2 right-0 -translate-y-1/2 w-[500px] h-[500px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="section-container relative z-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10"
        >
          <div>
            <div className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">
              Sektörler & Neden Biz
            </div>
            <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2">
              Her sektöre özel, güvenilir altyapı
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed max-w-lg">
              Sektörünüzün dinamiklerine göre yapılandırılmış çözümler ve kurumsal düzeyde güvenlik.
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex bg-slate-800/60 border border-slate-700 rounded-lg p-1 w-fit flex-shrink-0">
            <button
              onClick={() => setActiveTab('sectors')}
              className={
                'px-5 py-2 rounded-md text-sm font-medium transition-all duration-150 ' +
                (activeTab === 'sectors'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200')
              }
            >
              Sektörler
            </button>
            <button
              onClick={() => setActiveTab('why')}
              className={
                'px-5 py-2 rounded-md text-sm font-medium transition-all duration-150 ' +
                (activeTab === 'why'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200')
              }
            >
              Neden Biz
            </button>
          </div>
        </motion.div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'sectors' ? (
            <motion.div
              key="sectors"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-4"
            >
              {/* Left: sector list */}
              <div className="lg:col-span-4 flex flex-col gap-1.5">
                {sectors.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveSector(idx)}
                    className={
                      'group text-left flex items-center gap-4 px-4 py-3.5 rounded-lg border transition-all duration-150 ' +
                      (activeSector === idx
                        ? 'bg-slate-800 border-slate-600'
                        : 'bg-slate-800/20 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50')
                    }
                  >
                    {activeSector === idx && (
                      <motion.div layoutId="sector-bar" className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500 rounded-l-lg" />
                    )}
                    <div className={
                      'w-8 h-8 rounded flex items-center justify-center flex-shrink-0 transition-colors duration-150 ' +
                      (activeSector === idx
                        ? 'bg-blue-600/20 text-blue-400'
                        : 'bg-slate-700/50 text-slate-500 group-hover:text-slate-300')
                    }>
                      {s.icon}
                    </div>
                    <span className={
                      'text-sm font-medium transition-colors duration-150 ' +
                      (activeSector === idx ? 'text-white' : 'text-slate-400 group-hover:text-slate-200')
                    }>
                      {s.title}
                    </span>
                    {activeSector === idx && (
                      <svg className="w-4 h-4 text-slate-500 ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              {/* Right: detail */}
              <div className="lg:col-span-8">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeSector}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                    className="bg-slate-800/40 border border-slate-700 rounded-xl overflow-hidden h-full"
                  >
                    {/* Card header */}
                    <div className="px-8 py-6 border-b border-slate-700 flex items-start gap-5">
                      <div className="w-12 h-12 bg-blue-600/15 border border-blue-500/20 rounded-xl flex items-center justify-center text-blue-400 flex-shrink-0">
                        {sectors[activeSector].icon}
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white mb-1.5">{sectors[activeSector].title}</h3>
                        <p className="text-sm text-slate-400 leading-relaxed">{sectors[activeSector].desc}</p>
                      </div>
                    </div>

                    {/* Modules */}
                    <div className="px-8 py-6">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-4">
                        Bu sektörde kullanılan modüller
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        {sectors[activeSector].modules.map((mod, i) => (
                          <motion.div
                            key={mod}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.06 }}
                            className="flex items-center gap-3 bg-slate-900/60 border border-slate-700/50 rounded-lg px-4 py-3 hover:border-slate-600 transition-colors duration-150"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                            <span className="text-sm text-slate-300 font-medium">{mod}</span>
                          </motion.div>
                        ))}
                      </div>

                      <div className="mt-6 pt-5 border-t border-slate-700 flex items-center justify-between">
                        <span className="text-xs text-slate-500">
                          {sectors[activeSector].title} sektörüne özel yapılandırma mevcuttur.
                        </span>
                        <button className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors">
                          Demo Talep Et
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="why"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              {whyItems.map((item, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.07 }}
                  className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 hover:border-slate-600 transition-colors duration-150 group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-10 h-10 bg-blue-600/15 border border-blue-500/20 rounded-lg flex items-center justify-center text-blue-400">
                      {item.icon}
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-800 border border-slate-700 px-2 py-1 rounded uppercase tracking-wider">
                      {item.badge}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
                </motion.div>
              ))}

              {/* Bottom certs strip */}
              <div className="sm:col-span-2 bg-slate-800/20 border border-slate-800 rounded-xl px-6 py-4 flex flex-wrap items-center gap-x-8 gap-y-2">
                <span className="text-xs text-slate-500 font-medium">Sertifikalar ve uyumluluklar:</span>
                {['ISO 27001', 'KVKK', '256-bit SSL', 'e-Fatura', 'e-Arşiv', 'SGK', 'GİB'].map((cert) => (
                  <span key={cert} className="text-xs font-semibold text-slate-400">{cert}</span>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </section>
  );
}
