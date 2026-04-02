'use client';

import { motion } from 'framer-motion';

const certs = [
  {
    label: 'ISO 27001',
    desc: 'Bilgi güvenliği yönetim sistemi sertifikası',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    label: 'KVKK / GDPR',
    desc: 'Kişisel veri koruma mevzuatına tam uyumluluk',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
  {
    label: '256-bit SSL',
    desc: 'Uçtan uca şifreli veri iletimi ve depolama',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
  },
  {
    label: 'Günlük Yedekleme',
    desc: 'Otomatik yedekleme ve felaket kurtarma planı',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
      </svg>
    ),
  },
];

export default function Compliance() {
  return (
    <section className="py-14 relative bg-[#0F172A]">
      <div className="section-container">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">

          {/* Left */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="lg:col-span-4"
          >
            <div className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">
              Güvenlik ve Uyumluluk
            </div>
            <h2 className="text-xl lg:text-2xl font-bold text-white mb-3 leading-tight">
              Verileriniz uluslararası standartlarda korunur
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed mb-5">
              Yasal uyumluluk gereksinimleri sistem tarafından otomatik karşılanır. Rol bazlı yetkilendirme ile veri erişimi tam kontrol altındadır.
            </p>
            <div className="flex gap-3">
              <button className="text-sm font-semibold text-white bg-slate-700 hover:bg-slate-600 border border-slate-600 px-4 py-2 rounded-lg transition-colors duration-150">
                Güvenlik Politikası
              </button>
              <button className="text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors">
                Sertifikalar →
              </button>
            </div>
          </motion.div>

          {/* Right: cert grid */}
          <div className="lg:col-span-8 grid grid-cols-2 gap-3">
            {certs.map((c, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: idx * 0.07 }}
                className="flex items-start gap-4 bg-slate-800/40 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-colors duration-150"
              >
                <div className="w-9 h-9 bg-blue-600/15 border border-blue-500/20 rounded-lg flex items-center justify-center text-blue-400 flex-shrink-0">
                  {c.icon}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white mb-0.5">{c.label}</div>
                  <div className="text-xs text-slate-500 leading-relaxed">{c.desc}</div>
                </div>
              </motion.div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
