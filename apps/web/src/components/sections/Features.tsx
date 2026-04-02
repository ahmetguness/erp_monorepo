'use client';

import { motion, Variants } from 'framer-motion';

export default function Features() {
  const modules = [
    { title: 'Muhasebe', desc: 'Genel muhasebe, beyanname takibi ve finansal tablolar.', icon: '💎' },
    { title: 'Stok Yönetimi', desc: 'Gerçek zamanlı stok takibi, depo ve lojistik yönetimi.', icon: '📦' },
    { title: 'Satış & Faturalama', desc: 'E-Fatura, e-Arşiv ve tüm satış süreçlerinin yönetimi.', icon: '🧾' },
    { title: 'CRM', desc: 'Müşteri ilişkileri yönetimi ve satış fırsatları takibi.', icon: '🤝' },
    { title: 'Raporlama', desc: 'Gelişmiş veri analitiği ve stratejik raporlama araçları.', icon: '📊' },
    { title: 'İnsan Kaynakları', desc: 'Bordro, izin ve personel performans yönetimi.', icon: '👥' },
    { title: 'E-Ticaret', desc: 'Pazaryeri ve banka otomatik entegrasyonu.', icon: '🛒' },
    { title: 'Üretim Takibi', desc: 'Kaynak planlama ve üretim verimlilik analizi.', icon: '🏭' }
  ];

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 30, scale: 0.95 },
    visible: { 
      opacity: 1, 
      y: 0,
      scale: 1,
      transition: {
        duration: 0.8,
        ease: [0.22, 1, 0.36, 1]
      }
    }
  };

  return (
    <section id="features" className="section-spacing relative overflow-hidden bg-white">
      {/* Decorative Circles */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[100px] -z-10 opacity-50" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-50 rounded-full blur-[100px] -z-10 opacity-50" />

      <div className="section-container">
        <motion.header 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
          className="text-center max-w-3xl mx-auto mb-32"
        >
          <div className="inline-block px-4 py-1.5 bg-blue-50 text-blue-700 text-[10px] font-black uppercase tracking-[0.3em] rounded-full mb-8">
            Modüler Ekosistem
          </div>
          <h2 className="text-5xl lg:text-7xl font-black text-slate-900 tracking-tight uppercase italic mb-8">
            Kapsamlı <span className="text-blue-700">İş Yönetimi</span>
          </h2>
          <p className="text-xl text-slate-500 font-medium leading-relaxed italic max-w-2xl mx-auto">
            İşletmenizin her departmanı için özelleştirilmiş, birbirine tam entegre kurumsal modüller.
          </p>
        </motion.header>
        
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8"
        >
          {modules.map((m, idx) => (
            <motion.article 
              key={idx} 
              variants={itemVariants}
              whileHover={{ scale: 1.02 }}
              className="glass-card group p-10 cursor-pointer"
            >
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-3xl shadow-xl mb-10 group-hover:bg-blue-700 transition-colors duration-500 group-hover:text-white">
                {m.icon}
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-4 uppercase italic group-hover:text-blue-700 transition-colors">
                {m.title}
              </h3>
              <p className="text-slate-500 leading-relaxed text-sm font-medium italic">
                {m.desc}
              </p>
              
              <div className="mt-8 flex items-center gap-2 text-[10px] font-black text-blue-700 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all">
                DETAYLARI İNCELE <span>→</span>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

