'use client';

import { motion } from 'framer-motion';

const stats = [
  { value: '%35', label: 'Verimlilik artisi', sub: 'ilk 6 ayda', width: '35%' },
  { value: '%60', label: 'Manuel islem azalmasi', sub: 'fatura ve stok sureclerinde', width: '60%' },
  { value: '%80', label: 'Raporlama hizi', sub: 'aylik kapanista', width: '80%' },
  { value: '%45', label: 'Hata payi azalmasi', sub: 'veri girisinde', width: '45%' },
];

const benefits = [
  {
    title: 'Operasyonel verimlilik',
    desc: 'Tekrarlayan manuel islemleri otomatiklestirerek ekibinizin zamanini daha degerli islere ayirin.',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
  {
    title: 'Veriye dayali kararlar',
    desc: 'Gercek zamanli raporlar ve yonetim panolari ile isletmenizin durumunu anlik takip edin.',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    title: 'Departmanlar arasi koordinasyon',
    desc: 'Satis, muhasebe, depo ve uretim ayni veri uzerinde calisir. Bilgi kopuklugu ortadan kalkar.',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    title: 'Maliyet kontrolu',
    desc: 'Kaynak israfini azaltin, maliyetleri gercek zamanli izleyin ve butce sapmalarini onceden goruntuleyin.',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export default function ROI() {
  return (
    <section className="section-spacing relative bg-[#0F172A] overflow-hidden">
      {/* Glow */}
      <div className="absolute top-1/2 left-0 -translate-y-1/2 w-[400px] h-[400px] bg-blue-600/6 rounded-full blur-[100px] pointer-events-none" />

      <div className="section-container relative z-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="mb-12"
        >
          <p className="text-sm text-blue-400 font-medium mb-3 border-l-2 border-blue-500 pl-3">İş Değeri</p>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <h2 className="text-2xl lg:text-3xl font-bold text-white max-w-lg leading-tight">
              ERP yatiriminin geri donusu olculebilir
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed max-w-sm">
              Dijitallasme bir maliyet kalemi degil, olculebilir getirisi olan bir yatirimdir.
            </p>
          </div>
        </motion.div>

        {/* Stats bar — full width */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-800 rounded-xl overflow-hidden border border-slate-800 mb-6"
        >
          {stats.map((s, idx) => (
            <div key={idx} className="bg-[#0F172A] px-6 py-5 group hover:bg-slate-800/50 transition-colors duration-150">
              <div className="text-2xl lg:text-3xl font-black text-white mb-1 tabular-nums">{s.value}</div>
              <div className="text-xs font-medium text-slate-300 mb-0.5">{s.label}</div>
              <div className="text-xs text-slate-600 mb-3">{s.sub}</div>
              <div className="h-0.5 bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-blue-500 rounded-full"
                  initial={{ width: 0 }}
                  whileInView={{ width: s.width }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, delay: 0.2 + idx * 0.1, ease: 'easeOut' }}
                />
              </div>
            </div>
          ))}
        </motion.div>

        {/* Benefits + CTA */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Benefits grid */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {benefits.map((b, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: idx * 0.07 }}
                className="bg-slate-800/40 border border-slate-700 rounded-lg p-5 hover:border-slate-600 transition-colors duration-150"
              >
                <div className="w-7 h-7 bg-blue-500/10 text-blue-400 rounded flex items-center justify-center mb-3">
                  {b.icon}
                </div>
                <div className="text-sm font-semibold text-white mb-1.5">{b.title}</div>
                <div className="text-xs text-slate-400 leading-relaxed">{b.desc}</div>
              </motion.div>
            ))}
          </div>

          {/* CTA card */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="bg-slate-800/40 border border-slate-700 rounded-lg p-6 flex flex-col justify-between"
          >
            <div>
              <p className="text-sm text-slate-400 font-medium mb-4">
                Analiz Talep Et
              </p>
              <p className="text-sm text-slate-300 leading-relaxed mb-6">
                Isletmenizin mevcut sureclerini analiz ederek size ozel bir ROI raporu hazirlayabiliriz.
              </p>

              {/* Mini checklist */}
              <div className="space-y-2.5 mb-6">
                {['Süreç analizi', 'Tasarruf hesaplaması', 'Yatırım geri dönüş süresi'].map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-xs text-slate-400">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-3 rounded-md transition-colors duration-150">
              Detayli Analiz Talep Et
            </button>
          </motion.div>
        </div>

      </div>
    </section>
  );
}
