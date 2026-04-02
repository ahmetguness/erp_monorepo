'use client';

import { motion } from 'framer-motion';

export default function Pricing() {
  const tiers = [
    { 
      name: 'Giriş Paket', 
      price: '1.990', 
      features: ['3 Kullanıcı', 'Temel Muhasebe', 'Stok Takibi', 'E-Fatura Entegrasyonu', 'Mesai Saatleri Destek']
    },
    { 
      name: 'Profesyonel', 
      price: '4.990', 
      features: ['15 Kullanıcı', 'Tüm Finans Modülleri', 'CRM & Satış', 'Üretim Takibi', '7/24 Öncelikli Destek'],
      popular: true
    },
    { 
      name: 'Kurumsal', 
      price: 'Fiyat Alın', 
      features: ['Sınırsız Kullanıcı', 'API & Özel Geliştirme', 'On-Premise Opsiyonu', 'Kişisel Danışman', 'SLA Garantisi']
    }
  ];

  return (
    <section id="pricing" className="section-spacing relative bg-white overflow-hidden">
      {/* Decorative Accents */}
      <div className="absolute top-1/2 left-0 w-[600px] h-[600px] bg-blue-50 rounded-full blur-[120px] -z-10 -translate-x-1/2 -translate-y-1/2 opacity-60" />
      
      <div className="section-container">
        <motion.header 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
          className="text-center max-w-3xl mx-auto mb-32"
        >
          <div className="inline-block px-4 py-1.5 bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-[0.3em] rounded-full mb-8">
            Fiyatlandırma
          </div>
          <h2 className="text-5xl lg:text-7xl font-black text-slate-900 tracking-tight uppercase italic mb-8">
            Şeffaf ve <span className="text-blue-700">Esnek</span> Paketler
          </h2>
          <p className="text-xl text-slate-500 font-medium leading-relaxed italic max-w-2xl mx-auto">
            İşletmenizin büyüklüğüne ve ihtiyaçlarına göre en uygun planı seçin, dijitalleşmeye bugün başlayın.
          </p>
        </motion.header>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {tiers.map((t, idx) => (
            <motion.article 
              key={idx} 
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: idx * 0.1, ease: [0.22, 1, 0.36, 1] }}
              className={`glass-card group flex flex-col p-12 lg:p-16 relative ${
                t.popular ? 'border-blue-500 shadow-[0_60px_120px_-20px_rgba(37,99,235,0.2)]' : ''
              }`}
            >
              {t.popular && (
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-8 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.3em] leading-none shadow-2xl z-20">
                  EN POPÜLER
                </div>
              )}
              
              <div className="space-y-8 mb-12">
                <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-widest">{t.name}</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-6xl lg:text-7xl font-black text-slate-900 tracking-tighter leading-none italic">{t.price}</span>
                  {t.price !== 'Fiyat Alın' && <span className="text-xl font-black text-slate-400 italic">₺</span>}
                </div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Aylık Ödeme Plânı</div>
              </div>
              
              <ul className="space-y-6 flex-grow border-t border-slate-100 pt-12 mb-12">
                {t.features.map((f, i) => (
                  <li key={i} className="flex items-center gap-4 text-slate-600 text-sm font-medium italic">
                    <div className="w-5 h-5 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-500">
                      ✓
                    </div> 
                    {f}
                  </li>
                ))}
              </ul>
              
              <footer className="pt-4">
                <button className={`w-full py-6 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-500 active:scale-95 ${
                  t.popular 
                    ? 'bg-blue-700 text-white hover:bg-blue-800 shadow-[0_20px_50px_rgba(37,99,235,0.3)]' 
                    : 'bg-slate-900 text-white hover:bg-blue-700'
                }`}>
                  {t.name === 'Kurumsal' ? 'TEKLİF ALIN' : 'HEMEN BAŞLAYIN'}
                </button>
              </footer>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

