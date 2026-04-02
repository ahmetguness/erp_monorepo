'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const modules = [
  {
    id: 'finance',
    title: 'Muhasebe ve Finans',
    desc: 'Finansal sureclerinizi eksiksiz dijitalleştirin. Beyanname takibinden nakit akisina kadar tum muhasebe islemleri tek ekranda.',
    features: [
      'Genel muhasebe ve yevmiye defteri',
      'Beyanname hazirlama ve takibi',
      'Nakit akis yonetimi',
      'E-Fatura ve e-Arsiv entegrasyonu',
      'Banka hesap mutabakatı',
      'Maliyet muhasebesi ve analizi',
    ],
    metrics: [
      { label: 'Aylik Ciro', value: '2.847.500', unit: 'TL', trend: '+12%' },
      { label: 'Tahsilat', value: '1.240.000', unit: 'TL', trend: '+8%' },
      { label: 'Bekleyen Fatura', value: '23', unit: 'adet', trend: null },
    ],
  },
  {
    id: 'sales',
    title: 'Satis ve CRM',
    desc: 'Musteri iliskilerini ve satis sureclerini veriye dayali yonetin. Tekliften faturaya tum satis akisi tek sistemde.',
    features: [
      'Musteri ve potansiyel musteri takibi',
      'Teklif hazirlama ve onay sureci',
      'Satis firsatlari (pipeline) yonetimi',
      'Siparis ve teslimat takibi',
      'Satis performans raporlari',
      'Saha satis ekibi yonetimi',
    ],
    metrics: [
      { label: 'Acik Teklif', value: '47', unit: 'adet', trend: '+5' },
      { label: 'Bu Ay Satis', value: '184.200', unit: 'TL', trend: '+18%' },
      { label: 'Musteri Sayisi', value: '312', unit: 'aktif', trend: null },
    ],
  },
  {
    id: 'production',
    title: 'Uretim ve Planlama',
    desc: 'Uretim sureclerinizi planlayın, takip edin ve optimize edin. Kaynak israfini azaltin, verimliligi artirin.',
    features: [
      'Malzeme ihtiyac planlamasi (MRP)',
      'Is emirleri ve uretim takibi',
      'Kalite kontrol surecleri',
      'Fason uretim takibi',
      'Makine ve ekipman yonetimi',
      'Uretim maliyet analizi',
    ],
    metrics: [
      { label: 'Aktif Is Emri', value: '18', unit: 'adet', trend: null },
      { label: 'Verimlilik', value: '94', unit: '%', trend: '+3%' },
      { label: 'Stok Donus', value: '8.2', unit: 'gun', trend: '-1.1' },
    ],
  },
];

export default function DeepDive() {
  const [activeTab, setActiveTab] = useState(modules[0].id);
  const active = modules.find((m) => m.id === activeTab)!;

  return (
    <section className="section-spacing relative bg-[#0F172A] overflow-hidden">
      {/* Subtle glow */}
      <div className="absolute bottom-0 left-1/3 w-[500px] h-[300px] bg-blue-600/6 rounded-full blur-[100px] pointer-events-none" />

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
            <div className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">Modul Detaylari</div>
            <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2">Temel modullere yakindan bakin</h2>
            <p className="text-slate-400 text-sm leading-relaxed max-w-lg">
              Her modul, sektorunuzun ihtiyaclarina gore yapilandirilmis kapsamli ozellikler sunar.
            </p>
          </div>

          {/* Tab nav */}
          <div className="flex gap-1 bg-slate-800/60 border border-slate-700 rounded-lg p-1 w-fit">
            {modules.map((m) => (
              <button
                key={m.id}
                onClick={() => setActiveTab(m.id)}
                className={
                  'px-4 py-2 rounded-md text-sm font-medium transition-all duration-150 ' +
                  (activeTab === m.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50')
                }
              >
                {m.title.split(' ')[0]}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="grid grid-cols-1 lg:grid-cols-5 gap-4"
          >
            {/* Left: features list */}
            <div className="lg:col-span-3 bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
              {/* Module header */}
              <div className="px-6 py-5 border-b border-slate-700">
                <h3 className="text-base font-semibold text-white mb-1">{active.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{active.desc}</p>
              </div>

              {/* Feature grid */}
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {active.features.map((f, i) => (
                  <motion.div
                    key={f}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 px-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded hover:border-slate-600 transition-colors duration-150"
                  >
                    <div className="w-4 h-4 rounded-sm bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                      <svg className="w-2.5 h-2.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-sm text-slate-300">{f}</span>
                  </motion.div>
                ))}
              </div>

              {/* CTA */}
              <div className="px-6 pb-6 flex gap-3">
                <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-md transition-colors duration-150">
                  Demo Talep Et
                </button>
                <button className="bg-slate-700/50 hover:bg-slate-700 border border-slate-600 text-slate-300 hover:text-white text-sm font-semibold px-5 py-2.5 rounded-md transition-colors duration-150">
                  Brosur Indir
                </button>
              </div>
            </div>

            {/* Right: live metrics panel */}
            <div className="lg:col-span-2 flex flex-col gap-3">
              {/* Panel header */}
              <div className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
                <div className="bg-slate-900 px-4 py-2.5 flex items-center gap-2 border-b border-slate-700">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                  </div>
                  <span className="text-xs text-slate-500 ml-1">Canli Ozet</span>
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-green-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Canli
                  </span>
                </div>

                <div className="p-4 space-y-3">
                  {active.metrics.map((m, i) => (
                    <motion.div
                      key={m.label}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.07 }}
                      className="flex items-center justify-between py-2.5 border-b border-slate-700/50 last:border-0"
                    >
                      <span className="text-xs text-slate-500">{m.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white tabular-nums">{m.value}</span>
                        <span className="text-xs text-slate-500">{m.unit}</span>
                        {m.trend && (
                          <span className={
                            'text-xs font-medium px-1.5 py-0.5 rounded ' +
                            (m.trend.startsWith('+') ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10')
                          }>
                            {m.trend}
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Mini bar chart */}
              <div className="bg-slate-800/40 border border-slate-700 rounded-lg p-4">
                <div className="text-xs text-slate-500 mb-3">Son 6 ay performansi</div>
                <div className="flex items-end gap-1.5 h-16">
                  {[40, 65, 50, 80, 70, 90].map((h, i) => (
                    <motion.div
                      key={i}
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      transition={{ delay: 0.1 + i * 0.06, duration: 0.4, ease: 'easeOut' }}
                      className={
                        'flex-1 rounded-sm ' +
                        (i === 5 ? 'bg-blue-500' : 'bg-slate-700')
                      }
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-2">
                  {['Oca', 'Sub', 'Mar', 'Nis', 'May', 'Haz'].map((m) => (
                    <span key={m} className="text-[10px] text-slate-600">{m}</span>
                  ))}
                </div>
              </div>

              {/* Bottom link */}
              <button className="w-full bg-slate-800/40 border border-slate-700 hover:border-slate-600 rounded-lg px-4 py-3 flex items-center justify-between group transition-colors duration-150">
                <span className="text-sm text-slate-400 group-hover:text-slate-200 transition-colors">Tum raporlari goruntule</span>
                <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
