'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { PLAN_PRICING_MATRIX } from '@/lib/plans';

const TIER_PERSONAS: Record<string, string> = {
  STARTER: 'Küçük ekipler, danışmanlar ve temel operasyonlar için',
  PROFESSIONAL: 'Büyüyen KOBİ’ler, toptancılar ve çoklu depolar için',
  ENTERPRISE: 'Fabrikalar, imalatçılar, servis ağları ve holdingler için',
};

const TIER_TAGS: Record<string, string> = {
  STARTER: '5 Kullanıcı • Temel Ön Muhasebe & e-Fatura',
  PROFESSIONAL: '25 Kullanıcı • Çoklu Depo & Satın Alma & Onaylar',
  ENTERPRISE: 'Sınırsız Kullanıcı • Üretim (MRP) & Servis & Pazaryeri',
};

const CheckIcon = ({ highlighted }: { highlighted: boolean }) => (
  <svg
    className={`w-4 h-4 flex-shrink-0 mt-0.5 ${highlighted ? 'text-blue-400' : 'text-slate-400'}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
  </svg>
);

export default function Pricing() {
  const [billingInterval, setBillingInterval] = useState<'annual' | 'monthly'>('annual');

  const isAnnual = billingInterval === 'annual';

  return (
    <section id="pricing" className="py-20 lg:py-28 bg-[#0B1424] border-t border-slate-800 text-slate-100 overflow-hidden relative">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[350px] bg-blue-600/10 blur-[130px] pointer-events-none rounded-full" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[300px] bg-indigo-600/10 blur-[120px] pointer-events-none rounded-full" />

      <div className="section-container relative z-10">
        
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-10">
          <div className="section-label mx-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>ŞEFFAF LİSANS PLANLARI</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight mb-4">
            İşletmenizin ölçeğine uygun kurumsal lisans planları.
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl mx-auto">
            Giriş seviyesi ön muhasebeden tam teşekküllü üretim (MRP) ve çoklu şube yönetimine kadar ihtiyacınız olan ölçekle başlayın, büyüdükçe genişletin.
          </p>
        </div>

        {/* Monthly / Annual Toggle Switch */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-14">
          <div className="inline-flex items-center bg-[#080F1E] p-1 rounded-xl border border-slate-800 shadow-inner">
            <button
              type="button"
              onClick={() => setBillingInterval('monthly')}
              className={`relative px-5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
                !isAnnual
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Aylık Taahhüt
            </button>
            <button
              type="button"
              onClick={() => setBillingInterval('annual')}
              className={`relative px-5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer flex items-center gap-2 ${
                isAnnual
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Yıllık Taahhüt</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                %20 İndirim
              </span>
            </button>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Yıllık alımlarda <strong>2 ay ücretsiz</strong> kullanım avantajı</span>
          </div>
        </div>

        {/* 3 Tier Cards with Professional Highlighted */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch mb-16">
          {PLAN_PRICING_MATRIX.map((tier) => {
            const isHighlighted = tier.meta.highlight;
            const persona = TIER_PERSONAS[tier.plan] || tier.meta.description;
            const tag = TIER_TAGS[tier.plan];

            // Resolve dynamic price according to interval
            const displayPrice = isAnnual
              ? (tier.meta.annualPrice || tier.meta.price)
              : (tier.meta.monthlyPrice || tier.meta.price);

            const displayStrikethrough = isAnnual
              ? (tier.meta.monthlyPrice && tier.meta.annualPrice ? tier.meta.monthlyPrice : null)
              : null;

            const displaySub = isAnnual
              ? (tier.meta.annualPriceSub || tier.meta.priceSub)
              : (tier.meta.monthlyPriceSub || tier.meta.priceSub);

            const displayBilledTotal = isAnnual && tier.meta.annualBilledTotal
              ? `Yıllık faturalandırılır (${tier.meta.annualBilledTotal})`
              : 'Aylık esnek taahhüt';

            return (
              <motion.div
                key={tier.plan}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35 }}
                className={`relative flex flex-col justify-between rounded-2xl transition-all duration-200 p-7 sm:p-8 ${
                  isHighlighted
                    ? 'bg-[#080F1E] border-2 border-blue-500 shadow-2xl shadow-blue-900/20 lg:-translate-y-2 z-10'
                    : 'bg-[#080F1E] border border-slate-800 hover:border-slate-700 shadow-xl'
                }`}
              >
                {/* Highlight Badge */}
                {isHighlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3.5 py-0.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[11px] font-bold tracking-wide uppercase shadow-md shadow-blue-900/40">
                    En Çok Tercih Edilen
                  </div>
                )}

                {tier.plan === 'ENTERPRISE' && (
                  <div className="absolute -top-3 right-6 px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-700/50 text-[10px] font-bold tracking-wide uppercase">
                    Üretim & Fabrika
                  </div>
                )}

                <div>
                  {/* Tier Title & Persona */}
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-xl font-bold text-white">
                      {tier.meta.label}
                    </h3>
                  </div>

                  {/* Persona text */}
                  <p className="text-xs text-slate-400 mb-4 min-h-[34px] leading-relaxed">
                    {persona}
                  </p>

                  {/* Scope badge */}
                  {tag && (
                    <div className="mb-5 inline-block px-2.5 py-1 rounded-md bg-slate-900/80 border border-slate-800 text-[11px] font-medium text-slate-300">
                      {tag}
                    </div>
                  )}

                  {/* Price Block */}
                  <div className="mb-6 pb-6 border-b border-slate-800/80">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={`${tier.plan}-${billingInterval}`}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.2 }}
                      >
                        {displayPrice ? (
                          <div>
                            {/* Strikethrough monthly baseline when annual is selected */}
                            {displayStrikethrough && (
                              <div className="text-xs text-slate-500 line-through font-mono mb-0.5">
                                ₺{displayStrikethrough} / ay
                              </div>
                            )}
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-3xl sm:text-4xl font-black text-white tracking-tight font-mono">
                                ₺{displayPrice}
                              </span>
                              <span className="text-xs text-slate-400 font-medium">/ ay</span>
                            </div>
                            
                            {/* Billed info */}
                            <div className="text-[11px] text-blue-400 font-medium mt-1">
                              {displayBilledTotal}
                            </div>

                            {/* Extra user info */}
                            {displaySub && (
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {displaySub}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="text-2xl sm:text-3xl font-black text-white">Özel Fiyat</div>
                            <div className="text-[11px] text-slate-400 mt-1">Fabrika ve süreç ölçeğinize göre tekliflendirilir</div>
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  {/* Features List (Top Key Capabilities) */}
                  <div className="space-y-3 mb-8">
                    <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                      <span>Pakete Dahil Önemli Yetenekler:</span>
                    </div>
                    {tier.features.slice(0, 9).map((f) => (
                      <div key={f.key} className="flex items-start gap-2.5 text-xs text-slate-300">
                        <CheckIcon highlighted={isHighlighted} />
                        <span className="leading-snug">{f.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom CTA Button */}
                <div className="space-y-2">
                  <Link
                    href={`/checkout?plan=${tier.plan}&billing=${billingInterval}`}
                    className={`w-full py-3.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm ${
                      isHighlighted
                        ? 'btn-primary shadow-blue-900/30'
                        : 'btn-secondary hover:bg-slate-800'
                    }`}
                  >
                    <span>{tier.plan === 'ENTERPRISE' ? 'Lisans Satın Al / Teklif Al' : 'Hemen Satın Al'}</span>
                    <span>→</span>
                  </Link>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent('openChatWithMessage', {
                            detail: `${tier.meta.label} planı hakkında canlı demo ve süreç danışmanlığı talep ediyorum.`,
                          })
                        );
                      }}
                      className="text-[11px] text-slate-400 hover:text-blue-400 transition-colors cursor-pointer"
                    >
                      Veya canlı demo isteyin
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Guaranteed Standards Banner */}
        <div className="rounded-2xl border border-slate-800 bg-[#080F1E]/80 p-6 lg:p-8 mb-8">
          <div className="text-center max-w-xl mx-auto mb-6">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">
              TÜM LİSANS PLANLARINDA STANDART OLARAK DAHİL
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              Hangi paketi seçerseniz seçin, kurumsal güvenlik ve kesintisiz altyapı standarttır.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
              <div className="text-blue-400 text-base mb-1 font-bold">🛡️ Güvenlik & İzolasyon</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Her firma için izole veri mimarisi (Multi-tenant), 256-bit SSL şifreleme ve KVKK tam uyumluluğu.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
              <div className="text-blue-400 text-base mb-1 font-bold">☁️ Bulut & Otomatik Yedek</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Sunucu veya donanım maliyeti olmadan, günlük otomatik yedekleme ve felaket kurtarma (DR) güvencesi.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
              <div className="text-blue-400 text-base mb-1 font-bold">⚖️ GİB Mevzuat Garantisi</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Gelir İdaresi Başkanlığı e-Belge (e-Fatura, e-İrsaliye) ve KDV mevzuat değişikliklerinde anında ücretsiz güncelleme.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80">
              <div className="text-blue-400 text-base mb-1 font-bold">🚀 Hızlı Kurulum & Destek</div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Hazır Excel aktarım şablonları, video eğitim kütüphanesi ve uzman teknik destek ekibi.
              </p>
            </div>
          </div>
        </div>

        {/* Pricing Footnote */}
        <div className="pt-4 text-center text-xs text-slate-500 space-y-1">
          <div>Fiyatlara %20 KDV dahil değildir. Yıllık alımlarda 2 ay ücretsiz kullanım dahildir.</div>
          <div>E-Kontör (e-Fatura / e-İrsaliye) ve harici pazaryeri mağaza bağlantıları kullanım hacmine göre esnek paketlendirilir.</div>
        </div>

      </div>
    </section>
  );
}
