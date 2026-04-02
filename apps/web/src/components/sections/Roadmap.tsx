'use client';

import { motion } from 'framer-motion';

const steps = [
  {
    title: 'Analiz & Planlama',
    desc: 'İşletmenizin mevcut süreçlerini inceliyor, dijitalleşme yol haritasını hazırlıyoruz.',
    icon: '🔍',
    color: 'blue'
  },
  {
    title: 'Kurulum & Entegrasyon',
    desc: 'ERP sistemini altyapınıza kuruyor, veri aktarımlarını ve entegrasyonları tamamlıyoruz.',
    icon: '⚙️',
    color: 'blue'
  },
  {
    title: 'Eğitim & Test',
    desc: 'Ekibinize modül bazlı eğitimler veriyor ve canlı geçiş öncesi uçtan uca testleri yapıyoruz.',
    icon: '🎓',
    color: 'blue'
  },
  {
    title: 'Canlı Geçiş & Destek',
    desc: 'Sistemi devreye alıyor ve 7/24 kesintisiz teknik destek sürecini başlatıyoruz.',
    icon: '🚀',
    color: 'blue'
  }
];

export default function Roadmap() {
  return (
    <section className="section-spacing bg-white overflow-hidden">
      <div className="section-container">
        <header className="text-center max-w-2xl mx-auto mb-24 space-y-4">
          <h2 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-none uppercase tracking-tighter">Başarı Yol Haritası</h2>
          <p className="text-xl text-slate-600 font-medium">Fikir aşamasından canlı kullanıma, her adımda yanınızdayız.</p>
        </header>
        
        <div className="relative">
          {/* Connecting Line (Desktop) */}
          <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-100 -translate-y-1/2 hidden lg:block" />
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 relative z-10">
            {steps.map((s, idx) => (
              <motion.article 
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: idx * 0.1 }}
                className="bg-white p-8 lg:p-12 rounded-3xl border border-slate-100 flex flex-col items-center text-center space-y-6 hover:shadow-2xl hover:border-blue-600 transition-all group"
              >
                <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center text-3xl group-hover:scale-110 group-hover:bg-blue-600 group-hover:text-white transition-all duration-500 shadow-xl shadow-blue-900/5">
                  {s.icon}
                </div>
                
                <div className="space-y-4">
                  <div className="text-xs font-black text-blue-700 uppercase tracking-[0.3em]">Adım {idx + 1}</div>
                  <h3 className="text-xl font-bold text-slate-900 uppercase tracking-widest">{s.title}</h3>
                  <p className="text-slate-500 font-bold leading-relaxed text-sm italic">
                    {s.desc}
                  </p>
                </div>

                {/* Progress Dot (Desktop) */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-white border-4 border-blue-600 rounded-full hidden lg:block scale-0 group-hover:scale-100 transition-transform" style={{ top: '50%' }} />
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
