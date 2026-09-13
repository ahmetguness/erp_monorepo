'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type ModuleCategory = 'supply' | 'manufacturing' | 'sales' | 'finance';

interface ErpModule {
  id: string;
  category: ModuleCategory;
  title: string;
  badge: string;
  badgeColor: string;
  role: string;
  businessValue: string;
  capabilities: string[];
  mockData: {
    label1: string;
    val1: string;
    label2: string;
    val2: string;
    label3: string;
    val3: string;
    statusText: string;
  };
}

const CATEGORIES: { id: ModuleCategory; label: string }[] = [
  { id: 'supply', label: 'Tedarik & Stok' },
  { id: 'manufacturing', label: 'Üretim & MRP' },
  { id: 'sales', label: 'Satış & Pazaryeri' },
  { id: 'finance', label: 'Finans & Muhasebe' },
];

const MODULES: ErpModule[] = [
  // Supply & Warehouse
  {
    id: 'multi-warehouse',
    category: 'supply',
    title: 'Çok Depolu Stok Yönetimi',
    badge: 'Stok Kontrolü',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    role: 'Depo & Lojistik Sorumlusu',
    businessValue: 'Fiziksel stok, rezerve stok ve satışa hazır serbest stok miktarını tüm depolarınızda anlık olarak tek ekrandan izleyin.',
    capabilities: [
      'Merkez, şube ve fason depoları arası transfer fişleri',
      'Kritik stok seviyesine inen ürünlerde erken uyarı',
      'Raf, koridor ve lokasyon bazında düzenli stok takibi',
      'Dönemsel sayım ve fire/hurda mutabakat fişleri',
    ],
    mockData: {
      label1: 'Tuzla Merkez Depo',
      val1: '850 Adet Serbest',
      label2: 'Kadıköy Şube Depo',
      val2: '420 Adet Rezerve',
      label3: 'Ankara Dağıtım',
      val3: '310 Adet Sevkte',
      statusText: 'Depolar arası anlık stok konsolidasyonu aktif',
    },
  },
  {
    id: 'lot-serial',
    category: 'supply',
    title: 'Parti / Lot & Seri No Takibi',
    badge: 'İzlenebilirlik',
    badgeColor: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    role: 'Kalite & Mal Kabul',
    businessValue: 'Hammadde girişinden müşteriye teslimata kadar her partiyi ve seri numarasını geriye dönük eksiksiz izleyin.',
    capabilities: [
      'Son kullanma tarihi (SKT) yaklaşan partilerde otomatik bildirim',
      'Uygunsuz partiler için karantina kilitleme ve sevkiyat engeli',
      'Müşteri iadesi ve garanti takiplerinde seri numarası doğrulaması',
    ],
    mockData: {
      label1: 'Parti Kodu',
      val1: 'LOT-2026-04',
      label2: 'Durum',
      val2: 'Karantina: 0 (Onaylı)',
      label3: 'İzlenebilirlik',
      val3: 'Geriye Dönük Bağlı',
      statusText: 'Barkod okutularak parti geçmişine anında erişim',
    },
  },
  {
    id: 'stock-reservations',
    category: 'supply',
    title: 'Sipariş Stok Rezervasyonu',
    badge: 'Çift Satış Önleme',
    badgeColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    role: 'Satış & Müşteri Hizmetleri',
    businessValue: 'Onaylanan siparişlerin stoğunu otomatik kilitleyerek aynı ürünün başka müşteriye mükerrer satılmasını engelleyin.',
    capabilities: [
      'Sipariş onaylandığı an depodan fiziksel stok ayırma',
      'İptal edilen siparişlerde rezervasyonu tek tıkla çözme',
      'Pazaryerlerine sadece serbest kullanılabilir stok miktarını açma',
    ],
    mockData: {
      label1: 'Toplam Stok',
      val1: '1.270 Adet',
      label2: 'Kilitli Rezervasyon',
      val2: '450 Adet (Onaylı Sipariş)',
      label3: 'Serbest Satılabilir',
      val3: '820 Adet',
      statusText: 'Satış kanalları yalnızca serbest stok kadar sipariş kabul eder',
    },
  },

  // Manufacturing & MRP
  {
    id: 'mrp-planning',
    category: 'manufacturing',
    title: 'Malzeme İhtiyaç Planlaması (MRP)',
    badge: 'Planlama Motoru',
    badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    role: 'Üretim Planlama Müdürü',
    businessValue: 'Gelen siparişlere göre hangi hammaddeden ne kadar temin edilmesi gerektiğini otomatik hesaplayarak tezgâh duruşlarını önleyin.',
    capabilities: [
      'Açık siparişler ve emniyet stoğuna göre net ihtiyaç analizi',
      'Tedarik süresi göz önüne alınarak otomatik satınalma önerisi',
      'İş emrine bağlı hammadde rezervasyonu',
    ],
    mockData: {
      label1: 'Planlanan İş Emri',
      val1: '350 Adet Pompa',
      label2: 'Eksik Parça',
      val2: '120 Adet Bağlantı Kiti',
      label3: 'Sistem Önerisi',
      val3: 'Satınalma Talebi Açıldı',
      statusText: 'Eksik malzeme tespiti tezgâh duruşu yaşanmadan yapılır',
    },
  },
  {
    id: 'bom-recipes',
    category: 'manufacturing',
    title: 'Ürün Ağaçları (BOM) & Reçeteler',
    badge: 'Ürün Reçetesi',
    badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    role: 'Üretim Şefi & Mühendislik',
    businessValue: 'Çok seviyeli montaj reçeteleri, fire oranları ve operasyon sürelerini tanımlayarak standart üretim disiplini oluşturun.',
    capabilities: [
      'Çok kademeli yarı-mamul ve montaj ağaçları',
      'Standart fire oranları ve alternatif malzeme tanımları',
      'Reçete revizyon geçmişi ve geçmiş üretim kayıtları koruması',
    ],
    mockData: {
      label1: 'Montaj Seviyesi',
      val1: '3 Kademeli Yarı-Mamul',
      label2: 'Standart Fire',
      val2: '%2.0 Tanımlı',
      label3: 'Reçete Sürümü',
      val3: 'v2.1 (Onaylı)',
      statusText: 'Reçete değişiklikleri geçmiş kayıtları bozmaz',
    },
  },
  {
    id: 'work-orders',
    category: 'manufacturing',
    title: 'İş Emirleri & Tezgâh Kapasitesi',
    badge: 'Üretim Sahası',
    badgeColor: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    role: 'Fabrika Müdürü',
    businessValue: 'İş merkezlerinin yük durumunu, hat operasyonlarını ve duruş nedenlerini canlı izleyerek darboğazları giderin.',
    capabilities: [
      'İstasyon ve tezgâh bazlı iş planlama ve iş emri başlatma',
      'Operatör iş tamamlama ve fire miktarı girişi',
      'Fason operasyon ve dış işlem takibi',
    ],
    mockData: {
      label1: 'Aktif İstasyon',
      val1: '12 İstasyon Devrede',
      label2: 'Hat Durumu',
      val2: 'Plan Dahilinde İşliyor',
      label3: 'Darboğaz Uyarısı',
      val3: 'Torna Hattı (Planlı)',
      statusText: 'İş emirleri barkod okutularak hatta başlatılır',
    },
  },

  // Sales & Marketplaces
  {
    id: 'marketplaces',
    category: 'sales',
    title: 'Pazaryeri & E-Ticaret Entegrasyonu',
    badge: 'Kanal Yönetimi',
    badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    role: 'E-Ticaret Yöneticisi',
    businessValue: 'Trendyol, Hepsiburada, Amazon ve Shopify siparişlerinizi tek ekranda toplayın; stokları tüm kanallarda senkronize tutun.',
    capabilities: [
      'Pazaryerlerinden gelen siparişlerin tek tıkla iş emrine dönüşmesi',
      'Depodaki stok değişiminin tüm satış kanallarına anlık yansıması',
      'Kargo barkodu ve müşteri faturalandırma otomasyonu',
    ],
    mockData: {
      label1: 'Bağlı Kanallar',
      val1: 'Pazaryerleri & Web',
      label2: 'Gelen Sipariş',
      val2: 'Tek Merkezde Konsolide',
      label3: 'Stok Güncelleme',
      val3: 'Çift Yönlü Senkron',
      statusText: 'Satılan ürünün stoğu diğer tüm kanallarda anında güncellenir',
    },
  },
  {
    id: 'sales-quotes',
    category: 'sales',
    title: 'Teklif & Müşteri Sipariş Yönetimi',
    badge: 'Satış Süreci',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    role: 'Satış Müdürü',
    businessValue: 'Müşteri cari koşullarına uygun dinamik teklifler hazırlayın, iskonto onay sınırlarını koruyun ve tek tıkla siparişe dönüştürün.',
    capabilities: [
      'Müşteri özel fiyat listesi ve geçmiş sipariş şartları',
      'Yetki aşan iskontolarda yönetici onay akışı',
      'Onaylanan teklifin tek tıkla sevk emrine dönüşmesi',
    ],
    mockData: {
      label1: 'Açık Teklifler',
      val1: 'TKL-2026-089',
      label2: 'Cari Risk Durumu',
      val2: 'Limit Dahilinde',
      label3: 'Dönüşüm',
      val3: 'Tek Tıkla Sipariş',
      statusText: 'Teklif içeriği mükerrer veri girişi olmadan siparişe aktarılır',
    },
  },

  // Finance & Accounting
  {
    id: 'e-invoicing',
    category: 'finance',
    title: 'e-Fatura, e-İrsaliye & e-Arşiv',
    badge: 'Resmi Mevzuat',
    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    role: 'Mali Müşavir & Muhasebe',
    businessValue: 'Gelir İdaresi Başkanlığı standartlarında e-Fatura ve e-İrsaliyelerinizi doğrudan ERP içerisinden düzenleyin ve arşivleyin.',
    capabilities: [
      'Sevkiyatı onaylanan irsaliyeden tek tıkla e-Fatura üretimi',
      'Tevkifatlı ve istisnalı fatura hesaplama kuralları',
      'İptal ve itiraz süreçlerinin yasal takvimde izlenmesi',
    ],
    mockData: {
      label1: 'Düzenlenen Belge',
      val1: 'e-Fatura & e-İrsaliye',
      label2: 'Mevzuat Formatı',
      val2: 'Resmi UBL Standardı',
      label3: 'İletim Durumu',
      val3: 'Başarıyla İletildi',
      statusText: 'İrsaliye satırları hatasız biçimde resmi faturaya aktarılır',
    },
  },
  {
    id: 'general-ledger',
    category: 'finance',
    title: 'Genel Muhasebe & Tekdüzen Defter',
    badge: 'Defter Kayıtları',
    badgeColor: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
    role: 'Genel Muhasebe Şefi',
    businessValue: 'Fatura, irsaliye ve banka hareketlerinden otomatik yevmiye fişi üreterek mizan, bilanço ve nakit durumunuzu anlık izleyin.',
    capabilities: [
      'Ticari operasyonlardan otomatik tekdüzen hesap fişi üretimi',
      'Banka ekstrelerinin okunarak açık carilerle eşleştirilmesi',
      'Anlık mizan, bilanço ve gelir tablosu raporlaması',
    ],
    mockData: {
      label1: 'Yevmiye Kaydı',
      val1: 'Otomatik Üretildi',
      label2: 'Banka Eşleşmesi',
      val2: 'Havale Cariyle Eşleşti',
      label3: 'Mizan Durumu',
      val3: 'Anlık Dengeli',
      statusText: 'Elle defter kaydı yazma ihtiyacı tamamen ortadan kalkar',
    },
  },
];

