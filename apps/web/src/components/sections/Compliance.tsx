'use client';

import { motion } from 'framer-motion';

const certifications = [
  { label: 'ISO 27001', desc: 'Bilgi Güvenliği Yönetimi', icon: '🔒' },
  { label: 'KVKK / GDPR', desc: 'Veri Koruma Uyumluluğu', icon: '🛡️' },
  { label: 'Cloud Safe', desc: 'Yüksek Güvenlikli Bulut', icon: '☁️' },
  { label: '256-Bit SSL', desc: 'Uçtan Uca Şifreleme', icon: '🔑' }
];

export default function Compliance() {
  return (
    <section className="bg-slate-900 py-24 lg:py-32 relative overflow-hidden">
      {/* Decorative background grid */}
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="compliance-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#compliance-grid)" />
        </svg>
      </div>

      <div className="section-container relative z-10">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-16 lg:gap-32">
          <motion.div 
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="flex-1 space-y-8"
          >
            <div className="inline-block px-4 py-1 bg-blue-600 text-white text-xs font-black uppercase tracking-[0.3em] rounded-full">Güvenlik ve Uyumluluk</div>
            <h2 className="text-4xl lg:text-7xl font-black text-white tracking-tight leading-none uppercase tracking-tighter italic border-b-8 border-blue-600 pb-4 inline-block">Verileriniz Bize Emanet</h2>
            <p className="text-xl text-slate-300 font-medium leading-relaxed max-w-xl">
              İşletmenizin en değerli varlığı olan verilerinizi, uluslararası standartlarda koruyor ve yasal uyumlulukları %100 sağlıyoruz.
            </p>
            <div className="flex flex-wrap gap-4 pt-4">
              <button className="bg-white text-slate-900 px-10 py-4 rounded text-xs font-black uppercase tracking-widest hover:bg-slate-100 transition-all">Sertifikaları İncele</button>
              <button className="bg-transparent border-2 border-slate-700 text-white px-10 py-4 rounded text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all">Güvenlik Raporu</button>
            </div>
          </motion.div>
          
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
            {certifications.map((c, idx) => (
              <motion.article 
                key={idx}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="bg-slate-800/50 backdrop-blur-xl p-10 rounded-3xl border border-slate-700/50 flex flex-col items-center text-center space-y-6 hover:bg-slate-800 hover:border-blue-600 transition-all group"
              >
                <div className="text-4xl grayscale group-hover:grayscale-0 transition-all">{c.icon}</div>
                <div className="space-y-2">
                  <h3 className="text-xl font-black text-white uppercase tracking-widest">{c.label}</h3>
                  <p className="text-slate-400 font-bold text-sm tracking-tight">{c.desc}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
