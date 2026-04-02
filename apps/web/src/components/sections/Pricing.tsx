'use client';

import { motion } from 'framer-motion';

const tiers = [
  {
    name: 'Başlangıç',
    price: '1.990',
    desc: 'Temel operasyonel süreçleri dijitalleştirmek isteyen küçük ölçekli işletmeler için.',
    features: [
      '3 kullanıcı hesabı',
      'Muhasebe ve finans modülü',
      'Stok takibi',
      'E-Fatura entegrasyonu',
      'Mesai saatleri e-posta desteği',
    ],
    cta: 'Hemen Başla',
    highlight: false,
  },
  {
    name: 'Profesyonel',
    price: '4.990',
    desc: 'Satış, üretim ve finans süreçlerini tek sistemde yönetmek isteyen büyüyen işletmeler için.',
    features: [
      '15 kullanıcı hesabı',
      'Tüm finans modülleri',
      'Satış, CRM ve teklif yönetimi',
      'Üretim takibi ve MRP',
      '7/24 öncelikli teknik destek',
    ],
    cta: 'Lisans Satın Al',
    highlight: true,
  },
  {
    name: 'Kurumsal',
    price: null,
    desc: 'Çok şubeli, yüksek kullanıcılı ve özel entegrasyon gerektiren büyük ölçekli kurumlar için.',
    features: [
      'Sınırsız kullanıcı',
      'API erişimi ve özel geliştirme',
      'Şirket içi kurulum seçeneği',
      'Kişisel teknik danışman',
      'SLA garantisi ve öncelikli hat',
    ],
    cta: 'Özel Fiyat Teklifi',
    highlight: false,
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="section-spacing relative bg-[#0F172A] overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-blue-600/5 rounded-full blur-[100px]" />
      </div>

      <div className="section-container relative z-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="text-center max-w-xl mx-auto mb-14"
        >
          <div className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">Fiyatlandırma</div>
          <h2 className="text-2xl lg:text-3xl font-bold text-white mb-3">
            İhtiyacınıza uygun lisans seçenekleri
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Tüm paketlere kurulum desteği ve eğitim dahildir. Modüller sonradan eklenebilir.
          </p>
        </motion.div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-800 rounded-2xl overflow-hidden border border-slate-800">
          {tiers.map((t, idx) => (
            <motion.article
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className={
                'relative flex flex-col p-8 ' +
                (t.highlight ? 'bg-slate-800' : 'bg-[#0F172A]')
              }
            >
              {/* Highlight top accent */}
              {t.highlight && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-600/0 via-blue-500 to-blue-600/0" />
              )}

              {/* Plan header */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{t.name}</span>
                  {t.highlight && (
                    <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Önerilen
                    </span>
                  )}
                </div>

                {t.price ? (
                  <div className="mb-3">
                    <div className="flex items-baseline gap-1">
                      <span className="text-[2.75rem] font-black text-white leading-none tabular-nums">₺{t.price}</span>
                      <span className="text-sm text-slate-500">/ay</span>
                    </div>
                  </div>
                ) : (
                  <div className="mb-3">
                    <div className="text-2xl font-black text-white leading-none">Özel Fiyat</div>
                    <div className="text-xs text-slate-500 mt-1">Kurumunuza özel teklif</div>
                  </div>
                )}

                <p className="text-xs text-slate-500 leading-relaxed">{t.desc}</p>
              </div>

              {/* CTA */}
              <button className={
                'w-full py-3 rounded-lg text-sm font-semibold mb-8 transition-all duration-150 ' +
                (t.highlight
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white hover:border-slate-500')
              }>
                {t.cta}
              </button>

              {/* Divider */}
              <div className="border-t border-slate-700/60 mb-6" />

              {/* Features */}
              <ul className="space-y-3 flex-1">
                {t.features.map((f, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + idx * 0.1 + i * 0.05 }}
                    className="flex items-start gap-3 text-sm text-slate-400"
                  >
                    <svg className={
                      'w-4 h-4 flex-shrink-0 mt-0.5 ' +
                      (t.highlight ? 'text-blue-500' : 'text-slate-600')
                    } fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </motion.li>
                ))}
              </ul>
            </motion.article>
          ))}
        </div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 pt-6 border-t border-slate-800"
        >
          <p className="text-xs text-slate-600">
            Tüm fiyatlara KDV dahil değildir. Yıllık ödemede %15 indirim uygulanır.
          </p>
          <div className="flex items-center gap-5 text-xs text-slate-600">
            {['Kurulum desteği dahil', 'Eğitim dahil', 'Modüler genişleme'].map(item => (
              <span key={item} className="flex items-center gap-1.5">
                <svg className="w-3 h-3 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {item}
              </span>
            ))}
          </div>
        </motion.div>

      </div>
    </section>
  );
}
