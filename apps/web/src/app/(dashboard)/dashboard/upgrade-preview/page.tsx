'use client';

import { useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Shield, Sparkles, Check, ArrowLeft, TrendingUp, Cpu, Award, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ACCESS_POLICIES, PLAN, PLAN_FEATURES, PLAN_RANK, type PlanFeatureFlags, type PlanName } from '@/lib/plans';

interface MetricItem {
  label: string;
  value: string;
  description: string;
}

interface FeatureContent {
  desc: string;
  metrics: MetricItem[];
}

type MatrixFlag = keyof PlanFeatureFlags;

interface FeatureMatch {
  key: string;
  title: string;
  policyKey?: keyof typeof ACCESS_POLICIES;
  flag?: MatrixFlag;
  aliases: readonly string[];
  content: FeatureContent;
}

interface MatrixRow {
  label: string;
  flag: MatrixFlag;
  formatter: (value: PlanFeatureFlags[MatrixFlag]) => string;
}

const PLAN_LABELS: Record<PlanName, string> = {
  STARTER: 'Starter',
  PROFESSIONAL: 'Professional',
  ENTERPRISE: 'Enterprise',
};

const PLAN_BADGE_CLASS: Record<PlanName, string> = {
  STARTER: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  PROFESSIONAL: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
  ENTERPRISE: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
};

const BOOLEAN_LABELS: Record<string, string> = {
  true: 'Açık',
  false: 'Erişim yok',
};

const LOCK_REASON_LABELS: Record<string, string> = {
  plan: 'Plan yetersiz',
  module: 'Modül kapalı',
  feature: 'Feature override veya plan matrisi kapalı',
  limit: 'Limit dolu',
};

const DEFAULT_CONTENT: FeatureContent = {
  desc: 'Gerçek paket matrisine göre hangi planda açıldığını görebileceğiniz gelişmiş ERP kapasitesi.',
  metrics: [
    { label: 'Operasyonel Hız', value: '+%30', description: 'Otomasyonlar ve gelişmiş iş akışlarından faydalanın.' },
    { label: 'Kontrol', value: 'Daha Net', description: 'Yetki, modül ve feature kapılarını paket seviyesinde yönetin.' },
    { label: 'Ölçeklenme', value: 'Plan Bazlı', description: 'Professional veya Enterprise gereksinimini net olarak görün.' },
  ],
};

