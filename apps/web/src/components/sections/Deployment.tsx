'use client';

import { motion } from 'framer-motion';

export default function Deployment() {
  const models = [
    {
      title: 'Bulut (SaaS)',
      desc: 'Hızlı kurulum, otomatik güncellemeler ve düşük maliyetli hosting.',
      features: ['Düşük Yatırım Maliyeti', 'Otomatik Yedekleme', 'Her Yerden Erişim', '7/24 Kesintisiz Güncelleme'],
      icon: '☁️',
      primary: true
    },
    {
      title: 'Sunucu (On-Premise)',
      desc: 'Kendi sunucularınızda tam kontrol ve maksimum güvenlik özelleştirmeleri.',
      features: ['Tam Veri Kontrolü', 'Yerel Ağ Erişimi', 'Bir Kez Satın Al (Lisans)', 'İnternet Bağımsız Çalışma'],
      icon: '🖥️',
      primary: false
    }
  ];

  return (
    <section className="section-spacing bg-white border-y border-slate-50">
      <div className="section-container">
        <header className="text-center max-w-2xl mx-auto mb-20 space-y-4">
          <h2 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-none uppercase tracking-tighter">Esnek Kurulum Modelleri</h2>
          <p className="text-xl text-slate-600 font-medium leading-relaxed tracking-tight underline decoration-slate-100 decoration-8 underline-offset-8">İşletmenizin altyapı tercihlerine tam uyum sağlayan çözümler.</p>
        </header>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 max-w-5xl mx-auto">
          {models.map((m, idx) => (
            <motion.article 
              key={idx}
              initial={{ opacity: 0, x: idx === 0 ? -20 : 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
              className={`p-12 lg:p-20 rounded-3xl border-2 flex flex-col space-y-12 transition-all duration-500 hover:shadow-2xl ${
                m.primary 
                ? 'bg-blue-700 border-blue-700 text-white shadow-xl shadow-blue-700/20' 
                : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <div className="space-y-6">
                <div className="text-5xl">{m.icon}</div>
                <h3 className="text-3xl lg:text-4xl font-black uppercase tracking-widest">{m.title}</h3>
                <p className={`text-lg font-bold leading-relaxed ${m.primary ? 'text-blue-100' : 'text-slate-500'}`}>
                  {m.desc}
                </p>
              </div>
              
              <ul className="space-y-4 border-t border-white/20 border-slate-100 pt-8 flex-grow">
                {m.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-4 text-sm font-black uppercase tracking-wider">
                    <div className={`w-2 h-2 rounded-full ${m.primary ? 'bg-white' : 'bg-blue-600'}`} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              
              <div className="pt-8">
                <button className={`w-full py-5 rounded text-xs font-black uppercase tracking-widest transition-all ${
                  m.primary 
                  ? 'bg-white text-blue-700 hover:bg-slate-100' 
                  : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}>
                  Modeli İncele
                </button>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
