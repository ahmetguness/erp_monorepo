'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const models = [
  {
    id: 'cloud',
    label: 'Bulut',
    title: 'Bulut (SaaS)',
    subtitle: 'Hızlı başlangıç, sıfır altyapı yükü',
    desc: 'Sunucu kurulumu, bakım veya güncelleme gerektirmez. Sisteme tarayıcı üzerinden her cihazdan erişin. Axon altyapısı sizin adınıza yönetilir.',
    ideal: 'Hızlı dijitalleşmek isteyen, IT ekibi olmayan veya düşük başlangıç maliyeti arayan işletmeler için idealdir.',
    features: [
      { label: 'Kurulum süresi', value: '1-2 gün' },
      { label: 'Başlangıç maliyeti', value: 'Düşük' },
      { label: 'Güncelleme', value: 'Otomatik' },
      { label: 'Erişim', value: 'Her cihaz' },
      { label: 'Yedekleme', value: 'Günlük otomatik' },
      { label: 'Ödeme modeli', value: 'Aylık abonelik' },
    ],
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
      </svg>
    ),
  },
  {
    id: 'onprem',
    label: 'Şirket İçi',
    title: 'Şirket İçi (On-Premise)',
    subtitle: 'Tam kontrol, maksimum güvenlik',
    desc: 'Sistem kendi sunucularınızda çalışır. Verileriniz şirket ağınızdan dışarı çıkmaz. İnternet bağlantısı olmadan da kullanılabilir.',
    ideal: 'Veri gizliliğine önem veren, kendi IT altyapısına sahip veya internet bağımsız çalışma gerektiren kurumlar için idealdir.',
    features: [
      { label: 'Kurulum süresi', value: '3-5 gün' },
      { label: 'Başlangıç maliyeti', value: 'Tek seferlik' },
      { label: 'Güncelleme', value: 'Manuel / Planlı' },
      { label: 'Erişim', value: 'Yerel ağ' },
      { label: 'Yedekleme', value: 'Kendi kontrolünüz' },
      { label: 'Ödeme modeli', value: 'Lisans + bakım' },
    ],
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
      </svg>
    ),
  },
];

export default function Deployment() {
  const [active, setActive] = useState<'cloud' | 'onprem'>('cloud');
  const model = models.find(m => m.id === active)!;

  return (
    <section id="deployment" className="section-spacing relative bg-[#0F172A] overflow-hidden">
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-indigo-600/5 rounded-full blur-[100px] pointer-events-none" />

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
            <div className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">Kurulum Modelleri</div>
            <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2">
              Altyapınıza uygun kurulum seçeneği
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed max-w-lg">
              Her iki seçenek de tam teknik destek ve eğitim ile sunulmaktadır.
            </p>
          </div>

          {/* Toggle */}
          <div className="flex bg-slate-800/60 border border-slate-700 rounded-lg p-1 w-fit flex-shrink-0">
            {models.map(m => (
              <button
                key={m.id}
                onClick={() => setActive(m.id as 'cloud' | 'onprem')}
                className={
                  'px-5 py-2 rounded-md text-sm font-medium transition-all duration-150 ' +
                  (active === m.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200')
                }
              >
                {m.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Detail card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-4"
          >
            {/* Left: info */}
            <div className="lg:col-span-5 bg-slate-800/40 border border-slate-700 rounded-xl p-8 flex flex-col gap-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-600/15 border border-blue-500/20 rounded-xl flex items-center justify-center text-blue-400 flex-shrink-0">
                  {model.icon}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white mb-0.5">{model.title}</h3>
                  <p className="text-xs text-blue-400 font-medium">{model.subtitle}</p>
                </div>
              </div>

              <p className="text-sm text-slate-400 leading-relaxed">{model.desc}</p>

              <div className="bg-slate-900/60 border border-slate-700/50 rounded-lg px-5 py-4">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Kimler için ideal?</div>
                <p className="text-sm text-slate-300 leading-relaxed">{model.ideal}</p>
              </div>

              <button className="mt-auto w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-3 rounded-lg transition-colors duration-150">
                Bu Seçenek Hakkında Bilgi Al
              </button>
            </div>

            {/* Right: feature table */}
            <div className="lg:col-span-7 bg-slate-800/40 border border-slate-700 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-700 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Teknik Özellikler</span>
              </div>

              <div className="divide-y divide-slate-700/60">
                {model.features.map((f, i) => (
                  <motion.div
                    key={f.label}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06 }}
                    className="flex items-center justify-between px-6 py-4 hover:bg-slate-800/40 transition-colors duration-150"
                  >
                    <span className="text-sm text-slate-400">{f.label}</span>
                    <span className="text-sm font-semibold text-slate-200 bg-slate-900/60 border border-slate-700 px-3 py-1 rounded-md">
                      {f.value}
                    </span>
                  </motion.div>
                ))}
              </div>

              {/* Comparison hint */}
              <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between">
                <span className="text-xs text-slate-600">
                  {active === 'cloud' ? 'Şirket içi kurulum için' : 'Bulut çözümü için'}
                </span>
                <button
                  onClick={() => setActive(active === 'cloud' ? 'onprem' : 'cloud')}
                  className="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors flex items-center gap-1"
                >
                  {active === 'cloud' ? 'On-Premise' : 'SaaS'} seçeneğini incele
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Bottom strip */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4"
        >
          {[
            { icon: '🔒', text: 'Her iki modelde de ISO 27001 güvenlik standardı' },
            { icon: '🎓', text: 'Kurulum sonrası modül bazlı eğitim dahil' },
            { icon: '🛠', text: '7/24 teknik destek ve bakım hizmeti' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-3 bg-slate-800/20 border border-slate-800 rounded-lg px-4 py-3">
              <span className="text-base flex-shrink-0">{item.icon}</span>
              <span className="text-xs text-slate-500">{item.text}</span>
            </div>
          ))}
        </motion.div>

      </div>
    </section>
  );
}
