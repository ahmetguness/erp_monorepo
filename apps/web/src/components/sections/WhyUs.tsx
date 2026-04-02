'use client';

import { motion } from 'framer-motion';

const points = [
  {
    title: 'Veri Güvenliği',
    desc: 'SSL şifreleme, günlük yedekleme ve ISO 27001 sertifikalı altyapı. Rol bazlı yetkilendirme ile veri erişimi kontrol altında.',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    title: 'Ölçeklenebilir Mimari',
    desc: 'Küçük işletmeden büyük kuruma kadar büyümenize paralel genişleyen modüler yapı. Yeni modüller sonradan eklenebilir.',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
    ),
  },
  {
    title: 'Yerli Mevzuat Uyumu',
    desc: 'E-Fatura, e-Arşiv, e-İrsaliye ve SGK entegrasyonları dahil. Yasal düzenlemelere uyum otomatik olarak sağlanır.',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: 'Teknik Destek',
    desc: 'Telefon, e-posta ve uzaktan bağlantı ile 7/24 teknik destek. Yerinde danışmanlık ve düzenli sürüm güncellemeleri.',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
];

const trustBadges = [
  'Yüzlerce işletme tarafından tercih edilmektedir',
  'Bulut ve şirket içi kurulum desteği',
  'Rol bazlı yetkilendirme ve güvenli veri yönetimi',
  'KVKK uyumlu veri işleme altyapısı',
];

export default function WhyUs() {
  return (
    <section id="why-us" className="section-spacing relative bg-slate-50 overflow-hidden">
      <div className="absolute inset-0 bg-dot opacity-50 pointer-events-none" />

      <div className="section-container relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="max-w-2xl mb-12"
        >
          <div className="section-label">Neden Axon ERP</div>
          <h2 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-3">
            Güvenilir altyapı, kesintisiz destek
          </h2>
          <p className="text-slate-500 leading-relaxed">
            Sadece yazılım değil, işletmenizin büyümesine ortak olan bir çözüm ortağı.
            Kurulumdan sonra da yanınızdayız.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {points.map((p, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.09 }}
                whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.07)' }}
                className="bg-white border border-slate-200 rounded-lg p-5 transition-shadow duration-200"
              >
                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded flex items-center justify-center mb-3">
                  {p.icon}
                </div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1.5">{p.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{p.desc}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, x: 16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: 0.15 }}
            className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between shadow-sm"
          >
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">Güven Unsurları</div>
              <div className="space-y-3">
                {trustBadges.map((badge, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + i * 0.07 }}
                    className="flex items-start gap-2.5"
                  >
                    <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm text-slate-600 leading-snug">{badge}</span>
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-slate-100">
              <div className="text-xs text-slate-400 mb-3">Sertifikalar</div>
              <div className="flex flex-wrap gap-2">
                {['ISO 27001', 'KVKK', '256-bit SSL', 'e-Fatura'].map((cert) => (
                  <span key={cert} className="text-xs font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded">
                    {cert}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
