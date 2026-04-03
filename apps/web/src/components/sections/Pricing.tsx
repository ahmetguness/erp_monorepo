'use client';

import { motion } from 'framer-motion';

const tiers = [
  {
    name: 'Starter',
    badge: null,
    price: '1.990',
    priceSub: null,
    desc: 'Temel operasyonel süreçleri dijitalleştirmek isteyen küçük ölçekli işletmeler için.',
    cta: 'Hemen Başla',
    ctaStyle: 'secondary',
    features: [
      '5 kullanıcı hesabı',
      'Muhasebe & finans',
      'Stok takibi',
      'Cari hesap yönetimi',
      'E-fatura entegrasyonu',
      'Temel raporlar',
    ],
    highlight: false,
  },
  {
    name: 'Professional',
    badge: 'Önerilen',
    price: '3.990',
    priceSub: '+ kullanıcı başı ₺150/ay',
    desc: 'Satış, üretim ve finans süreçlerini tek çatı altında yönetmek isteyen büyüyen işletmeler için.',
    cta: 'Lisans Satın Al',
    ctaStyle: 'primary',
    features: [
      "Starter'daki tüm özellikler",
      'CRM & teklif yönetimi',
      'Satış & sipariş yönetimi',
      'Satın alma yönetimi',
      'Üretim & MRP',
      'Rol & yetkilendirme',
      'Onay mekanizması',
      'Çoklu depo',
      '7/24 teknik destek',
    ],
    highlight: true,
  },
  {
    name: 'Enterprise',
    badge: null,
    price: null,
    priceSub: null,
    desc: 'Çok şubeli, yüksek kullanıcılı ve özel entegrasyon gerektiren büyük ölçekli kurumlar için.',
    cta: 'Satış Ekibiyle Görüş',
    ctaStyle: 'outline',
    features: [
      'Tüm modüller',
      'Sınırsız kullanıcı',
      'On-premise / private cloud',
      'Gelişmiş API & entegrasyon',
      'Audit log & güvenlik',
      'SLA garantisi',
      'Dedicated destek',
      'Veri migrasyonu desteği',
    ],
    highlight: false,
  },
];

const CheckIcon = ({ highlighted }: { highlighted: boolean }) => (
  <svg
    className={`w-4 h-4 flex-shrink-0 mt-0.5 ${highlighted ? 'text-blue-400' : 'text-slate-500'}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

export default function Pricing() {
  return (
    <section id="pricing" className="relative bg-[#0B1120] py-24 overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[400px] bg-blue-700/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-[0.2em] mb-4">
            Lisans & Fiyatlandırma
          </p>
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4 leading-tight">
            İşletmenizin ölçeğine uygun<br className="hidden sm:block" /> ERP lisansı
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Tüm paketlere kurulum desteği ve kullanıcı eğitimi dahildir.
            Modüller ihtiyaca göre sonradan eklenebilir.
          </p>
        </motion.div>

        {/* Pricing grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 rounded-2xl border border-slate-800/80 shadow-2xl overflow-visible">
          {tiers.map((tier, idx) => (
            <motion.article
              key={tier.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className={[
                'relative flex flex-col p-8 group transition-colors duration-300',
                'rounded-none first:rounded-l-2xl last:rounded-r-2xl',
                'lg:first:rounded-l-2xl lg:first:rounded-r-none',
                'lg:last:rounded-r-2xl lg:last:rounded-l-none',
                tier.highlight
                  ? 'bg-[#0F1E3A] border-x border-blue-900/60 hover:bg-[#112040]'
                  : 'bg-[#0D1526] hover:bg-[#0F1A30]',
                idx === 0 ? 'lg:border-r lg:border-slate-800/60' : '',
                idx === 2 ? 'lg:border-l lg:border-slate-800/60' : '',
                'border-b border-slate-800/60 lg:border-b-0',
              ].join(' ')}
            >
              {/* Top accent line for highlighted plan */}
              {tier.highlight && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500 to-transparent rounded-t-none" />
              )}

              {/* Upper content — grows to fill available space */}
              <div className="flex flex-col flex-1">
                {/* Plan name + badge */}
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.18em]">
                    {tier.name}
                  </span>
                  {tier.badge && (
                    <span className="text-[10px] font-bold text-blue-300 bg-blue-500/10 border border-blue-500/25 px-2.5 py-1 rounded-full uppercase tracking-wider">
                      {tier.badge}
                    </span>
                  )}
                </div>

                {/* Price */}
                <div className="mb-6 min-h-[4.5rem]">
                  {tier.price ? (
                    <>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[2.6rem] font-black text-white leading-none tabular-nums tracking-tight">
                          ₺{tier.price}
                        </span>
                        <span className="text-sm text-slate-500 font-medium">/ay</span>
                      </div>
                      {tier.priceSub ? (
                        <p className="text-xs text-slate-500 mt-1.5">{tier.priceSub}</p>
                      ) : (
                        <p className="text-xs text-transparent mt-1.5 select-none">—</p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="text-2xl font-black text-white leading-none">Özel Fiyat</div>
                      <p className="text-xs text-slate-500 mt-1.5">Kurumunuza özel teklif hazırlanır</p>
                    </>
                  )}
                </div>

                {/* Description */}
                <p className="text-xs text-slate-500 leading-relaxed mb-6 min-h-[3rem]">
                  {tier.desc}
                </p>

                {/* Divider */}
                <div className="border-t border-slate-800/80 mb-5" />

                {/* Features */}
                <ul className="space-y-3">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-slate-400">
                      <CheckIcon highlighted={tier.highlight} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* CTA Button — always pinned to bottom */}
              <button
                className={[
                  'w-full h-12 mt-8 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer flex-shrink-0',
                  tier.ctaStyle === 'primary'
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30'
                    : tier.ctaStyle === 'outline'
                    ? 'bg-transparent border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white'
                    : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white',
                ].join(' ')}
              >
                {tier.cta}
              </button>
            </motion.article>
          ))}
        </div>

        {/* Footer note */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 pt-6 border-t border-slate-800/60"
        >
          <p className="text-xs text-slate-600">
            Fiyatlara KDV dahil değildir. Yıllık ödemede %15 indirim uygulanır.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-600">
            {['Kurulum desteği dahil', 'Kullanıcı eğitimi dahil', 'Modüler genişleme'].map((item) => (
              <span key={item} className="flex items-center gap-1.5">
                <svg className="w-3 h-3 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
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
