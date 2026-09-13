'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const MODELS = [
  {
    id: 'cloud',
    label: 'Bulut (SaaS)',
    title: 'Bulut (SaaS) Modeli',
    subtitle: 'Hızlı başlangıç, sıfır sunucu donanım yükü',
    desc: 'Sunucu altyapısı, sistem bakımı veya yedekleme zahmeti olmadan; internet tarayıcısı üzerinden tüm cihazlardan erişin.',
    ideal: 'Hızlı devreye alma arayan, ayrı bir IT sunucu ekibi bulunmayan veya esnek abonelik modeli tercih eden işletmeler için uygundur.',
    features: [
      { label: 'Erişim Şekli', value: 'Web Tarayıcı / Her Cihaz' },
      { label: 'Sunucu Bakımı', value: 'Axon Altyapısı Tarafından Yönetilir' },
      { label: 'Yedekleme', value: 'Düzenli Otomatik Veritabanı Yedeği' },
      { label: 'Sürüm Güncellemeleri', value: 'Otomatik ve Kesintisiz' },
      { label: 'Ödeme Modeli', value: 'Aylık veya Yıllık Lisans' },
    ],
  },
  {
    id: 'onprem',
    label: 'Şirket İçi (On-Premise)',
    title: 'Şirket İçi (On-Premise) Modeli',
    subtitle: 'Kendi sunucularınızda tam veri kontrolü',
    desc: 'ERP sistemi doğrudan şirketinizin yerel ağındaki veya özel sanal sunucunuzdaki donanımlarda barındırılır. Veriler şirket ağınızda kalır.',
    ideal: 'Şirket politikası gereği verilerini kendi sunucularında tutmak isteyen, yerleşik IT altyapısına sahip kurumlar için uygundur.',
    features: [
      { label: 'Erişim Şekli', value: 'Yerel Ağ / Özel Güvenli VPN' },
      { label: 'Sunucu Yönetimi', value: 'Şirketinizin Kendi Sunucularında' },
      { label: 'Veri Saklama', value: 'Kurum İçi Veritabanında' },
      { label: 'Sürüm Güncellemeleri', value: 'Planlı ve Kontrollü Dağıtım' },
      { label: 'Ödeme Modeli', value: 'Kurumsal Lisans & Bakım Anlaşması' },
    ],
  },
];

export default function Deployment() {
  const [activeModelId, setActiveModelId] = useState<'cloud' | 'onprem'>('cloud');
  const activeModel = MODELS.find((m) => m.id === activeModelId) || MODELS[0];

  return (
    <section id="deployment" className="py-20 lg:py-28 bg-[#080F1E] border-t border-slate-800 text-slate-100 overflow-hidden">
      <div className="section-container">
        
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
          <div>
            <div className="section-label">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span>KURULUM SEÇENEKLERİ</span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight mb-3">
              Altyapınıza uygun kurulum seçeneği.
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-lg">
              İster bulut üzerinde hızlıca başlayın, ister şirketinizin kendi sunucu altyapısında tam veri kontrolüyle çalışın.
            </p>
          </div>

          {/* Model Toggle Switcher */}
          <div className="flex bg-[#0B1424] border border-slate-800 rounded-xl p-1 w-fit self-start lg:self-auto">
            {MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setActiveModelId(m.id as 'cloud' | 'onprem')}
                className={`px-5 py-2 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  activeModelId === m.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Model Details Comparison Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeModel.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* Left Info Card */}
            <div className="lg:col-span-5 bg-[#0B1424] border border-slate-800 rounded-2xl p-7 flex flex-col justify-between space-y-6 shadow-xl">
              <div className="space-y-4">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">
                    {activeModel.title}
                  </h3>
                  <p className="text-xs font-medium text-blue-400">
                    {activeModel.subtitle}
                  </p>
                </div>

                <p className="text-sm text-slate-300 leading-relaxed">
                  {activeModel.desc}
                </p>

                <div className="p-4 rounded-xl bg-[#080F1E] border border-slate-800/80">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
                    Kimler İçin Uygun?
                  </span>
                  <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                    {activeModel.ideal}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('openChatWithMessage', {
                      detail: `${activeModel.title} hakkında teknik gereksinimler ve teklif bilgisi talep ediyorum.`,
                    })
                  );
                }}
                className="btn-primary w-full text-xs py-3 justify-center flex items-center gap-1.5 cursor-pointer"
              >
                <span>Bu Kurulum Seçeneği İçin Bilgi Alın</span>
                <span>→</span>
              </button>
            </div>

            {/* Right Technical Parameters Table */}
            <div className="lg:col-span-7 bg-[#0B1424] border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-xl flex flex-col justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-400 pb-3 border-b border-slate-800 mb-2">
                  Model Özellikleri & Karşılaştırma
                </div>

                <div className="divide-y divide-slate-800/80">
                  {activeModel.features.map((f, i) => (
                    <div key={i} className="py-3.5 flex items-center justify-between gap-4 text-xs sm:text-sm">
                      <span className="text-slate-400">{f.label}</span>
                      <span className="font-semibold text-white bg-[#080F1E] px-3 py-1 rounded-md border border-slate-800 text-right">
                        {f.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 mt-4 border-t border-slate-800 text-xs text-slate-500">
                Her iki modelde de kullanıcı eğitimleri ve sistem devreye alma desteği sağlanmaktadır.
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

      </div>
    </section>
  );
}