const FEATURE_MATCHES: readonly FeatureMatch[] = [
  {
    key: 'purchasing',
    title: 'Satın Alma Otomasyonu',
    policyKey: 'purchasing',
    flag: 'purchasing',
    aliases: ['satin alma', 'satinalma', 'purchase', 'talep'],
    content: {
      desc: 'Satın alma taleplerinden tedarikçi teklif karşılaştırmalarına kadar tedarik sürecinizi kontrollü hale getirin.',
      metrics: [
        { label: 'Maliyet Tasarrufu', value: '%20ye Varan', description: 'Tedarikçi teklif karşılaştırmaları ile uygun fiyatı bulun.' },
        { label: 'Tedarik Hızı', value: '+%35', description: 'Talepten siparişe daha hızlı onay akışı kurun.' },
        { label: 'Hata Oranı', value: '-%80', description: 'Mükerrer ve talep dışı sipariş riskini azaltın.' },
      ],
    },
  },
  {
    key: 'warehouse',
    title: 'Çoklu Depo',
    policyKey: 'stockValuations',
    flag: 'multiWarehouse',
    aliases: ['depo', 'warehouse', 'stok hareket', 'stok degerleme'],
    content: {
      desc: 'Stokları farklı lokasyonlarda izleyin, transferleri ve depo bazlı operasyonları yönetin.',
      metrics: [
        { label: 'Envanter Doğruluğu', value: '%99+', description: 'Lokasyon bazlı stok görünürlüğü elde edin.' },
        { label: 'Sevk Verimliliği', value: '+%50', description: 'Depolar arası transferleri hızlandırın.' },
        { label: 'Kayıp Riski', value: 'Azalır', description: 'Stok hareketleri daha izlenebilir hale gelir.' },
      ],
    },
  },
  {
    key: 'production',
    title: 'Üretim',
    policyKey: 'production',
    flag: 'production',
    aliases: ['uretim', 'üretim', 'bom', 'mrp', 'kapasite', 'kalite kontrol'],
    content: {
      desc: 'BOM, iş emirleri, MRP ve kapasite planlama ile üretim süreçlerini kurumsal seviyede yönetin.',
      metrics: [
        { label: 'Planlama Hızı', value: '+%40', description: 'Hammadde ihtiyacını ve iş emirlerini daha net planlayın.' },
        { label: 'Fire Oranı', value: '-%15', description: 'BOM standartları ile fireyi azaltın.' },
        { label: 'Maliyet Kontrolü', value: 'Tam', description: 'Üretim maliyetlerini operasyon bazında izleyin.' },
      ],
    },
  },
  {
    key: 'service',
    title: 'Teknik Servis',
    policyKey: 'service',
    flag: 'service',
    aliases: ['servis', 'ariza', 'bakim', 'saha'],
    content: {
      desc: 'Servis talepleri, bakım yönetimi ve saha akışlarıyla teknik ekibi Enterprise seviyesinde yönetin.',
      metrics: [
        { label: 'SLA Uyumu', value: '+%30', description: 'Servis süreçlerinde takip ve sorumluluk netleşir.' },
        { label: 'Ekip Verimliliği', value: '+%25', description: 'Atama ve saha süreçleri daha kontrollü ilerler.' },
        { label: 'Müşteri Deneyimi', value: 'Güçlü', description: 'Servis geçmişi ve varlık takibi tek yerde toplanır.' },
      ],
    },
  },
  {
    key: 'marketplace',
    title: 'Pazaryeri',
    policyKey: 'marketplace',
    flag: 'marketplace',
    aliases: ['pazaryeri', 'marketplace', 'entegrasyon', 'edi', 'b2b'],
    content: {
      desc: 'Pazaryeri ve B2B entegrasyonlarını Enterprise paketinin entegrasyon kapasitesiyle yönetin.',
      metrics: [
        { label: 'Senkronizasyon', value: 'Çift Yönlü', description: 'Sipariş ve stok süreçleri kanallar arasında akabilir.' },
        { label: 'Stok Riski', value: 'Düşer', description: 'Kanallar arası stok görünürlüğü artar.' },
        { label: 'Operasyon', value: 'Merkezi', description: 'Entegrasyon durumlarını tek merkezden izleyin.' },
      ],
    },
  },
  {
    key: 'approvals',
    title: 'Onay Akışları',
    policyKey: 'approvals',
    flag: 'approvals',
    aliases: ['onay', 'approval'],
    content: {
      desc: 'Belge, satın alma ve operasyonlar için onay kuralları oluşturun.',
      metrics: [
        { label: 'İşlem Güvenliği', value: 'Artar', description: 'Limit üstü işlemleri onaya bağlayın.' },
        { label: 'Süre', value: '-%65', description: 'Sistem içi onaylarla bekleme süresini azaltın.' },
        { label: 'Şeffaflık', value: 'Tam', description: 'Onay geçmişini denetlenebilir tutun.' },
      ],
    },
  },
  {
    key: 'roles',
    title: 'Rol Yönetimi',
    policyKey: 'roles',
    flag: 'roleManagement',
    aliases: ['rol', 'yetki', 'permission'],
    content: {
      desc: 'Kullanıcılar için rol, departman ve modül bazlı yetki şemaları kurun.',
      metrics: [
        { label: 'Veri Güvenliği', value: 'Güçlü', description: 'Kullanıcı erişimlerini sınırlandırın.' },
        { label: 'Denetim', value: 'Net', description: 'Kimlerin hangi alanlara eriştiğini yönetin.' },
        { label: 'Deneyim', value: 'Sade', description: 'Kullanıcılar yalnızca ilgili ekranları görür.' },
      ],
    },
  },
  {
    key: 'api',
    title: 'API Anahtarları',
    policyKey: 'apiKeys',
    flag: 'apiAccess',
    aliases: ['api', 'anahtar', 'key'],
    content: {
      desc: 'Dış sistemlerle güvenli API anahtarları ve entegrasyon akışları kurun.',
      metrics: [
        { label: 'Entegrasyon', value: 'Açık', description: 'Üçüncü parti sistemleri Axon ERPye bağlayın.' },
        { label: 'Trafik', value: 'İzlenebilir', description: 'API kullanımını kontrol edin.' },
        { label: 'Güvenlik', value: 'Scope', description: 'Anahtar bazlı yetki ve sınırlar tanımlayın.' },
      ],
    },
  },
  {
    key: 'cashflow',
    title: 'Nakit Akışı Tahmini',
    policyKey: 'cashflowForecast',
    flag: 'cashflowForecast',
    aliases: ['nakit', 'cashflow', 'cash flow'],
    content: {
      desc: 'Vade, tahsilat ve ödeme verileriyle nakit akışı tahminlerini Professional pakette görün.',
      metrics: [
        { label: 'Görünürlük', value: '30-90 Gün', description: 'Yaklaşan nakit ihtiyaçlarını önceden görün.' },
        { label: 'Planlama', value: 'Daha Net', description: 'Vade dağılımını raporlarla izleyin.' },
        { label: 'Risk', value: 'Azalır', description: 'Nakit sıkışıklığı sinyallerini erken yakalayın.' },
      ],
    },
  },
  {
    key: 'mail',
    title: 'Mail Merkezi',
    policyKey: 'mail',
    flag: 'mailCenter',
    aliases: ['mail', 'e-posta', 'email', 'rapor zamanlama'],
    content: {
      desc: 'Mail merkezi ve kurumsal mail aksiyonları Enterprise paketinde açılır.',
      metrics: [
        { label: 'İletişim', value: 'Merkezi', description: 'Mail süreçlerini ERP içinden yönetin.' },
        { label: 'Şablon', value: 'Standart', description: 'Kurumsal şablon ve akışları kullanın.' },
        { label: 'Otomasyon', value: 'Enterprise', description: 'Mail aksiyonlarını daha gelişmiş süreçlere bağlayın.' },
      ],
    },
  },
  {
    key: 'bulk',
    title: 'Toplu İşlemler',
    policyKey: 'bulkOperations',
    flag: 'bulkOperations',
    aliases: ['toplu', 'bulk'],
    content: {
      desc: 'Toplu işlem önizleme, dry-run ve operasyonel kontrollerle büyük değişiklikleri daha güvenli yapın.',
      metrics: [
        { label: 'Kontrol', value: 'Önizleme', description: 'Değişiklikleri uygulamadan önce görün.' },
        { label: 'Hız', value: 'Yüksek', description: 'Tekrarlayan işlemleri toplu yürütün.' },
        { label: 'İzlenebilirlik', value: 'Audit', description: 'Toplu işlemleri kayıt altında tutun.' },
      ],
    },
  },
];