export default function Features() {
  const [selectedCategory, setSelectedCategory] = useState<ModuleCategory>('supply');
  
  const categoryModules = MODULES.filter((m) => m.category === selectedCategory);
  const [activeModuleId, setActiveModuleId] = useState<string>(categoryModules[0]?.id || 'multi-warehouse');

  const handleCategoryChange = (cat: ModuleCategory) => {
    setSelectedCategory(cat);
    const firstOfCat = MODULES.find((m) => m.category === cat);
    if (firstOfCat) setActiveModuleId(firstOfCat.id);
  };

  const activeModule = MODULES.find((m) => m.id === activeModuleId) || categoryModules[0] || MODULES[0];

  return (
    <section id="features" className="py-20 lg:py-28 bg-[#0B1424] border-t border-slate-800 text-slate-100 overflow-hidden">
      <div className="section-container">
        
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
          <div className="max-w-2xl">
            <div className="section-label">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span>MODÜL KATALOĞU</span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight mb-3">
              İhtiyacınız olan tüm modüller,<br />
              <span className="text-slate-400 font-normal">
                tek ve düzenli bir konsolda.
              </span>
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Departmanınızı seçin; ilgili modülün işletmenize sağladığı faydayı, temel yeteneklerini ve gerçek çalışma mantığını inceleyin.
            </p>
          </div>

          <div className="text-xs text-slate-400 bg-[#080F1E] px-4 py-2 rounded-lg border border-slate-800 self-start lg:self-auto font-medium">
            Modüler Mimari: İhtiyacınıza göre genişletilebilir
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-8">
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'bg-[#080F1E] text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Master-Detail Layout: Business Value First */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-[#080F1E] border border-slate-800/80 rounded-2xl p-5 sm:p-7 shadow-xl">
          
          {/* Left Column: Modules List */}
          <div className="lg:col-span-4 flex flex-col gap-2.5">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 px-1">
              Modül Seçin ({categoryModules.length})
            </div>

            {categoryModules.map((m) => {
              const isSelected = m.id === activeModuleId;
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveModuleId(m.id)}
                  className={`p-4 rounded-xl text-left transition-all duration-150 cursor-pointer border flex flex-col justify-between ${
                    isSelected
                      ? 'bg-[#0B1424] border-blue-500/60 shadow-md shadow-blue-500/10'
                      : 'bg-[#060B15]/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${m.badgeColor}`}>
                      {m.badge}
                    </span>
                    {isSelected && (
                      <span className="text-blue-400 font-bold text-xs">→</span>
                    )}
                  </div>
                  <h3 className={`text-xs sm:text-sm font-bold leading-tight ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                    {m.title}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                    {m.businessValue}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Right Column: Business Value, Capabilities & Real Data Snapshot */}
          <div className="lg:col-span-8 bg-[#0B1424] border border-slate-800 rounded-xl p-6 flex flex-col justify-between shadow-inner">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeModule.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                {/* 1. Header with Role Tag */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded border ${activeModule.badgeColor}`}>
                        {activeModule.badge}
                      </span>
                      <span className="text-xs text-slate-400">
                        İlgili Rol: <strong className="text-slate-200">{activeModule.role}</strong>
                      </span>
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold text-white">
                      {activeModule.title}
                    </h3>
                  </div>

                  <span className="text-[11px] text-slate-400 bg-white/[0.04] px-2.5 py-1 rounded border border-white/[0.08] self-start sm:self-auto">
                    Kullanıma Hazır
                  </span>
                </div>

                {/* 2. Business Value First (What does it deliver?) */}
                <div className="p-4 rounded-xl bg-[#080F1E] border border-slate-800">
                  <div className="text-[10px] font-mono text-blue-400 font-semibold uppercase tracking-wider mb-1">
                    İşletmeye Sağladığı Temel Değer:
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed font-medium">
                    {activeModule.businessValue}
                  </p>
                </div>

                {/* 3. Capabilities Checklist */}
                <div>
                  <div className="text-xs font-semibold text-slate-400 mb-2.5">
                    Modül Yetenekleri:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {activeModule.capabilities.map((cap, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-[#080F1E] border border-slate-800 flex items-start gap-2 text-xs text-slate-300"
                      >
                        <span className="text-emerald-400 font-bold mt-0.5">✓</span>
                        <span>{cap}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 4. Live Data Snapshot */}
                <div className="p-4 rounded-xl bg-[#080F1E] border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 pb-2 border-b border-slate-800">
                    <span>Örnek Çalışma Ekranı Verisi:</span>
                    <span className="text-slate-400 font-mono text-[10px]">Örnek Konsol</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2.5 rounded bg-[#060B15] border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">{activeModule.mockData.label1}</span>
                      <span className="text-xs font-bold text-white font-mono mt-0.5 block">{activeModule.mockData.val1}</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#060B15] border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">{activeModule.mockData.label2}</span>
                      <span className="text-xs font-bold text-white font-mono mt-0.5 block">{activeModule.mockData.val2}</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#060B15] border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">{activeModule.mockData.label3}</span>
                      <span className="text-xs font-bold text-white font-mono mt-0.5 block">{activeModule.mockData.val3}</span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-300 flex items-center gap-2 pt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                    <span>{activeModule.mockData.statusText}</span>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Bottom Demo Trigger */}
            <div className="pt-4 mt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
              <span>Şirketinizin organizasyon ve yetki yapısına göre uyarlanabilir.</span>
              <button
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('openChatWithMessage', {
                      detail: `${activeModule.title} modülü hakkında demo ve kurumsal uyarlama bilgisi almak istiyorum.`,
                    })
                  );
                }}
                className="text-blue-400 hover:text-blue-300 font-semibold cursor-pointer transition-colors"
              >
                Bu Modülü İnceleyin →
              </button>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
