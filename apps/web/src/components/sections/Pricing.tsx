'use client';

import { motion } from 'framer-motion';
import { PLAN_PRICING_MATRIX } from '@/lib/plans';

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
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[400px] bg-blue-700/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <p className="text-sm text-blue-400 font-medium mb-4">Lisans & Fiyatlandirma</p>
          <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4 leading-tight">
            Isletmenizin olcegine uygun<br className="hidden sm:block" /> ERP lisansi
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Tum paketlere kurulum destegi ve kullanici egitimi dahildir. Ozellik matrisi plan kaynagindan otomatik uretilir.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 rounded-2xl border border-slate-800/80 shadow-2xl overflow-visible">
          {PLAN_PRICING_MATRIX.map((tier, idx) => (
            <motion.article
              key={tier.plan}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className={[
                'relative flex flex-col p-8 group transition-colors duration-300',
                'rounded-none first:rounded-l-2xl last:rounded-r-2xl',
                'lg:first:rounded-l-2xl lg:first:rounded-r-none',
                'lg:last:rounded-r-2xl lg:last:rounded-l-none',
                tier.meta.highlight
                  ? 'bg-[#0F1E3A] border-x border-blue-900/60 hover:bg-[#112040]'
                  : 'bg-[#0D1526] hover:bg-[#0F1A30]',
                idx === 0 ? 'lg:border-r lg:border-slate-800/60' : '',
                idx === 2 ? 'lg:border-l lg:border-slate-800/60' : '',
                'border-b border-slate-800/60 lg:border-b-0',
              ].join(' ')}
            >
              {tier.meta.highlight && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500 to-transparent rounded-t-none" />
              )}

              <div className="flex flex-col flex-1">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-[11px] font-semibold text-slate-400 tracking-wide">
                    {tier.meta.label}
                  </span>
                  {tier.meta.badge && (
                    <span className="text-[10px] font-medium text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">
                      {tier.meta.badge}
                    </span>
                  )}
                </div>

                <div className="mb-6 min-h-[4.5rem]">
                  {tier.meta.price ? (
                    <>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[2.6rem] font-black text-white leading-none tabular-nums tracking-tight">
                          TL {tier.meta.price}
                        </span>
                        <span className="text-sm text-slate-500 font-medium">/ay</span>
                      </div>
                      {tier.meta.priceSub ? (
                        <p className="text-xs text-slate-500 mt-1.5">{tier.meta.priceSub}</p>
                      ) : (
                        <p className="text-xs text-transparent mt-1.5 select-none">-</p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="text-2xl font-black text-white leading-none">Ozel Fiyat</div>
                      <p className="text-xs text-slate-500 mt-1.5">Kurumunuza ozel teklif hazirlanir</p>
                    </>
                  )}
                </div>

                <p className="text-xs text-slate-500 leading-relaxed mb-6 min-h-[3rem]">
                  {tier.meta.description}
                </p>

                <div className="border-t border-slate-800/80 mb-5" />

                <ul className="space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature.key} className="flex items-start gap-3 text-sm text-slate-400">
                      <CheckIcon highlighted={tier.meta.highlight} />
                      <span>{feature.label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                className={[
                  'w-full h-12 mt-8 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer flex-shrink-0',
                  tier.meta.ctaStyle === 'primary'
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30'
                    : tier.meta.ctaStyle === 'outline'
                    ? 'bg-transparent border border-slate-600 hover:border-slate-400 text-slate-300 hover:text-white'
                    : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white',
                ].join(' ')}
              >
                {tier.meta.cta}
              </button>
            </motion.article>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 pt-6 border-t border-slate-800/60"
        >
          <p className="text-xs text-slate-600">
            Fiyatlara KDV dahil degildir. Yillik odemede indirim uygulanir.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-slate-600">
            {['Kurulum destegi dahil', 'Kullanici egitimi dahil', 'Moduler genisleme'].map((item) => (
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
