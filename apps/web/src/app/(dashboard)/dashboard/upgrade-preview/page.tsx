'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Shield, Sparkles, Check, ArrowLeft, TrendingUp, Cpu, Award } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

interface MetricItem {
  label: string;
  value: string;
  description: string;
}

const FEATURE_METRICS: Record<string, { desc: string; metrics: MetricItem[] }> = {
  'satın alma': {
    desc: 'Satın alma taleplerinden tedarikçi teklif karşılaştırmalarına kadar tüm tedarik sürecinizi otomatikleştirin, maliyetlerinizi kontrol altına alın.',
    metrics: [
      { label: 'Maliyet Tasarrufu', value: '%20\'ye Varan', description: 'Tedarikçi teklif karşılaştırmaları ile en uygun fiyatı bulun.' },
      { label: 'Tedarik Hızı', value: '+%35 Hızlanma', description: 'Talepten siparişe otomatik onay akışları ile zaman kazanın.' },
      { label: 'Hata Oranı', value: '-%80 Azalış', description: 'Talep dışı ve mükerrer siparişleri tamamen engelleyin.' }
    ]
  },
  'depolar': {
    desc: 'Çoklu depo yapısı ile stoklarınızı farklı lokasyonlarda, şubelerde veya reyonlarda anlık olarak izleyin, transferleri kolayca yönetin.',
    metrics: [
      { label: 'Envanter Doğruluğu', value: '%99.8 Başarı', description: 'Farklı lokasyonlardaki stokları hatasız ve anlık takip edin.' },
      { label: 'Sevk Verimliliği', value: '+%50 Artış', description: 'Depolar arası transferleri ve lokasyon bazlı sayımları hızlandırın.' },
      { label: 'Envanter Kaçağı', value: '-%95 Azalış', description: 'Gelişmiş stok takip sistemi ile kayıp/kaçak riskini yok edin.' }
    ]
  },
  'üretim': {
    desc: 'Ürün ağaçları (BOM), iş merkezleri ve iş emirleri ile üretim süreçlerinizi en ince detayına kadar planlayın ve maliyetlendirin.',
    metrics: [
      { label: 'Planlama Hızı', value: '+%40 Artış', description: 'Hammadde gereksinimlerini otomatik hesaplayıp üretim planlayın.' },
      { label: 'Fire Oranı', value: '-%15 Azalış', description: 'BOM standartları sayesinde malzeme firesini minimuma indirin.' },
      { label: 'Maliyet Görünürlüğü', value: '100% Kontrol', description: 'İşçilik, enerji ve genel giderleri doğrudan ürün maliyetine yansıtın.' }
    ]
  },
  'teknik servis': {
    desc: 'Müşteri varlıklarını, servis taleplerini, arıza ve bakım süreçlerini organize edin; teknik saha ekibinizi en iyi şekilde yönetin.',
    metrics: [
      { label: 'SLA Uyum Oranı', value: '+%30 Artış', description: 'Müşteri hizmet seviyesi sözleşmelerine (SLA) tam uyum sağlayın.' },
      { label: 'Ekip Verimliliği', value: '+%25 İlerleme', description: 'Teknisyen atamalarını ve rota planlamalarını dijital olarak yönetin.' },
      { label: 'Müşteri Memnuniyeti', value: '98% Memnuniyet', description: 'Hızlı arıza çözümleri ve şeffaf servis formları sunun.' }
    ]
  },
  'pazaryeri': {
    desc: 'Trendyol ve diğer popüler pazaryerlerindeki ürün listelemelerinizi ve siparişlerinizi Axon ERP ile çift yönlü anlık senkronize edin.',
    metrics: [
      { label: 'Sipariş Senkronizasyonu', value: 'Anlık / Çift Yönlü', description: 'Pazaryerinden gelen siparişleri anında faturaya dönüştürün.' },
      { label: 'Stok Senkronu', value: '100% Otomatik', description: 'Fatura veya sevk esnasında tüm kanallardaki stokları güncelleyin.' },
      { label: 'Mükerrer Satış Riski', value: 'Sıfır Hata', description: 'Eş zamanlı stok güncellemeleri ile stokta olmayan ürün satışını bitirin.' }
    ]
  },
  'onay akışları': {
    desc: 'Belge, satın alma, iskonto ve ödemeler için kurumsal onay hiyerarşileri kurun; işlerinizin kontrolsüz şekilde yürümesini engelleyin.',
    metrics: [
      { label: 'İşlem Güvenliği', value: '100% Denetim', description: 'Belirlenen limitlerin üzerindeki işlemler için onay zorunlu kılın.' },
      { label: 'Onay Süreleri', value: '-%65 Süre Tasarrufu', description: 'Sistem içi bildirimler ile mobil uyumlu hızlı onay süreçleri.' },
      { label: 'Şeffaflık', value: 'Tarihçe Kaydı', description: 'Kimin neyi, ne zaman onayladığını detaylı geçmişten izleyin.' }
    ]
  },
  'rol yönetimi': {
    desc: 'Kullanıcılarınız için detaylı rol, departman ve modül bazlı yetkilendirme şablonları hazırlayın, veri güvenliğini zirveye taşıyın.',
    metrics: [
      { label: 'Veri Güvenliği', value: 'Maksimum Koruma', description: 'Kullanıcıların sadece kendi yetki alanlarındaki verileri görmesini sağlayın.' },
      { label: 'Kullanıcı Deneyimi', value: 'Sade Arayüz', description: 'Kullanıcıların sadece yetkili oldukları menüleri temiz bir şekilde görmesini sağlayın.' },
      { label: 'İç Denetim Uyumluluğu', value: 'Tam Uyum', description: 'ISO 27001 ve KVKK standartlarında güvenli yetkilendirme yapın.' }
    ]
  },
  'api anahtarları': {
    desc: 'Dış yazılımlarla ve entegrasyon çözümleriyle bağlantı kurmak için güvenli API anahtarları tanımlayın ve API trafiğini izleyin.',
    metrics: [
      { label: 'Entegrasyon Kapasitesi', value: 'Sınırsız Bağlantı', description: 'Axon REST API kullanarak üçüncü parti yazılımları sisteme bağlayın.' },
      { label: 'Veri Hızı', value: 'Anlık API Trafiği', description: 'Gerçek zamanlı webhook bildirimleri ile veri akışını hızlandırın.' },
      { label: 'Güvenlik & Sınır', value: 'Rate Limit', description: 'Her API anahtarı için ayrı erişim kapsamı ve rate limit politikası uygulayın.' }
    ]
  }
};

