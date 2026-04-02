'use client';

import { motion } from 'framer-motion';

export default function Sectors() {
  const industries = [
    { title: 'Perakende', desc: 'Mağaza içi satış, stok ve müşteri sadakati süreçleri.', icon: '🏢' },
    { title: 'Üretim', desc: 'Kaynak planlama, üretim takibi ve verimlilik analizi.', icon: '🏭' },
    { title: 'Lojistik', desc: 'Depo yönetimi, nakliye ve tedarik zinciri kontrolü.', icon: '🚛' },
    { title: 'Hizmet', desc: 'Proje yönetimi, faturalama ve destek süreçleri.', icon: '💼' }
  ];

  return (
    <section id="solutions" className="section-spacing bg-white border-b border-slate-50">
      <div className="section-container">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-16 lg:gap-24">
          <motion.header 
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.8 }}
            className="flex-1 space-y-8"
          >
            <h2 className="text-4xl lg:text-6xl font-black tracking-tight leading-[1.1] text-slate-900">
              Sektörel Çözümlerle<br/> İşinizi Büyütün
            </h2>
            <p className="text-xl text-slate-600 font-medium leading-relaxed max-w-xl">
              İşletmenizin kendine has süreçlerini dijital mükemmelliğe taşıyan 
              modüllerimizle verimliliğinizi maksimize edin.
            </p>
            <div className="pt-4">
              <button className="bg-blue-700 text-white px-10 py-4 rounded text-sm font-black hover:bg-blue-800 transition-all uppercase tracking-widest shadow-lg shadow-blue-700/10">
                Tüm Sektörler →
              </button>
            </div>
          </motion.header>
          
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
            {industries.map((industry, idx) => (
              <motion.article 
                key={idx} 
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="enterprise-card group transition-all duration-300 border border-slate-200 p-10 hover:border-blue-700"
              >
                <div className="text-3xl mb-6 grayscale opacity-40 group-hover:opacity-100 group-hover:grayscale-0 transition-all transform-gpu">
                  {industry.icon}
                </div>
                <h3 className="text-xl font-bold mb-3 uppercase tracking-wider text-slate-900">
                  {industry.title}
                </h3>
                <p className="text-slate-600 text-sm font-medium leading-relaxed">
                  {industry.desc}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
