'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const steps = [
  {
    num: '01',
    title: 'Ihtiyac Analizi',
    short: 'Analiz',
    desc: 'Mevcut sureclerinizi ve is akislarinizi inceliyor, sisteme gecis planini birlikte hazirliyoruz.',
    duration: '1-2 is gunu',
    tag: 'Baslangic',
    items: [
      'Mevcut surec haritalama',
      'Ihtiyac ve modul belirleme',
      'Gecis takvimi olusturma',
      'Teknik altyapi degerlendirmesi',
    ],
  },
  {
    num: '02',
    title: 'Demo ve Yapilandirma',
    short: 'Demo',
    desc: 'Sistemi isletmenize ozel yapilandiriyor, kullanici rolleri ve yetkilendirmeleri tanimliyoruz.',
    duration: '2-3 is gunu',
    tag: 'Yapilandirma',
    items: [
      'Canli sistem demosu',
      'Kullanici rol tanimlari',
      'Modul ozellestirme',
      'Onay akislari kurulumu',
    ],
  },
  {
    num: '03',
    title: 'Kurulum ve Veri Aktarimi',
    short: 'Kurulum',
    desc: 'Mevcut verilerinizi sisteme aktariyor, entegrasyonlari tamamliyor ve test surecini yurutuyor.',
    duration: '3-5 is gunu',
    tag: 'Entegrasyon',
    items: [
      'Veri migrasyonu ve dogrulama',
      'Entegrasyon kurulumu',
      'Kullanici kabul testleri',
      'Performans ve guvenlik testleri',
    ],
  },
  {
    num: '04',
    title: 'Egitim ve Canli Kullanim',
    short: 'Canli',
    desc: 'Ekibinize modul bazli egitimler veriyor, canli gecis sonrasinda teknik destek sagliyoruz.',
    duration: 'Surekli',
    tag: 'Canli Kullanim',
    items: [
      'Modul bazli kullanici egitimi',
      'Canli gecis yonetimi',
      '7/24 teknik destek',
      'Duzenli guncelleme ve bakim',
    ],
  },
];

export default function Roadmap() {
  const [active, setActive] = useState(0);

  return (
    <section className="section-spacing relative bg-[#0F172A] overflow-hidden">

      <div className="section-container relative z-10">

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-12">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
          >
            <div className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">
              Uygulama Sureci
            </div>
            <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2">
              Sistemden canli kullanima 4 adim
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed max-w-lg">
              Her adimda uzman ekibimiz sureci sizin adiniza yonetir.
              Kurulum ve gecis surecinde kesinti yasamazsiniz.
            </p>
          </motion.div>

          {/* Progress pills */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={
                  'transition-all duration-300 rounded-full ' +
                  (i === active
                    ? 'w-8 h-1.5 bg-blue-500'
                    : i < active
                    ? 'w-2 h-1.5 bg-blue-800'
                    : 'w-2 h-1.5 bg-slate-700 hover:bg-slate-500')
                }
              />
            ))}
          </div>
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

          {/* Left: step list */}
          <div className="lg:col-span-4 flex flex-col gap-1.5">
            {steps.map((s, idx) => (
              <motion.button
                key={idx}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.3, delay: idx * 0.07 }}
                onClick={() => setActive(idx)}
                className={
                  'group relative text-left rounded-lg border transition-all duration-200 overflow-hidden ' +
                  (active === idx
                    ? 'bg-slate-800 border-slate-600'
                    : 'bg-slate-800/30 border-slate-800 hover:border-slate-700 hover:bg-slate-800/60')
                }
              >
                {active === idx && (
                  <motion.div
                    layoutId="step-accent"
                    className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500"
                  />
                )}

                <div className="px-5 py-4 flex items-center gap-4">
                  <span className={
                    'text-2xl font-black leading-none tabular-nums select-none transition-colors ' +
                    (active === idx ? 'text-slate-500' : 'text-slate-700 group-hover:text-slate-600')
                  }>
                    {s.num}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className={
                      'text-sm font-medium leading-tight transition-colors ' +
                      (active === idx ? 'text-white' : 'text-slate-400 group-hover:text-slate-200')
                    }>
                      {s.title}
                    </div>
                    <div className="text-xs mt-0.5 text-slate-500">{s.duration}</div>
                  </div>

                  <div className={
                    'w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all ' +
                    (active > idx
                      ? 'bg-blue-600'
                      : active === idx
                      ? 'bg-blue-600'
                      : 'bg-slate-700')
                  }>
                    {active > idx ? (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <span className={
                        'text-[10px] font-bold ' +
                        (active === idx ? 'text-white' : 'text-slate-500')
                      }>
                        {idx + 1}
                      </span>
                    )}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Right: detail card */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden h-full"
              >
                {/* Card header */}
                <div className="px-8 py-6 border-b border-slate-700 flex items-start justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-xs font-semibold text-blue-400 uppercase tracking-widest">
                        Adim {steps[active].num}
                      </span>
                      <span className="w-px h-3 bg-slate-600" />
                      <span className="text-xs text-slate-500">{steps[active].tag}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">
                      {steps[active].title}
                    </h3>
                    <p className="text-slate-400 text-sm leading-relaxed max-w-md">
                      {steps[active].desc}
                    </p>
                  </div>

                  <div className="flex-shrink-0 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-center min-w-[80px]">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Sure</div>
                    <div className="text-sm font-semibold text-slate-200 whitespace-nowrap">
                      {steps[active].duration}
                    </div>
                  </div>
                </div>

                {/* Checklist */}
                <div className="px-8 py-6">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest mb-4">
                    Bu adimda yapilacaklar
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {steps[active].items.map((item, i) => (
                      <motion.div
                        key={item}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className="flex items-center gap-3 bg-slate-900/60 border border-slate-700/60 rounded px-4 py-3 hover:border-slate-600 hover:bg-slate-900/80 transition-colors duration-150"
                      >
                        <div className="w-4 h-4 rounded-sm bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                          <svg className="w-2.5 h-2.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <span className="text-sm text-slate-300">{item}</span>
                      </motion.div>
                    ))}
                  </div>

                  {/* Footer nav */}
                  <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-700">
                    <button
                      onClick={() => setActive(Math.max(0, active - 1))}
                      disabled={active === 0}
                      className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-200 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Onceki
                    </button>

                    <span className="text-xs text-slate-600 tabular-nums">
                      {active + 1} / {steps.length}
                    </span>

                    <button
                      onClick={() => setActive(Math.min(steps.length - 1, active + 1))}
                      disabled={active === steps.length - 1}
                      className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                    >
                      Sonraki
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