const MATRIX_ROWS: readonly MatrixRow[] = [
  { label: 'Kullanıcı Limiti', flag: 'maxUsers', formatter: formatLimit('Kullanıcı') },
  { label: 'Ürün Tanımı Limiti', flag: 'maxProducts', formatter: formatLimit('Ürün') },
  { label: 'Çoklu Depo', flag: 'multiWarehouse', formatter: formatBoolean },
  { label: 'Satın Alma', flag: 'purchasing', formatter: formatBoolean },
  { label: 'Rol Yönetimi', flag: 'roleManagement', formatter: formatBoolean },
  { label: 'Onay Akışları', flag: 'approvals', formatter: formatBoolean },
  { label: 'Özel Raporlama', flag: 'customReporting', formatter: formatBoolean },
  { label: 'Nakit Akışı Tahmini', flag: 'cashflowForecast', formatter: formatBoolean },
  { label: 'Banka Mutabakati', flag: 'bankReconciliation', formatter: formatBoolean },
  { label: 'Lot / Seri Takibi', flag: 'lotSerialTracking', formatter: formatBoolean },
  { label: 'Toplu İşlemler', flag: 'bulkOperations', formatter: formatBoolean },
  { label: 'Üretim', flag: 'production', formatter: formatBoolean },
  { label: 'Teknik Servis', flag: 'service', formatter: formatBoolean },
  { label: 'Pazaryeri', flag: 'marketplace', formatter: formatBoolean },
  { label: 'İK', flag: 'hr', formatter: formatBoolean },
  { label: 'Bordro', flag: 'payroll', formatter: formatBoolean },
  { label: 'Mail Merkezi', flag: 'mailCenter', formatter: formatBoolean },
  { label: 'API Erişimi', flag: 'apiAccess', formatter: formatBoolean },
];

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPlanName(value: string): value is PlanName {
  return value in PLAN_RANK;
}

