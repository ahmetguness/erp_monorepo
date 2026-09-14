'use client';

import { Suspense, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  CreditCard,
  Building2,
  ArrowLeft,
  Sparkles,
  Check,
  Lock,
  Tag,
  CheckCircle2,
  AlertCircle,
  Copy,
  ChevronRight,
  ExternalLink,
  Layers,
  FileText,
} from 'lucide-react';
import { PLAN_PRICING_META, PLAN_LABELS, type PlanName } from '@/lib/plans';
import { API_BASE_URL } from '@/lib/constants';
import { completeTenantCheckout, getTenantCheckoutContext } from '@/services/tenant-checkout.service';
import { useAuthStore } from '@/store/auth.store';
import { normalizeApiError } from '@/lib/http/api-error.interceptor';
import { useMe } from '@/hooks/useAuth';

// Seeded / system coupons matching backend Prisma billingCoupon
interface CouponDefinition {
  code: string;
  percent: number;
  applicablePlans: PlanName[] | 'ALL';
  description: string;
}

const SYSTEM_COUPONS: CouponDefinition[] = [
  {
    code: 'KOBIPRO30',
    percent: 30,
    applicablePlans: ['PROFESSIONAL'],
    description: 'KOBİ Dijital Dönüşüm İndirimi (%30 İndirim)',
  },
  {
    code: 'ENTERPRISE2026',
    percent: 20,
    applicablePlans: ['ENTERPRISE'],
    description: 'Büyük Kurumsal Geçiş Kampanyası (%20 İndirim)',
  },
  {
    code: 'STARTUP50',
    percent: 50,
    applicablePlans: ['STARTER'],
    description: 'Girişimci & Yeni İşletme Desteği (%50 İndirim)',
  },
  {
    code: 'AXON2026',
    percent: 15,
    applicablePlans: 'ALL',
    description: '2026 Lansman Kuponu (%15 İndirim)',
  },
  {
    code: 'KOBI20',
    percent: 20,
    applicablePlans: 'ALL',
    description: 'KOBİ Dayanışma İndirimi (%20 İndirim)',
  },
];

// Price tables in numbers for precision
const PLAN_BASE_NUMERICAL: Record<
  PlanName,
  { monthly: number; annualMonthly: number; annualBilled: number; users: string; desc: string }
> = {
  STARTER: {
    monthly: 2450,
    annualMonthly: 1950,
    annualBilled: 23400,
    users: '5 Kullanıcı',
    desc: 'Temel Ön Muhasebe & e-Fatura',
  },
  PROFESSIONAL: {
    monthly: 5950,
    annualMonthly: 4750,
    annualBilled: 57000,
    users: '25 Kullanıcıya Kadar',
    desc: 'Çoklu Depo, Satın Alma & Onay Akışları',
  },
  ENTERPRISE: {
    monthly: 14900,
    annualMonthly: 11900,
    annualBilled: 142800,
    users: 'Sınırsız Kullanıcı',
    desc: 'Üretim (MRP), Teknik Servis & Pazaryeri',
  },
};

function CheckoutContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const isTenantUpgrade = searchParams.get('source') === 'tenant';
  useMe(isTenantUpgrade);
  const authenticatedTenant = useAuthStore((state) => state.tenant);

  // Plan & Billing State
  const initialPlanParam = (searchParams.get('plan') || 'PROFESSIONAL').toUpperCase() as PlanName;
  const validPlan: PlanName = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'].includes(initialPlanParam)
    ? initialPlanParam
    : 'PROFESSIONAL';

  const initialBilling = searchParams.get('billing') === 'monthly' ? 'monthly' : 'annual';
  const initialCoupon = searchParams.get('coupon') || '';

  const [selectedPlan, setSelectedPlan] = useState<PlanName>(validPlan);
  const [billingInterval, setBillingInterval] = useState<'annual' | 'monthly'>(initialBilling);

  // Form states
  const [companyName, setCompanyName] = useState(isTenantUpgrade ? '' : 'ABC Teknoloji Sanayi ve Ticaret A.Ş.');
  const [taxOffice, setTaxOffice] = useState(isTenantUpgrade ? '' : 'Kadıköy');
  const [taxNumber, setTaxNumber] = useState(isTenantUpgrade ? '' : '1234567890');
  const [contactName, setContactName] = useState(isTenantUpgrade ? '' : 'Ahmet Yılmaz');
  const [email, setEmail] = useState(isTenantUpgrade ? '' : 'ahmet@abcteknoloji.com');
  const [phone, setPhone] = useState(isTenantUpgrade ? '' : '0532 000 00 00');
  const [city, setCity] = useState(isTenantUpgrade ? '' : 'İstanbul');

  // Payment Method
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'bank'>('card');
  const [cardNumber, setCardNumber] = useState('4543 6000 1234 5678');
  const [cardHolder, setCardHolder] = useState('AHMET YILMAZ');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvv, setCardCvv] = useState('789');

  // Coupon State
  const [couponInput, setCouponInput] = useState(initialCoupon);
  const [appliedCoupon, setAppliedCoupon] = useState<CouponDefinition | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponSuccessMessage, setCouponSuccessMessage] = useState<string | null>(null);
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);
  const couponValidationSequence = useRef(0);
  const checkoutIdempotencyKey = useRef<string | null>(null);
  const tenantProfileLoaded = useRef(false);

  // Processing & Success State
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [activationPending, setActivationPending] = useState(false);

  useEffect(() => {
    if (!isTenantUpgrade || !authenticatedTenant || tenantProfileLoaded.current) return;
    tenantProfileLoaded.current = true;
    void getTenantCheckoutContext()
      .then((context) => {
        setCompanyName(context.companyName);
        setTaxOffice(context.billingProfile.taxOffice ?? '');
        setTaxNumber(context.billingProfile.taxNumber ?? '');
        setContactName(context.contact.name);
        setEmail(context.contact.email || context.billingProfile.email);
        setPhone(context.contact.phone ?? context.billingProfile.phone ?? '');
        setCity(context.billingProfile.city ?? '');
        setSelectedPlan(context.currentPlan);
      })
      .catch((error: unknown) => {
        setCheckoutError(normalizeApiError(error).error.message || 'Şirket bilgileri yüklenemedi.');
        tenantProfileLoaded.current = false;
      });
  }, [authenticatedTenant, isTenantUpgrade]);

  const applyCouponCode = useCallback(async (codeToApply: string, planToValidate = selectedPlan) => {
    const sequence = ++couponValidationSequence.current;
    const trimmed = codeToApply.trim().toUpperCase();
    if (!trimmed) {
      setCouponError('Lütfen geçerli bir indirim kodu girin.');
      return;
    }

    setIsValidatingCoupon(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/public/checkout/coupons/${encodeURIComponent(trimmed)}?plan=${planToValidate}`);
      if (!response.ok) throw new Error('Coupon validation failed');
      const result = await response.json() as { data: { valid: false } | { valid: true; coupon: CouponDefinition } };
      if (sequence !== couponValidationSequence.current) return;
      if (!result.data.valid) {
        setAppliedCoupon(null);
        setCouponError(`"${trimmed}" bu plan için geçerli değil, kullanım limiti dolmuş veya süresi geçmiş.`);
        setCouponSuccessMessage(null);
        return;
      }
      setAppliedCoupon(result.data.coupon);
      setCouponError(null);
      setCouponSuccessMessage(`✓ %${result.data.coupon.percent} indirim başarıyla uygulandı! (${result.data.coupon.description})`);
    } catch {
      if (sequence !== couponValidationSequence.current) return;
      setCouponError('Kupon şu anda doğrulanamıyor. Lütfen tekrar deneyin.');
      setCouponSuccessMessage(null);
    } finally {
      if (sequence === couponValidationSequence.current) setIsValidatingCoupon(false);
    }
  }, [selectedPlan]);

  // Apply initial coupon if present in URL
  useEffect(() => {
    if (!initialCoupon) return;
    const timer = window.setTimeout(() => void applyCouponCode(initialCoupon), 0);
    return () => window.clearTimeout(timer);
  }, [initialCoupon, applyCouponCode]);

  const removeCoupon = () => {
    couponValidationSequence.current += 1;
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError(null);
    setCouponSuccessMessage(null);
  };

  const handlePlanChange = (plan: PlanName) => {
    setSelectedPlan(plan);
    if (appliedCoupon) void applyCouponCode(appliedCoupon.code, plan);
  };

  // Price calculations
  const priceInfo = PLAN_BASE_NUMERICAL[selectedPlan];
  const isAnnual = billingInterval === 'annual';

  // Base charge before coupon
  const baseCharge = isAnnual ? priceInfo.annualBilled : priceInfo.monthly;

  // Coupon discount amount
  const discountAmount = appliedCoupon ? Math.round((baseCharge * appliedCoupon.percent) / 100) : 0;
  const netSubtotal = baseCharge - discountAmount;
  const kdvAmount = Math.round(netSubtotal * 0.2); // %20 KDV
  const grandTotal = netSubtotal + kdvAmount;

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setCheckoutError(null);

    if (authenticatedTenant) {
      try {
        checkoutIdempotencyKey.current ??= crypto.randomUUID();
        const receipt = await completeTenantCheckout({
          plan: selectedPlan,
          billing: billingInterval,
          paymentMethod,
          ...(appliedCoupon ? { couponCode: appliedCoupon.code } : {}),
          idempotencyKey: checkoutIdempotencyKey.current,
        });
        setOrderId(receipt.invoiceId);
        setLicenseKey(receipt.activated ? `AXON-${selectedPlan.slice(0, 3)}-ACTIVE` : 'Ödeme onayı bekleniyor');
        setActivationPending(!receipt.activated);
        setOrderComplete(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error: unknown) {
        setCheckoutError(normalizeApiError(error).error.message || 'Ödeme tamamlanamadı. Lütfen tekrar deneyin.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    setTimeout(() => {
      setIsProcessing(false);
      setOrderId(`ORD-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`);
      setLicenseKey(`AXON-${selectedPlan.slice(0, 3)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
      setOrderComplete(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 1200);
  };

  if (orderComplete) {
    return (
      <div className="min-h-screen bg-[#080F1E] text-slate-100 py-16 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-2xl w-full bg-[#0B1424] border border-slate-800 rounded-3xl p-8 sm:p-12 shadow-2xl relative overflow-hidden"
        >
          <div className="absolute -right-20 -top-20 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-20 -bottom-20 w-60 h-60 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mb-6 mx-auto shadow-lg shadow-emerald-950/40">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div className="text-center mb-8">
            <span className="text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {activationPending ? 'ÖDEME TALİMATI ALINDI' : 'ÖDEME BAŞARILI & LİSANS AKTİF'}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-3 mb-2">
              Tebrikler! Axon ERP Lisansınız Hazır.
            </h1>
            <p className="text-sm text-slate-300 max-w-md mx-auto">
              <strong>{companyName}</strong> için <strong>{PLAN_LABELS[selectedPlan]}</strong> ({isAnnual ? 'Yıllık' : 'Aylık'}) plan aboneliği başarıyla oluşturuldu.
            </p>
          </div>

          <div className="bg-[#080F1E] border border-slate-800 rounded-2xl p-6 mb-8 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-2">
              <span className="text-xs text-slate-400 font-medium">Sipariş Referansı</span>
              <span className="text-sm font-mono font-bold text-white">{orderId}</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-2">
              <span className="text-xs text-slate-400 font-medium">Kurumsal Lisans Anahtarı</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-bold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded border border-blue-500/20">
                  {licenseKey}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-2">
              <span className="text-xs text-slate-400 font-medium">Tahsil Edilen Toplam Tutar</span>
              <span className="text-base font-mono font-black text-emerald-400">
                ₺{grandTotal.toLocaleString('tr-TR')} (KDV Dahil)
              </span>
            </div>

            {appliedCoupon && (
              <div className="flex items-center justify-between text-xs text-emerald-400 bg-emerald-500/5 px-3 py-2 rounded-lg border border-emerald-500/20">
                <span>Uygulanan Kupon İndirimi ({appliedCoupon.code})</span>
                <span className="font-bold">-₺{discountAmount.toLocaleString('tr-TR')}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => router.push('/dashboard')}
              className="btn-primary py-3.5 flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <span>Yönetim Paneline Git</span>
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => window.print()}
              className="btn-secondary py-3.5 flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <FileText className="w-4 h-4 text-slate-400" />
              <span>Sipariş Makbuzunu Yazdır</span>
            </button>
          </div>

          <div className="text-center">
            <Link href="/" className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
              ← Ana Sayfaya Dön
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080F1E] text-slate-100 py-10 sm:py-16 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-10 left-1/3 w-[500px] h-[300px] bg-blue-600/10 blur-[130px] pointer-events-none rounded-full" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[300px] bg-indigo-600/10 blur-[120px] pointer-events-none rounded-full" />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Navigation / Top Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-8 mb-8 border-b border-slate-800 gap-4">
          <Link
            href="/#pricing"
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Fiyatlandırma Tablosuna Dön</span>
          </Link>

          <div className="flex items-center gap-4 text-xs text-slate-400">
            <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>256-bit SSL Güvenli Satış</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>3D Secure Uyumlu</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Checkout Forms (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Step 1: Company & Invoice Info */}
            <div className="bg-[#0B1424] border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-xl">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                  1
                </div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-blue-400" />
                  <span>Şirket ve Fatura Bilgileri</span>
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Firma Unvanı *
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    placeholder="Örn: ABC Teknoloji San. ve Tic. A.Ş."
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#080F1E] border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Vergi Dairesi *
                  </label>
                  <input
                    type="text"
                    value={taxOffice}
                    onChange={(e) => setTaxOffice(e.target.value)}
                    required
                    placeholder="Örn: Kadıköy"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#080F1E] border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    VKN / TCKN *
                  </label>
                  <input
                    type="text"
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value)}
                    required
                    placeholder="10 veya 11 haneli numara"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#080F1E] border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Yetkili Ad Soyad *
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    required
                    placeholder="Örn: Ahmet Yılmaz"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#080F1E] border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Yetkili E-posta (Lisans İletim) *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="ahmet@sirketiniz.com"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#080F1E] border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Telefon Numarası *
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="0532..."
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#080F1E] border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Şehir *
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                    placeholder="İstanbul"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#080F1E] border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Step 2: Payment Method */}
            <div className="bg-[#0B1424] border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-xl">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                  2
                </div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-blue-400" />
                  <span>Ödeme Seçenekleri</span>
                </h2>
              </div>

              {/* Payment Tabs */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#080F1E] border border-slate-800 rounded-xl mb-5">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    paymentMethod === 'card'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Kredi / Banka Kartı</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank')}
                  className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    paymentMethod === 'bank'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Havale / EFT</span>
                </button>
              </div>

              {paymentMethod === 'card' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Kart Üzerindeki İsim
                    </label>
                    <input
                      type="text"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      placeholder="AD SOYAD"
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[#080F1E] border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 uppercase font-mono transition-colors"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        Kart Numarası
                      </label>
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                        <span>Troy</span> • <span>Visa</span> • <span>Mastercard</span>
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        placeholder="4543 •••• •••• ••••"
                        className="w-full px-3.5 py-2.5 rounded-lg bg-[#080F1E] border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 font-mono transition-colors"
                      />
                      <CreditCard className="w-4 h-4 text-slate-500 absolute right-3.5 top-3 pointer-events-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Son Kullanma Tarihi (AA/YY)
                      </label>
                      <input
                        type="text"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        placeholder="MM/YY"
                        className="w-full px-3.5 py-2.5 rounded-lg bg-[#080F1E] border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 font-mono transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Güvenlik Kodu (CVV)
                      </label>
                      <input
                        type="text"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                        placeholder="123"
                        maxLength={4}
                        className="w-full px-3.5 py-2.5 rounded-lg bg-[#080F1E] border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 font-mono transition-colors"
                      />
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center gap-2 text-xs text-slate-400">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Kart bilgileriniz PCI-DSS seviyesinde şifrelenir ve asla saklanmaz.</span>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3 text-xs text-slate-300">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">Banka Adı:</span>
                    <span>Garanti BBVA - Kurumsal Şube</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">Alıcı Unvanı:</span>
                    <span>Axon ERP Yazılım Teknolojileri A.Ş.</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">IBAN:</span>
                    <span className="font-mono text-blue-400 font-bold">TR82 0006 2000 1234 5678 9012 34</span>
                  </div>
                  <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800">
                    * Havale/EFT açıklama kısmına firma unvanınızı yazınız. Dekont iletildikten sonra lisansınız anında açılacaktır.
                  </div>
                </div>
              )}
            </div>

            {/* Complete Purchase Button */}
            <div className="bg-[#0B1424] border border-slate-800 rounded-2xl p-6 shadow-xl">
              <form onSubmit={handleCheckoutSubmit}>
                {checkoutError && <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">{checkoutError}</div>}
                <div className="flex items-start gap-2.5 mb-5 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    id="terms"
                    defaultChecked
                    required
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                  />
                  <label htmlFor="terms">
                    <span className="text-blue-400 hover:underline cursor-pointer">Mesafeli Satış Sözleşmesi</span>&apos;ni
                    ve <span className="text-blue-400 hover:underline cursor-pointer">Hizmet Şartları</span>&apos;nı okudum, kabul ediyorum.
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full btn-primary py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-900/30 transition-transform active:scale-[0.99]"
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Güvenli Ödeme İşleniyor...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Güvenli Ödemeyi Tamamla (₺{grandTotal.toLocaleString('tr-TR')})</span>
                    </>
                  )}
                </button>
              </form>
            </div>

          </div>

          {/* Right Column: Order Summary & Coupon (5 cols) */}
          <div className="lg:col-span-5 space-y-6">

            {/* Plan Selector & Details Card */}
            <div className="bg-[#0B1424] border-2 border-blue-500/40 rounded-2xl p-6 shadow-2xl relative">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono uppercase text-blue-400 font-bold tracking-wider">
                  SİPARİŞ ÖZETİ
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                  {isAnnual ? 'Yıllık Sözleşme (-%20)' : 'Aylık Esnek'}
                </span>
              </div>

              {/* Plan Switcher Tabs right on checkout */}
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#080F1E] border border-slate-800 rounded-xl mb-5">
                {(['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as PlanName[]).map((plan) => (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => handlePlanChange(plan)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedPlan === plan
                        ? 'bg-blue-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {PLAN_LABELS[plan]}
                  </button>
                ))}
              </div>

              {/* Billing Interval Toggle right on checkout */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#080F1E] border border-slate-800 mb-6">
                <div>
                  <div className="text-xs font-bold text-white">Faturalandırma Dönemi</div>
                  <div className="text-[11px] text-slate-400">
                    {isAnnual ? 'Yıllık peşin (2 Ay Ücretsiz)' : 'Aylık taahhütsüz fatura'}
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setBillingInterval('monthly')}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded ${
                      !isAnnual ? 'bg-blue-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    Aylık
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingInterval('annual')}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded flex items-center gap-1 ${
                      isAnnual ? 'bg-blue-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    <span>Yıllık</span>
                    <span className="text-[9px] text-emerald-300 font-bold">%20</span>
                  </button>
                </div>
              </div>

              {/* Scope summary */}
              <div className="mb-6 pb-5 border-b border-slate-800/80 space-y-2">
                <div className="text-xs font-semibold text-slate-300">Paket Kapsamı:</div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>{priceInfo.users} dahil</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>{priceInfo.desc}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span>e-Fatura, e-İrsaliye & GİB Entegrasyonu</span>
                </div>
              </div>

              {/* COUPON INPUT SECTION */}
              <div className="mb-6 pb-6 border-b border-slate-800/80">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white mb-2">
                  <Tag className="w-3.5 h-3.5 text-amber-400" />
                  <span>İndirim / Kupon Kodu</span>
                </div>

                {!appliedCoupon ? (
                  <div className="space-y-2.5">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(e) => {
                          setCouponInput(e.target.value.toUpperCase());
                          if (couponError) setCouponError(null);
                        }}
                        placeholder="Örn: KOBIPRO30"
                        className="flex-1 px-3 py-2 rounded-lg bg-[#080F1E] border border-slate-800 text-xs text-white uppercase font-mono focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => void applyCouponCode(couponInput)}
                        disabled={isValidatingCoupon}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        {isValidatingCoupon ? 'Kontrol ediliyor…' : 'Uygula'}
                      </button>
                    </div>

                    {couponError && (
                      <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{couponError}</span>
                      </div>
                    )}

                    {/* Pre-defined popular coupon recommendations */}
                    <div className="pt-2">
                      <span className="text-[10px] text-slate-400 block mb-1.5 font-medium">
                        Kullanabileceğiniz Örnek Kuponlar (Tıklayın):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {SYSTEM_COUPONS.map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => {
                              setCouponInput(c.code);
                              void applyCouponCode(c.code);
                            }}
                            className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-[10px] font-mono text-blue-300 hover:text-white transition-colors cursor-pointer"
                          >
                            {c.code} (%{c.percent})
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">
                          {appliedCoupon.code}
                        </span>
                        <span className="text-xs text-emerald-300 font-semibold">
                          %{appliedCoupon.percent} İndirim
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={removeCoupon}
                        className="text-[11px] text-red-400 hover:text-red-300 underline cursor-pointer"
                      >
                        Kaldır
                      </button>
                    </div>
                    <div className="text-[11px] text-emerald-300/80">
                      {appliedCoupon.description}
                    </div>
                  </div>
                )}
              </div>

              {/* Price Calculation Breakdown */}
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Paket Bedeli ({isAnnual ? 'Yıllık Peşin' : 'Aylık'})</span>
                  <span className="font-mono text-slate-200">
                    ₺{baseCharge.toLocaleString('tr-TR')}
                  </span>
                </div>

                {appliedCoupon && (
                  <div className="flex items-center justify-between text-emerald-400 font-medium">
                    <span>Kupon İndirimi (%{appliedCoupon.percent})</span>
                    <span className="font-mono">
                      -₺{discountAmount.toLocaleString('tr-TR')}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-slate-400 pt-1">
                  <span>Ara Toplam (Matrah)</span>
                  <span className="font-mono text-slate-200">
                    ₺{netSubtotal.toLocaleString('tr-TR')}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span>Hesaplanan KDV (%20)</span>
                  <span className="font-mono text-slate-200">
                    ₺{kdvAmount.toLocaleString('tr-TR')}
                  </span>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-baseline justify-between">
                  <div>
                    <span className="text-sm font-bold text-white block">Ödenecek Toplam Tutar</span>
                    <span className="text-[10px] text-slate-400">KDV Dahil</span>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight text-blue-400">
                      ₺{grandTotal.toLocaleString('tr-TR')}
                    </span>
                    {isAnnual && (
                      <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
                        Aylık ortalama: ₺{Math.round(grandTotal / 12).toLocaleString('tr-TR')} / ay
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* Satisfaction & Support Box */}
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 text-xs text-slate-400 space-y-2">
              <div className="font-bold text-white flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>14 Gün Koşulsuz İade Güvencesi</span>
              </div>
              <p className="leading-relaxed">
                Satın aldığınız lisans planını ilk 14 gün boyunca risksiz deneyebilirsiniz. Memnun kalmamanız durumunda tek tıkla %100 kesintisiz iade sağlanır.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#080F1E] flex items-center justify-center text-slate-400 text-sm">
          Satış Ekranı Yükleniyor...
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  );
}