const DEFAULT_METRIC = {
  desc: 'Professional ve Enterprise planların sunduğu gelişmiş operasyon modülleri, limitsiz kullanıcı sayısı, API erişimi ve gelişmiş raporlama özellikleri ile işinizi büyütün.',
  metrics: [
    { label: 'Verimlilik Kazanımı', value: '+%30 Operasyonel Hız', description: 'Otomasyonlar ve gelişmiş iş akışları ile el işlerini ortadan kaldırın.' },
    { label: 'Kullanıcı Limiti', value: '25+ Kullanıcı', description: 'Sınırlı Starter planı yerine tüm ekibinizi ve departmanları sisteme dahil edin.' },
    { label: 'Stok & Depo Limiti', value: '5000+ Ürün ve Depo', description: 'Limitsiz depo tanımlama, ürün lot/seri takibi ve stok değerleme.' }
  ]
};

export default function UpgradePreviewPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const feature = searchParams.get('feature') ?? '';
  const plan = (searchParams.get('plan') ?? 'PROFESSIONAL').toUpperCase();
  const moduleName = searchParams.get('module') ?? '';

  const normalizedFeature = feature.toLowerCase().trim();
  
  // Find key based on normalized matching
  let matchedKey = '';
  if (normalizedFeature.includes('satın alma') || normalizedFeature.includes('talep')) {
    matchedKey = 'satın alma';
  } else if (normalizedFeature.includes('depo') || normalizedFeature.includes('warehouse')) {
    matchedKey = 'depolar';
  } else if (normalizedFeature.includes('üretim') || normalizedFeature.includes('bom')) {
    matchedKey = 'üretim';
  } else if (normalizedFeature.includes('servis') || normalizedFeature.includes('arıza')) {
    matchedKey = 'teknik servis';
  } else if (normalizedFeature.includes('pazaryeri') || normalizedFeature.includes('entegrasyon')) {
    matchedKey = 'pazaryeri';
  } else if (normalizedFeature.includes('onay')) {
    matchedKey = 'onay akışları';
  } else if (normalizedFeature.includes('rol') || normalizedFeature.includes('yetki')) {
    matchedKey = 'rol yönetimi';
  } else if (normalizedFeature.includes('api')) {
    matchedKey = 'api anahtarları';
  }

  const activeContent = matchedKey ? FEATURE_METRICS[matchedKey] : DEFAULT_METRIC;

  const planLabel = plan === 'ENTERPRISE' ? 'Enterprise' : 'Professional';
  const planBadgeClass = plan === 'ENTERPRISE' 
    ? 'text-amber-400 bg-amber-500/10 border-amber-500/30' 
    : 'text-violet-400 bg-violet-500/10 border-violet-500/30';

  const triggerChat = () => {
    window.dispatchEvent(new CustomEvent<string>('axon-chat-action', {
      detail: `Merhaba, ${feature} modülü hakkında bilgi edinmek ve planımı ${planLabel} pakete yükseltmek istiyorum. Yardımcı olabilir misiniz?`
    }));
  };

  return (
    <div className="space-y-6 pb-12 max-w-6xl mx-auto">
      {/* Back button */}
      <div>
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Geri Dön
        </button>
      </div>

      {/* Hero header */}
      <div className="relative rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-8 shadow-2xl overflow-hidden ring-1 ring-white/[0.02]">
        {/* Glowing backgrounds */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-violet-600/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-sky-600/10 blur-3xl" />

        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-3">
              <span className={`rounded-full border px-3 py-1 text-xs font-bold tracking-wide uppercase ${planBadgeClass}`}>
                {planLabel} ile açılır
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                Plan Yükseltme Önizlemesi
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight leading-tight">
              {feature || 'Gelişmiş ERP Özelliği'}
            </h1>
            <p className="text-sm md:text-base leading-relaxed text-slate-400">
              {activeContent.desc}
            </p>
          </div>
          <div className="shrink-0 flex flex-col gap-3 sm:flex-row md:flex-col">
            <button
              onClick={triggerChat}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-sky-600 hover:from-violet-500 hover:to-sky-500 text-white font-bold text-sm shadow-lg transition-all duration-200 flex items-center justify-center gap-2"
            >
              <Cpu className="h-4 w-4" />
              Professional'a Yükselt
            </button>
            <Button
              variant="outline"
              onClick={triggerChat}
            >
              Bilgi Al
            </Button>
          </div>
        </div>
      </div>

      {/* Metrics Section */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-sky-400" />
          Örnek Kazanım Metrikleri
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {activeContent.metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5 shadow-md flex flex-col justify-between"
            >
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">{metric.label}</span>
                <p className="text-xl md:text-2xl font-extrabold text-white mt-2 leading-none">{metric.value}</p>
                <p className="text-xs text-slate-400 mt-3 leading-relaxed">{metric.description}</p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-900 flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold bg-emerald-500/[0.02] -mx-5 -mb-5 px-5 py-2.5 rounded-b-2xl">
                <Check className="h-3.5 w-3.5 shrink-0" />
                Professional geçişinde anında aktif
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Feature matrix */}
      <section className="rounded-2xl border border-slate-800 bg-slate-950/20 overflow-hidden">
        <div className="p-5 border-b border-slate-800/80 bg-slate-900/40 flex items-center gap-2">
          <Award className="h-5 w-5 text-violet-400" />
          <h2 className="text-sm font-bold text-slate-200">Starter vs {planLabel} Karşılaştırma</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-900 bg-slate-950/40 text-slate-400 text-xs font-semibold">
                <th className="p-4">Özellik / Limit</th>
                <th className="p-4">Starter (Mevcut)</th>
                <th className="p-4 text-violet-400">{planLabel} (Geçiş Sonrası)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900 text-slate-300">
              <tr className="hover:bg-slate-900/20">
                <td className="p-4 font-semibold text-slate-200">Kullanıcı Limiti</td>
                <td className="p-4">Maksimum 5 Kullanıcı</td>
                <td className="p-4 font-semibold text-emerald-400">Maksimum 25 Kullanıcı (Limitsiz Destek)</td>
              </tr>
              <tr className="hover:bg-slate-900/20">
                <td className="p-4 font-semibold text-slate-200">Ürün Tanımı Limiti</td>
                <td className="p-4">500 Ürün</td>
                <td className="p-4 font-semibold text-emerald-400">5000 Ürün</td>
              </tr>
              <tr className="hover:bg-slate-900/20">
                <td className="p-4 font-semibold text-slate-200">Depo Sayısı</td>
                <td className="p-4">Tek Depo</td>
                <td className="p-4 font-semibold text-emerald-400">Çoklu Depo (5 Adet)</td>
              </tr>
              <tr className="hover:bg-slate-900/20">
                <td className="p-4 font-semibold text-slate-200">Gelişmiş Stok Takibi</td>
                <td className="p-4">Erişim Yok</td>
                <td className="p-4 font-semibold text-emerald-400">Lot, Seri No, Ürün Partileri</td>
              </tr>
              <tr className="hover:bg-slate-900/20">
                <td className="p-4 font-semibold text-slate-200">Satın Alma Otomasyonu</td>
                <td className="p-4">Erişim Yok</td>
                <td className="p-4 font-semibold text-emerald-400">Talepler ve Satın Alma Siparişleri</td>
              </tr>
              <tr className="hover:bg-slate-900/20">
                <td className="p-4 font-semibold text-slate-200">API Erişimi</td>
                <td className="p-4">Erişim Yok</td>
                <td className="p-4 font-semibold text-emerald-400">Axon REST API Anahtarları</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