function maxPlan(left: PlanName, right: PlanName): PlanName {
  return PLAN_RANK[left] >= PLAN_RANK[right] ? left : right;
}

function formatBoolean(value: PlanFeatureFlags[MatrixFlag]): string {
  return BOOLEAN_LABELS[String(Boolean(value))];
}

function formatLimit(unit: string): (value: PlanFeatureFlags[MatrixFlag]) => string {
  return (value) => {
    if (value === null) return `Sınırsız ${unit}`;
    if (typeof value === 'number') return `${value} ${unit}`;
    return String(value);
  };
}

function featureEnabled(plan: PlanName, flag: MatrixFlag | undefined): boolean {
  if (!flag) return true;
  return Boolean(PLAN_FEATURES[plan][flag]);
}

function firstPlanForFlag(flag: MatrixFlag | undefined): PlanName | null {
  if (!flag) return null;
  const order: readonly PlanName[] = [PLAN.STARTER, PLAN.PROFESSIONAL, PLAN.ENTERPRISE];
  return order.find((plan) => featureEnabled(plan, flag)) ?? null;
}

function resolveFeature(feature: string, moduleName: string): FeatureMatch | null {
  const normalized = normalizeText(`${feature} ${moduleName}`);
  return FEATURE_MATCHES.find((item) => item.aliases.some((alias) => normalized.includes(normalizeText(alias)))) ?? null;
}

function resolveTargetPlan(requestedPlan: string, match: FeatureMatch | null): PlanName {
  const requested = isPlanName(requestedPlan) ? requestedPlan : PLAN.PROFESSIONAL;
  const policyPlan = match?.policyKey ? ACCESS_POLICIES[match.policyKey]?.minPlan : undefined;
  const flagPlan = firstPlanForFlag(match?.flag) ?? undefined;
  return [policyPlan, flagPlan].filter((plan): plan is PlanName => Boolean(plan)).reduce(maxPlan, requested);
}

