'use client';

import { useState, useEffect } from 'react';
import { X, ArrowRight, Sparkles, ExternalLink, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface Step {
  emoji: string;
  title: string;
  description: string;
  /** Yan bilgi satırları — kısa ipuçları */
  tips: string[];
  /** "Hemen Git" butonu için opsiyonel link */
  href?: string;
  hrefLabel?: string;
  /** Adım renk teması */
  color: 'sky' | 'amber' | 'emerald' | 'violet' | 'rose' | 'orange' | 'pink' | 'teal';
}

// ─────────────────────────────────────────────
// Steps — her modül için özel içerik
// ─────────────────────────────────────────────

const STEPS: Step[] = [
  {
    emoji: '👋',
    color: 'sky',
    title: 'Axon ERP\'e Hoş Geldiniz',
    description: 'Tüm iş süreçlerinizi tek platformda yönetin. Aşağıdaki adımlarla hızlıca başlayabilirsiniz.',
    tips: [
      'Dashboard\'da gelir, gider ve stok özetinizi görün',
      'Sağ üstteki zil ikonuyla bildirimleri takip edin',
      'Sol menüden tüm modüllere erişebilirsiniz',
    ],
    href: '/dashboard',
    hrefLabel: 'Dashboard\'a Git',
  },
  {
    emoji: '👥',
    color: 'amber',
    title: 'Cari Hesaplar',
    description: 'Müşteri ve tedarikçilerinizi tanımlayın. Tüm alacak/borç hareketleri otomatik takip edilir.',
    tips: [
      'Müşteri, tedarikçi veya her ikisi olarak tanımlayın',
      'Kredi limiti ve vade günü belirleyin',
      'Cari ekstreden tüm hareketleri görün',
    ],
    href: '/dashboard/contacts',
    hrefLabel: 'Cari Hesaplara Git',
  },
  {
    emoji: '📦',
    color: 'emerald',
    title: 'Ürünler & Stok',
    description: 'Ürün kataloğunuzu oluşturun, depo bazlı stok seviyelerini anlık takip edin.',
    tips: [
      'Barkod, kategori ve birim tanımlayın',
      'Minimum stok seviyesi belirleyin — uyarı alın',
      'Stok hareketleriyle giriş/çıkış kaydedin',
    ],
    href: '/dashboard/products',
    hrefLabel: 'Ürünlere Git',
  },
  {
    emoji: '🛒',
    color: 'violet',
    title: 'Satış & Faturalama',
    description: 'Teklif oluşturun, siparişe dönüştürün ve fatura kesin. Tüm süreç birbirine bağlı.',
    tips: [
      'Tekliften siparişe, siparişten faturaya tek tıkla',
      'KDV hesaplaması otomatik yapılır',
      'E-Fatura ve E-Arşiv desteği (Professional+)',
    ],
    href: '/dashboard/invoices',
    hrefLabel: 'Faturalara Git',
  },
  {
    emoji: '📊',
    color: 'rose',
    title: 'Muhasebe',
    description: 'Hesap planı, yevmiye fişleri ve mali dönemler ile muhasebenizi düzenli tutun.',
    tips: [
      'Fatura ve ödemeler otomatik yevmiye oluşturur',
      'Mali dönem açıp kapatarak yıl sonu işlemi yapın',
      'Mutabakat ile banka hesaplarını eşleştirin (Professional+)',
    ],
    href: '/dashboard/accounting',
    hrefLabel: 'Muhasebeye Git',
  },
  {
    emoji: '💳',
    color: 'teal',
    title: 'Ödemeler & Banka',
    description: 'Tahsilat ve ödemeleri kaydedin, banka hesaplarınızı ve kasanızı yönetin.',
    tips: [
      'Ödemeyi faturaya bağlayarak bakiyeyi kapatın',
      'Banka ve kasa hesapları ayrı ayrı takip edilir',
      'Çek/senet ve banka hareketleri (Professional+)',
    ],
    href: '/dashboard/payments',
    hrefLabel: 'Ödemelere Git',
  },
  {
    emoji: '🛍️',
    color: 'orange',
    title: 'Satın Alma',
    description: 'Satın alma talepleri oluşturun, onay sürecinden geçirin ve siparişe dönüştürün.',
    tips: [
      'Talep → Onay → Sipariş akışı otomatik',
      'Tedarikçi faturasını siparişe bağlayın',
      'Stok girişi otomatik güncellenir',
    ],
    href: '/dashboard/purchase-orders',
    hrefLabel: 'Satın Almaya Git',
  },
  {
    emoji: '📈',
    color: 'pink',
    title: 'Raporlar',
    description: 'Gelir/gider özeti, stok durumu ve cari bakiye raporlarıyla işinizi analiz edin.',
    tips: [
      'Tarih aralığı ve filtrelerle özelleştirin',
      'Raporları kaydedin ve tekrar kullanın',
      'Döviz kurlarını TCMB\'den otomatik çekin',
    ],
    href: '/dashboard/reports',
    hrefLabel: 'Raporlara Git',
  },
];

// ─────────────────────────────────────────────
// Color map
// ─────────────────────────────────────────────

const COLOR_MAP: Record<Step['color'], { dot: string; badge: string; btn: string; tip: string }> = {
  sky:     { dot: 'bg-sky-400',     badge: 'text-sky-400',     btn: 'bg-sky-500 hover:bg-sky-400',     tip: 'text-sky-400/70' },
  amber:   { dot: 'bg-amber-400',   badge: 'text-amber-400',   btn: 'bg-amber-500 hover:bg-amber-400', tip: 'text-amber-400/70' },
  emerald: { dot: 'bg-emerald-400', badge: 'text-emerald-400', btn: 'bg-emerald-500 hover:bg-emerald-400', tip: 'text-emerald-400/70' },
  violet:  { dot: 'bg-violet-400',  badge: 'text-violet-400',  btn: 'bg-violet-500 hover:bg-violet-400',  tip: 'text-violet-400/70' },
  rose:    { dot: 'bg-rose-400',    badge: 'text-rose-400',    btn: 'bg-rose-500 hover:bg-rose-400',    tip: 'text-rose-400/70' },
  orange:  { dot: 'bg-orange-400',  badge: 'text-orange-400',  btn: 'bg-orange-500 hover:bg-orange-400', tip: 'text-orange-400/70' },
  pink:    { dot: 'bg-pink-400',    badge: 'text-pink-400',    btn: 'bg-pink-500 hover:bg-pink-400',    tip: 'text-pink-400/70' },
  teal:    { dot: 'bg-teal-400',    badge: 'text-teal-400',    btn: 'bg-teal-500 hover:bg-teal-400',    tip: 'text-teal-400/70' },
};

const STORAGE_KEY_PREFIX = 'axon_onboarding_done_';

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function OnboardingTooltip() {
  const user = useAuthStore((s) => s.user);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [tipsOpen, setTipsOpen] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    const done = localStorage.getItem(`${STORAGE_KEY_PREFIX}${user.id}`);
    if (!done) setVisible(true);
  }, [user?.id]);

  function dismiss() {
    if (!user?.id) return;
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${user.id}`, '1');
    setVisible(false);
  }

  function next() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const colors = COLOR_MAP[current.color];
  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        className={cn(
          'absolute bottom-6 right-6 w-[340px] pointer-events-auto',
          'bg-slate-900 border border-slate-700/80 rounded-2xl',
          'shadow-2xl shadow-black/50 ring-1 ring-white/[0.04]',
          'animate-in slide-in-from-bottom-4 fade-in duration-300',
        )}
      >
        {/* Progress bar */}
        <div className="h-0.5 w-full bg-slate-800 rounded-t-2xl overflow-hidden">
          <div
            className={cn('h-full transition-all duration-300', colors.dot)}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-0">
          <div className="flex items-center gap-1.5">
            <Sparkles className={cn('w-3.5 h-3.5', colors.badge)} />
            <span className={cn('text-[11px] font-semibold uppercase tracking-wider', colors.badge)}>
              Hızlı Başlangıç
            </span>
            <span className="text-[11px] text-slate-600 ml-1">
              {step + 1}/{STEPS.length}
            </span>
          </div>
          <button
            onClick={dismiss}
            aria-label="Onboarding'i kapat"
            className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 pt-3 pb-4 space-y-3">
          {/* Title row */}
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none mt-0.5 shrink-0" role="img" aria-hidden>
              {current.emoji}
            </span>
            <div>
              <p className="text-sm font-semibold text-white leading-snug">
                {current.title}
              </p>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                {current.description}
              </p>
            </div>
          </div>

          {/* Tips */}
          <div>
            <button
              onClick={() => setTipsOpen((o) => !o)}
              className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors mb-1.5"
            >
              <ChevronDown className={cn('w-3 h-3 transition-transform duration-200', tipsOpen && 'rotate-180')} />
              {tipsOpen ? 'İpuçlarını Gizle' : 'İpuçlarını Göster'}
            </button>
            {tipsOpen && (
              <ul className="space-y-1.5 pl-1">
                {current.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={cn('mt-1.5 w-1 h-1 rounded-full shrink-0', colors.dot)} />
                    <span className="text-[11px] text-slate-400 leading-relaxed">{tip}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-1 gap-2">
            {/* Step dots */}
            <div className="flex items-center gap-1">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  aria-label={`Adım ${i + 1}`}
                  className={cn(
                    'rounded-full transition-all duration-200',
                    i === step
                      ? cn('w-4 h-1.5', colors.dot)
                      : 'w-1.5 h-1.5 bg-slate-700 hover:bg-slate-600',
                  )}
                />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              {current.href && (
                <Link
                  href={current.href}
                  onClick={dismiss}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-600 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  {current.hrefLabel ?? 'Git'}
                </Link>
              )}
              <button
                onClick={next}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors',
                  colors.btn,
                )}
              >
                {isLast ? 'Başlayalım' : 'İleri'}
                {!isLast && <ArrowRight className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
