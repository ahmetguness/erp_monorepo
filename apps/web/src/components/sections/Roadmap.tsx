'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const STEPS = [
  {
    num: '01',
    title: 'İhtiyaç & Süreç Analizi',
    short: '1. Analiz',
    desc: 'Mevcut operasyonel süreçlerinizi, departman iş akışlarınızı ve raporlama ihtiyaçlarınızı uzman ekibimizle birlikte haritalandırıyoruz.',
    scope: 'Analiz & Kapsam',
    items: [
      'Mevcut departman süreçlerinin haritalanması',
      'Kullanılacak modüllerin ve yetki matrisinin belirlenmesi',
      'Geçiş takviminin ve paydaşların netleştirilmesi',
      'Entegrasyon gereksinimlerinin tespiti',
    ],
  },
  {
    num: '02',
    title: 'Sistem Yapılandırması',
    short: '2. Yapılandırma',
    desc: 'Sistemi işletmenizin organizasyon şemasına, depo yapısına, onay sınırlarına ve hesap planına göre yapılandırıyoruz.',
    scope: 'Özelleştirme',
    items: [
      'Kullanıcı rolleri ve yetkilendirmelerin tanımlanması',
      'Şube, depo, raf ve istasyon yapısının kurulması',
      'Teklif, sipariş ve onay hiyerarşisi kuralları',
      'e-Fatura ve e-İrsaliye parametrelerinin eşlenmesi',
    ],
  },
  {
    num: '03',
    title: 'Veri Aktarımı & Kontrol',
    short: '3. Veri Aktarımı',
    desc: 'Mevcut carileriniz, stok kartlarınız, açık bakiyeleriniz ve geçmiş verileriniz kontrollü biçimde sisteme aktarılır ve doğrulanır.',
    scope: 'Migrasyon',
    items: [
      'Mevcut cari ve stok kayıtlarının şablonlarla aktarımı',
      'Açık sipariş ve bakiye mutabakatı',
      'Kullanıcı kabul testleri ve süreç denemeleri',
      'Çift yönlü entegrasyon testlerinin yürütülmesi',
    ],
  },
  {
    num: '04',
    title: 'Eğitim & Canlı Kullanım',
    short: '4. Canlı Kullanım',
    desc: 'Departman bazlı uygulamalı kullanıcı eğitimleri verilir, canlı kullanıma geçiş esnasında ve sonrasında teknik destek sağlanır.',
    scope: 'Devreye Alma',
    items: [
      'Rol ve modül bazlı uygulamalı kullanıcı eğitimleri',
      'Canlı geçiş sürecinde doğrudan uzman rehberliği',
      'Kullanıcı geri bildirimlerine göre ince ayarlar',
      'Kesintisiz teknik destek ve sürüm güncellemeleri',
    ],
  },
];

export default function Roadmap() {
  const [active, setActive] = useState(0);

  return (
    <section className="py-20 lg:py-28 bg-[#080F1E] border-t border-slate-800 text-slate-100 overflow-hidden">
      <div className="section-container">
        
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-12">
          <div>
            <div className="section-label">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span>DEVREYE ALMA SÜRECİ</span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight mb-3">
              Sistemden canlı kullanıma 4 adım.
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
              İşletmenizin mevcut operasyonunu kesintiye uğratmadan, planlı ve kontrollü bir geçiş süreci yürütüyoruz.
            </p>
          </div>

          <div className="flex items-center gap-1.5 self-start lg:self-auto">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`transition-all duration-200 rounded-full cursor-pointer ${
                  i === active
                    ? 'w-8 h-1.5 bg-blue-500'
                    : 'w-2 h-1.5 bg-slate-700 hover:bg-slate-500'
                }`}
                aria-label={`Adım ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Steps Navigation */}
          <div className="lg:col-span-4 flex flex-col gap-2">
            {STEPS.map((s, idx) => (
              <button
                key={idx}
                onClick={() => setActive(idx)}
                className={`p-4 rounded-xl text-left transition-all duration-150 cursor-pointer border flex items-center justify-between ${
                  active === idx
                    ? 'bg-[#0B1424] border-blue-500/60 shadow-md shadow-blue-500/10'
                    : 'bg-[#0B1424]/40 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <span className={`text-xl font-mono font-bold ${active === idx ? 'text-blue-400' : 'text-slate-600'}`}>
                    {s.num}
                  </span>
                  <div>
                    <div className={`text-xs sm:text-sm font-semibold ${active === idx ? 'text-white' : 'text-slate-300'}`}>
                      {s.title}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{s.scope}</div>
                  </div>
                </div>

                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  active === idx ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}>
                  {idx + 1}
                </div>
              </button>
            ))}
          </div>

          {/* Right Column: Step Detail Checklist */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="bg-[#0B1424] border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl"
              >
                <div className="pb-4 border-b border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-blue-400 mb-1 block">
                      Adım {STEPS[active].num} — {STEPS[active].scope}
                    </span>
                    <h3 className="text-xl font-bold text-white">
                      {STEPS[active].title}
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-400 bg-white/[0.04] px-2.5 py-1 rounded border border-white/[0.08]">
                    Planlı İlerleme
                  </span>
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">
                  {STEPS[active].desc}
                </p>

                {/* Checklist */}
                <div>
                  <div className="text-xs font-semibold text-slate-400 mb-3">
                    Bu Aşamada Yürütülen Temel Faaliyetler:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {STEPS[active].items.map((item, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg bg-[#080F1E] border border-slate-800 flex items-start gap-2.5 text-xs text-slate-200"
                      >
                        <span className="text-blue-400 font-bold mt-0.5">✓</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Realistic Note (No False Day Guarantees) */}
                <div className="pt-4 border-t border-slate-800 text-xs text-slate-400">
                  Kurulum ve geçiş süresi; işletmenizin organizasyon kapsamına, veri hacmine ve seçilen modüllere göre karşılıklı mutabakatla belirlenir.
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

        </div>

      </div>
    </section>
  );
}