export default function UpgradePreviewPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const feature = searchParams.get('feature') ?? '';
  const requestedPlan = (searchParams.get('plan') ?? PLAN.PROFESSIONAL).toUpperCase();
  const moduleName = searchParams.get('module') ?? '';
  const lockReasons = (searchParams.get('reason') ?? '')
    .split(',')
    .map((reason) => reason.trim())
    .filter(Boolean);

  const matchedFeature = useMemo(() => resolveFeature(feature, moduleName), [feature, moduleName]);
  const targetPlan = resolveTargetPlan(requestedPlan, matchedFeature);
  const planLabel = PLAN_LABELS[targetPlan];
  const activeContent = matchedFeature?.content ?? DEFAULT_CONTENT;
  const title = feature || matchedFeature?.title || 'Gelismis ERP Ozelligi';
  const selectedFlag = matchedFeature?.flag;
  const isAvailableInTarget = featureEnabled(targetPlan, selectedFlag);
  const starterFeatures = PLAN_FEATURES[PLAN.STARTER];
  const targetFeatures = PLAN_FEATURES[targetPlan];
  const visibleRows = MATRIX_ROWS.filter((row) => row.flag === selectedFlag || starterFeatures[row.flag] !== targetFeatures[row.flag]);

  const triggerChat = () => {
    window.dispatchEvent(new CustomEvent<string>('axon-chat-action', {
      detail: `Merhaba, ${title} hakkinda bilgi edinmek ve planimi ${planLabel} pakete yukseltmek istiyorum. Yardimci olabilir misiniz?`,
    }));
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <div>
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition-colors hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Geri Dön
        </button>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-8 shadow-2xl ring-1 ring-white/[0.02]">
        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div className="max-w-2xl space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${PLAN_BADGE_CLASS[targetPlan]}`}>
                {planLabel} ile açılır
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                Gerçek paket matrisi
              </span>
            </div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-white md:text-3xl">
              {title}
            </h1>
            <p className="text-sm leading-relaxed text-slate-400 md:text-base">
              {activeContent.desc}
            </p>
            {!isAvailableInTarget && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300">
                <AlertTriangle className="h-4 w-4" />
                Bu özellik seçili hedef planda aktif görünmüyor; paket matrisi kontrol edilmeli.
              </div>
            )}
            {lockReasons.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {lockReasons.map((reason) => (
                  <span key={reason} className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {LOCK_REASON_LABELS[reason] ?? reason}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row md:flex-col">
            <button
              onClick={triggerChat}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-sky-600 px-6 py-3 text-sm font-bold text-white shadow-lg transition-all duration-200 hover:from-violet-500 hover:to-sky-500"
            >
              <Cpu className="h-4 w-4" />
              {`${planLabel}'a Yükselt`}
            </button>
            <Button variant="outline" onClick={triggerChat}>
              Bilgi Al
            </Button>
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-200">
          <TrendingUp className="h-5 w-5 text-sky-400" />
          Örnek Kazanım Metrikleri
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {activeContent.metrics.map((metric) => (
            <div key={metric.label} className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-950/40 p-5 shadow-md">
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{metric.label}</span>
                <p className="mt-2 text-xl font-extrabold leading-none text-white md:text-2xl">{metric.value}</p>
                <p className="mt-3 text-xs leading-relaxed text-slate-400">{metric.description}</p>
              </div>
              <div className="mt-4 -mx-5 -mb-5 flex items-center gap-1.5 rounded-b-2xl border-t border-slate-900 bg-emerald-500/[0.02] px-5 py-2.5 text-[10px] font-bold text-emerald-400">
                <Check className="h-3.5 w-3.5 shrink-0" />
                {planLabel} planında paket matrisiyle aktif
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/20">
        <div className="flex items-center gap-2 border-b border-slate-800/80 bg-slate-900/40 p-5">
          <Award className="h-5 w-5 text-violet-400" />
          <h2 className="text-sm font-bold text-slate-200">Starter vs {planLabel} Paket Matrisi</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-900 bg-slate-950/40 text-xs font-semibold text-slate-400">
                <th className="p-4">Özellik / Limit</th>
                <th className="p-4">Starter</th>
                <th className="p-4 text-violet-400">{planLabel}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900 text-slate-300">
              {visibleRows.map((row) => {
                const starterValue = starterFeatures[row.flag];
                const targetValue = targetFeatures[row.flag];
                const isSelected = row.flag === selectedFlag;
                const changed = starterValue !== targetValue;

                return (
                  <tr key={row.flag} className={isSelected ? 'bg-violet-500/5' : 'hover:bg-slate-900/20'}>
                    <td className="p-4 font-semibold text-slate-200">
                      <span className="inline-flex items-center gap-2">
                        {row.label}
                        {isSelected && <Shield className="h-3.5 w-3.5 text-violet-400" />}
                      </span>
                    </td>
                    <td className="p-4">{row.formatter(starterValue)}</td>
                    <td className={changed ? 'p-4 font-semibold text-emerald-400' : 'p-4 text-slate-400'}>
                      {row.formatter(targetValue)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
