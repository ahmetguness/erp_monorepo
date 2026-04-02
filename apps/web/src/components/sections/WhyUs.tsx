'use client';

import { motion } from 'framer-motion';

export default function WhyUs() {
  const points = [
    { title: 'Güvenilir Altyapı', desc: 'En yüksek güvenlik standartlarında, kesintisiz veri yedekleme ve bulut altyapısı.', icon: '🛡️' },
    { title: 'Ölçeklenebilir Sistem', desc: 'İşletmenizin büyümesine paralel olarak esneyen modüler ve güçlü mimari.', icon: '📈' },
    { title: 'Kullanıcı Dostu', desc: 'Eğitime ihtiyaç duymadan, kolayca alışılan ve hızlı veri girişi sağlayan tasarım.', icon: '🖥️' },
    { title: 'Hızlı Destek', desc: 'Uzman ekibimizle 7/24 teknik destek ve danışmanlık hizmeti.', icon: '📞' }
  ];

  return (
    <section id="why-us" className="section-spacing bg-white border-b border-slate-50">
      <div className="section-container">
        <motion.header 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8 }}
          className="text-center max-w-2xl mx-auto mb-24 space-y-4"
        >
          <h2 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">Neden Bizi Seçmelisiniz?</h2>
          <p className="text-xl text-slate-600 font-medium leading-relaxed">Güvenilir, ölçeklenebilir ve kurumsal iş yönetimi.</p>
        </motion.header>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {points.map((p, idx) => (
            <motion.article 
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.6, delay: idx * 0.1 }}
              className="text-center space-y-8"
            >
              <div className="text-4xl grayscale opacity-30">{p.icon}</div>
              <h3 className="text-xl font-bold text-slate-900 uppercase tracking-widest">{p.title}</h3>
              <p className="text-slate-600 leading-relaxed font-medium text-sm lg:px-8">
                {p.desc}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
