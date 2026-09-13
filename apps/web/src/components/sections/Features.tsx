'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type ModuleCategory = 'supply' | 'manufacturing' | 'sales' | 'finance' | 'ai' | 'governance';

interface ErpModule {
  id: string;
  category: ModuleCategory;
  title: string;
  badge: string;
  badgeColor: string;
  role: string;
  desc: string;
  detail: string;
  highlights: string[];
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

const CATEGORIES: { id: ModuleCategory; label: string; icon: string }[] = [
  { id: 'supply', label: 'Tedarik & Depo', icon: '📦' },
  { id: 'manufacturing', label: 'Üretim & MRP', icon: '⚙️' },
  { id: 'sales', label: 'Satış & Pazaryeri', icon: '🛒' },
  { id: 'finance', label: 'Finans & GİB', icon: '💰' },
  { id: 'ai', label: 'Yapay Zeka & Otomasyon', icon: '⚡' },
  { id: 'governance', label: 'Yönetişim & Güvenlik', icon: '🛡️' },
];

const MODULES: ErpModule[] = [
  // Supply Chain & Warehouse
  {
    id: 'multi-warehouse',
    category: 'supply',
    title: 'Çok Depolu Stok Yönetimi',
    badge: 'Çoklu Depo',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    role: 'Depo & Lojistik Yöneticisi',
    desc: 'Merkez, şube ve fason depoları tek ekrandan yönetin. Minimum stok seviyeleri ve depolar arası transfer fişleri.',
    detail: 'Depolar arası transfer emirleri, raf/koridor lokasyon takibi, kritik stok eşiklerinde otomatik satın alma talebi tetikleme ve canlı stok konsolidasyonu.',
    highlights: ['Çok depolu transfer fişleri', 'Raf & koridor lokasyon takibi', 'Kritik stok erken alarmları'],
    mockData: {
      label1: 'Tuzla Merkez Depo',
      val1: '850 Adet Serbest',
      label2: 'Kadıköy Şube Depo',
      val2: '420 Adet Rezerve',
      label3: 'Ankara Dağıtım',
      val3: '310 Adet Sevkte',
      statusText: 'Depolar arası canlı senkronizasyon devrede',
    },
  },
  {
    id: 'lot-serial',
    category: 'supply',
    title: 'Parti / Lot & Seri No Takibi',
    badge: 'İzlenebilirlik',
    badgeColor: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    role: 'Kalite & Mal Kabul',
    desc: 'Hammadde girişinden son kullanıcıya kadar parti, lot ve seri numarası bazında geriye dönük tam izlenebilirlik.',
    detail: 'Son kullanma tarihi (SKT) uyarıları, karantina yönetimi, parti bazlı geri çağırma (recall) raporu ve seri no ile garanti doğrulaması.',
    highlights: ['SKT & garanti takibi', 'Karantina stok kilitleme', 'Tam geriye dönük iz'],
    mockData: {
      label1: 'Parti / Lot Kodu',
      val1: 'LOT-2026-HYD-04',
      label2: 'Son Kullanma Tarihi',
      val2: '12/2028 (Geçerli)',
      label3: 'Karantina Miktarı',
      val3: '0 Adet (Onaylı)',
      statusText: 'Barkod taramasıyla partiye anında erişim',
    },
  },
  {
    id: 'costing',
    category: 'supply',
    title: 'Stok Maliyetleme (FIFO/AOF)',
    badge: 'Maliyet Motoru',
    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    role: 'Maliyet Muhasebesi',
    desc: 'FIFO, LIFO ve Ağırlıklı Ortalama yöntemleriyle satılan malın maliyetini (SMM) anlık ve hatasız hesaplayın.',
    detail: 'Navlun, gümrük ve ek masrafları ürün maliyetine dağıtma (landed cost), fiili maliyet ile standart maliyet sapma analizi.',
    highlights: ['FIFO & Ağırlıklı Ortalama', 'Gümrük/navlun dağıtımı', 'SMM anlık hesaplama'],
    mockData: {
      label1: 'Maliyet Yöntemi',
      val1: 'FIFO (İlk Giren İlk Çıkar)',
      label2: 'Birim Net Maliyet',
      val2: '₺420,50 / Adet',
      label3: 'Navlun & Masraf Dağıtımı',
      val3: '+%8.5 Dahil Edildi',
      statusText: 'Satış faturasında anlık kâr marjı hesabı',
    },
  },
  {
    id: 'reservations',
    category: 'supply',
    title: 'Akıllı Stok Rezervasyonu',
    badge: 'Çift Satış Önleme',
    badgeColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    role: 'Satış Operasyon',
    desc: 'Gelen siparişlerde stoğu anında rezerve eder, fiziksel stok ile serbest kullanılabilir stoğu net biçimde ayırır.',
    detail: 'Süresi dolan rezervasyonları otomatik serbest bırakma, öncelikli müşteri kotası ve kısmi sipariş karşılama politikaları.',
    highlights: ['Serbest vs. Rezerve stok', 'Otomatik rezervasyon çözme', 'Sipariş önceliklendirme'],
    mockData: {
      label1: 'Toplam Fiziksel Stok',
      val1: '1.270 Adet',
      label2: 'Kilitli Rezervasyon',
      val2: '450 Adet (4 Sipariş)',
      label3: 'Satışa Hazır Serbest',
      val3: '820 Adet',
      statusText: 'Pazaryerleri serbest stok kadar satışa açılır',
    },
  },

  // Manufacturing & MRP
  {
    id: 'mrp-engine',
    category: 'manufacturing',
    title: 'Malzeme İhtiyaç Planlaması (MRP)',
    badge: 'MRP Motoru',
    badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    role: 'Üretim Planlama Şefi',
    desc: 'Siparişler ve satış tahminlerine göre hangi hammaddeden ne zaman, ne kadar temin edilmesi gerektiğini hesaplar.',
    detail: 'Tedarik süreleri (lead-time), emniyet stoğu ve açık siparişleri harmanlayarak satın alma talepleri ve iş emirleri önerir.',
    highlights: ['Net hammadde ihtiyacı', 'Tedarik süresi optimizasyonu', 'Otomatik satınalma önerisi'],
    mockData: {
      label1: 'Planlanan İş Emri',
      val1: '350 Adet Hidrolik Valf',
      label2: 'Eksik Hammadde',
      val2: '120 Adet Rulman',
      label3: 'Tedarik Önerisi',
      val3: 'Satınalma Emri Açıldı',
      statusText: 'Eksik parça yüzünden tezgâh duruşu yaşanmaz',
    },
  },
  {
    id: 'bom',
    category: 'manufacturing',
    title: 'Ürün Ağaçları (BOM) & Reçeteler',
    badge: 'Çok Kademeli',
    badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    role: 'Ürün Mühendisliği',
    desc: 'Çok seviyeli montaj/yarı-mamul reçeteleri, fire oranları, operasyon süreleri ve alternatif malzeme tanımları.',
    detail: 'Reçete revizyon geçmişi, fason işçilik kalemleri, mühendislik değişiklik emirleri (ECO) ve reçete maliyet simülasyonu.',
    highlights: ['Çok seviyeli montaj', 'Fire & hurda yönetimi', 'Reçete revizyon takibi'],
    mockData: {
      label1: 'Reçete Seviyesi',
      val1: '3 Kademeli Yarı-Mamul',
      label2: 'Öngörülen Fire',
      val2: '%2.4 Standart Fire',
      label3: 'Revizyon Kodu',
      val3: 'v2.1 (Onaylı)',
      statusText: 'Reçete değişikliği geçmiş emirleri etkilemez',
    },
  },
  {
    id: 'work-orders',
    category: 'manufacturing',
    title: 'İş Emirleri & İstasyon Kapasitesi',
    badge: 'Üretim Sahası',
    badgeColor: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    role: 'Fabrika Müdürü',
    desc: 'İş merkezlerinin kapasite yük dağılımı, rota operasyonları, duruş nedenleri ve OEE verimlilik takibi.',
    detail: 'Operatör bazlı iş başlatma/bitirme, makine arıza-bakım kayıtları, darboğaz istasyon tespiti ve fason üretim takibi.',
    highlights: ['İstasyon kapasite analizi', 'OEE & duruş takibi', 'Fason operasyon yönetimi'],
    mockData: {
      label1: 'Aktif İş Emri',
      val1: '12 İstasyon Devrede',
      label2: 'OEE Verimliliği',
      val2: '%94.2 (Hedef Üstü)',
      label3: 'Darboğaz Uyarısı',
      val3: 'CNC Torna İstasyonu',
      statusText: 'İş emri barkodla tezgâhta anlık başlatılır',
    },
  },
  {
    id: 'quality',
    category: 'manufacturing',
    title: 'Kalite Kontrol & Karantina',
    badge: 'Kalite Standartları',
    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    role: 'Kalite Güvence',
    desc: 'Mal kabul, proses içi ve final kalite kontrolleri. Tolerans dışı partileri otomatik karantinaya alma.',
    detail: 'Uygunsuzluk formları (NCR), tedarikçi kalite puanlama matrisi ve parti bazında kalite onay sertifikalandırma süreci.',
    highlights: ['Girdi/proses kontrolü', 'Tedarikçi kalite skoru', 'Otomatik karantina kilidi'],
    mockData: {
      label1: 'Giriş Kontrolü',
      val1: '150 Adet Parça Test Edildi',
      label2: 'Kabul Oranı',
      val2: '%99.3 Uygun',
      label3: 'NCR Uygunsuzluk',
      val3: '0 Açık Kayıt',
      statusText: 'Onay verilmeyen parti üretime verilemez',
    },
  },

  // Sales & Marketplaces
  {
    id: 'marketplaces',
    category: 'sales',
    title: '5 Pazaryeri Canlı Entegrasyonu',
    badge: 'Trendyol, HB, Amazon',
    badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    role: 'E-Ticaret Yöneticisi',
    desc: 'Trendyol, Hepsiburada, Amazon, N11 ve Çiçeksepeti ile çift yönlü stok, fiyat ve sipariş senkronizasyonu.',
    detail: 'Kuyruk korumalı garantili sipariş çekme, pazaryeri komisyon muhasebeleşmesi ve otomatik kargo barkodu.',
    highlights: ['Çift yönlü anlık sync', 'Komisyon takibi', 'Otomatik kargo fişi'],
    mockData: {
      label1: 'Bağlı Pazaryeri',
      val1: '5 Kanal Aktif',
      label2: 'Gelen Yeni Sipariş',
      val2: '29 Sipariş (Bugün)',
      label3: 'Stok Güncelleme',
      val3: 'Anlık Senkronize',
      statusText: 'Pazaryerinde satılan ürün depodan anında düşer',
    },
  },
  {
    id: 'sales-pipeline',
    category: 'sales',
    title: 'Tekliften Siparişe Satış Süreci',
    badge: 'Uçtan Uca Satış',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    role: 'Satış Direktörü',
    desc: 'Dinamik teklif hazırlama, müşteri kredi limiti kontrolü, iskonto onay hiyerarşisi ve tek tıkla sipariş dönüşümü.',
    detail: 'Müşteri bazlı özel fiyat listesi, dövizli teklifler ve teklif geçerlilik süresi takibi.',
    highlights: ['Müşteri risk analizi', 'Onay akış hiyerarşisi', 'Dövizli teklif yönetimi'],
    mockData: {
      label1: 'Hazırlanan Teklif',
      val1: 'TKL-2026-089 (₺340.000)',
      label2: 'Müşteri Risk Skoru',
      val2: 'A+ (Limit Uygun)',
      label3: 'Onay Durumu',
      val3: 'Müşteri Onayladı',
      statusText: 'Tek tıkla sipariş ve sevk emrine dönüşür',
    },
  },
  {
    id: 'procurement',
    category: 'sales',
    title: 'Satın Alma & Teklif Karşılaştırma',
    badge: 'Tedarik Yönetimi',
    badgeColor: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    role: 'Satınalma Sorumlusu',
    desc: 'Satın alma talepleri, teklif toplama (RFQ), tedarikçi fiyat karşılaştırma tablosu ve mal kabul entegrasyonu.',
    detail: 'Bütçe kontrol kuralları, tedarikçi teslimat performansı ve sipariş-irsaliye-fatura 3’lü eşleştirme (3-way match).',
    highlights: ['Tedarikçi teklif matrisi', '3-Way Match kontrolü', 'Bütçe onay mekanizması'],
    mockData: {
      label1: 'Gelen Tedarikçi Teklifi',
      val1: '3 Farklı Fiyat Alındı',
      label2: 'En Avantajlı Teklif',
      val2: 'Demir Çelik A.Ş. (₺120.000)',
      label3: '3-Way Match',
      val3: 'Doğrulandı',
      statusText: 'İrsaliye ve fatura tutarı birebir denetlenir',
    },
  },

  // Finance & GİB E-Transformation
  {
    id: 'e-invoicing',
    category: 'finance',
    title: 'GİB e-Fatura, e-Arşiv & e-İrsaliye',
    badge: 'GİB UBL-TR Tam Uyum',
    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    role: 'Mali Müşavir / Muhasebe',
    desc: 'Gelir İdaresi Başkanlığı standartlarında e-Fatura, e-Arşiv, e-İrsaliye gönderimi, alımı ve yasal saklama.',
    detail: 'Tevkifatlı faturalar, istisna kodları, iptal/itiraz yaşam döngüsü ve entegratör bağımsız esnek mimari.',
    highlights: ['UBL-TR 1.2.1 formatı', 'Tevkifat & istisna motoru', '8 günlük itiraz takibi'],
    mockData: {
      label1: 'Son Düzenlenen Belge',
      val1: 'GIB2026000004128',
      label2: 'GİB Zarf Durumu',
      val2: '1300 (Başarıyla İletildi)',
      label3: 'ETTN Kodu',
      val3: 'e8c4-9a21-419b',
      statusText: 'İrsaliyesi onaylanan sipariş tek tıkla faturalaşır',
    },
  },
  {
    id: 'general-ledger',
    category: 'finance',
    title: 'Tekdüzen Genel Muhasebe',
    badge: 'Otomatik Defter',
    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    role: 'Genel Muhasebe Şefi',
    desc: 'Fatura, irsaliye ve banka hareketlerinden otomatik yevmiye fişi üretimi. Mizan, bilanço ve gelir tablosu.',
    detail: 'Mali dönem kapatma, döviz kur farkı değerleme fişleri ve resmi yevmiye/kebir defter kayıtları.',
    highlights: ['Otomatik yevmiye fişi', 'Anlık mizan & bilanço', 'Döviz kur farkı motoru'],
    mockData: {
      label1: 'Yevmiye Fişi',
      val1: 'YVM-2026-904 (Dengeli)',
      label2: '102 Bankalar / 120 Alıcı',
      val2: '₺408.000 (Borç/Alacak)',
      label3: 'Mizan Durumu',
      val3: 'Kuruş Sapmasız Dengeli',
      statusText: 'Elle defter fişi yazma gereği tamamen kalkar',
    },
  },
  {
    id: 'bank-reconciliation',
    category: 'finance',
    title: 'Banka Ekstre Otomasyonu',
    badge: '%99 Güvenli Eşleşme',
    badgeColor: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
    role: 'Finans Müdürü',
    desc: 'Garanti BBVA, İş Bankası, Akbank ve diğer banka ekstrelerinin otomatik okunması ve açık faturalarla eşleştirilmesi.',
    detail: 'Havale, EFT, POS ve komisyon kesintilerinin kural tabanlı ayrıştırılması, cari bakiye kapatma ve tahsil fişi.',
    highlights: ['Çoklu banka ekstre okuma', 'Otomatik fatura eşleme', 'POS komisyon ayrıştırma'],
    mockData: {
      label1: 'Okunan Banka Ekstresi',
      val1: 'Garanti BBVA • Gelen Havale',
      label2: 'Eşleşen Cari & Fatura',
      val2: 'Atlas Endüstriyel (#4128)',
      label3: 'Kalan Cari Bakiye',
      val3: '₺0,00 (Fatura Kapandı)',
      statusText: 'Akşamları saatlerce ekstre arama zahmeti biter',
    },
  },

  // AI & Automation
  {
    id: 'today-workbench',
    category: 'ai',
    title: '"Bugün" Akıllı Operasyon Masası',
    badge: 'Otonom Asistan',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    role: 'Şirket Yöneticisi / CEO',
    desc: 'Sabah bakılan tek ekran: Geciken teslimatlar, finansal riskler, onay bekleyen talepler ve anomaliler.',
    detail: 'Görevleri parasal etki ve önceliğe göre sıralayan, tek tıkla aksiyon almayı sağlayan canlı iş kuyruğu.',
    highlights: ['Parasal etki sıralaması', 'Anomali & risk tespiti', 'Tek tıkla aksiyon alma'],
    mockData: {
      label1: 'Kritik Uyarılar',
      val1: '2 Geciken Sevkiyat Tespiti',
      label2: 'Onay Bekleyenler',
      val2: '1 Maker-Checker PO Onayı',
      label3: 'Finansal Fırsat',
      val3: 'Erken Ödeme İskonto Önerisi',
      statusText: 'Kullanıcının sabah açtığı ilk ve tek kontrol masası',
    },
  },
  {
    id: 'ocr-extraction',
    category: 'ai',
    title: 'OCR Belge & Fatura Çıkarıcı',
    badge: 'Otomatik Okuma',
    badgeColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    role: 'Operasyon & Muhasebe',
    desc: 'Sürükleyip bırakılan PDF veya fotoğraflardaki fatura, fiş ve siparişleri okuyarak doğrulanacak taslak oluşturur.',
    detail: 'Tedarikçi VKN, fatura no, matrah, KDV ve satır kalemlerini yüksek doğrulukla ayrıştırır, elle yazmaya son verir.',
    highlights: ['PDF/Fiş anlık tarama', 'Satır kalemi ayrıştırma', 'Güven skorlu taslak onay'],
    mockData: {
      label1: 'Taranan Doküman',
      val1: 'Tedarikçi Fatura PDF (12 Kalem)',
      label2: 'Ayrıştırılan Matrah & KDV',
      val2: '₺84.500 + %20 KDV',
      label3: 'Doğruluk Skoru',
      val3: '%99.2 Yüksek Güven',
      statusText: 'Kağıt faturayı elle sisteme girmeye son verir',
    },
  },

  // Governance & Security
  {
    id: 'maker-checker',
    category: 'governance',
    title: 'Maker-Checker Çift Kişi Onayı',
    badge: 'Kurumsal Güvence',
    badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    role: 'CFO / Genel Müdür',
    desc: 'Kritik finansal ve idari işlemlerde bir yöneticinin önerdiği değişikliği ikinci bir bağımsız yetkili onaylamadan uygulanmaz.',
    detail: 'Yüksek limitli satınalmalar, plan değişiklikleri ve sistem parametrelerinde kurumsal hata önleme kalkanı.',
    highlights: ['İki bağımsız yetkili mutabakatı', 'Hatalı harcama engelleme', 'Zorunlu denetim gerekçesi'],
    mockData: {
      label1: 'İşlem Türü',
      val1: 'Tedarikçi Limit Artışı (₺1.2M)',
      label2: 'Talep Eden (Maker)',
      val2: 'Ahmet Y. (Satınalma Md.)',
      label3: 'Onaylayan (Checker)',
      val3: 'Zeynep K. (Finans Direktörü)',
      statusText: 'Tek kişinin inisiyatifiyle şirket riske atılamaz',
    },
  },
  {
    id: 'rbac-security',
    category: 'governance',
    title: 'Granüler RBAC & MFA Güvenlik',
    badge: 'ISO 27001 & KVKK',
    badgeColor: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    role: 'Bilgi Güvenliği / IT',
    desc: 'Ekran ve aksiyon seviyesinde detaylı rol yönetimi, TOTP / WebAuthn iki aşamalı doğrulama (MFA) ve oturum kontrolü.',
    detail: 'Şubeler arası veri izolasyonu, süreli destek oturumları ve KVKK uyumlu işlem loglama.',
    highlights: ['Ekran & aksiyon yetkisi', 'TOTP / WebAuthn MFA', 'Şube veri izolasyonu'],
    mockData: {
      label1: 'Veritabanı İzolasyonu',
      val1: 'PostgreSQL Row-Level Security',
      label2: 'İki Aşamalı Güvenlik',
      val2: 'TOTP (Google Authenticator)',
      label3: 'Erişim Kısıtı',
      val3: 'Şube bazlı izole yetkilendirme',
      statusText: 'Şube personeli diğer şubenin finansal verisini göremez',
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
    <section id="features" className="py-20 lg:py-28 relative bg-[#0B1120] border-t border-slate-800 text-slate-100 overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/3 w-[600px] h-[600px] bg-blue-600/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="section-container relative z-10">
        
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10"
        >
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-400 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span>Modül & Yetenek Kataloğu</span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight mb-3">
              İhtiyacınız olan tüm modüller,<br />
              <span className="text-slate-400 font-normal">
                tek ve düzenli bir konsolda.
              </span>
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Kaybolmadan inceleyin. Departmanınızı seçin, ilgili modülün kurumsal yeteneklerini ve canlı çalışma biçimini tek bakışta keşfedin.
            </p>
          </div>

          <div className="text-xs text-slate-400 bg-slate-800/80 px-3.5 py-2 rounded-lg border border-slate-700/80 self-start lg:self-auto font-medium">
            Toplam <span className="text-white font-bold">{MODULES.length}</span> Modül Kullanıma Hazır
          </div>
        </motion.div>

        {/* Category Switcher Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-8 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/60'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Master-Detail Studio Layout (Zero Endless Scroll) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 sm:p-7 shadow-2xl backdrop-blur-xl">
          
          {/* Left Column: Module Directory List for the Selected Category */}
          <div className="lg:col-span-4 flex flex-col gap-2.5">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 px-1">
              Kategorideki Modüller ({categoryModules.length})
            </div>

            {categoryModules.map((m) => {
              const isSelected = m.id === activeModuleId;
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveModuleId(m.id)}
                  className={`p-4 rounded-xl text-left transition-all duration-200 cursor-pointer border flex flex-col justify-between ${
                    isSelected
                      ? 'bg-slate-800 border-blue-500/60 shadow-lg shadow-blue-500/10'
                      : 'bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
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
                  <h4 className={`text-xs sm:text-sm font-bold leading-tight ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                    {m.title}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                    {m.desc}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Right Column: Deep-Dive Interactive Showcase Panel */}
          <div className="lg:col-span-8 bg-slate-950/80 border border-slate-800 rounded-xl p-6 flex flex-col justify-between shadow-inner">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeModule.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22 }}
                className="space-y-6"
              >
                {/* Module Title & Role Tag */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                  <div>
                    <div className="flex items-center gap-2.5 mb-1.5">
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

                  <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 font-medium self-start sm:self-auto">
                    ✓ Aktif Modül
                  </span>
                </div>

                {/* Module Narrative & Detail */}
                <div className="space-y-2">
                  <p className="text-sm text-slate-200 leading-relaxed font-medium">
                    {activeModule.desc}
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {activeModule.detail}
                  </p>
                </div>

                {/* 3 Core Capability Highlights */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  {activeModule.highlights.map((h, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/80 flex items-center gap-2 text-xs text-slate-300"
                    >
                      <span className="text-emerald-400 font-bold">✓</span>
                      <span className="font-medium">{h}</span>
                    </div>
                  ))}
                </div>

                {/* Live Mock / Operational Snapshot Card */}
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300 pb-2 border-b border-slate-800">
                    <span>Modülün Canlı Çalışma Ekranından Örnek Veri:</span>
                    <span className="text-emerald-400 font-mono text-[10px]">● Canlı Bağlantı</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">{activeModule.mockData.label1}</span>
                      <span className="text-xs font-bold text-white font-mono mt-0.5 block">{activeModule.mockData.val1}</span>
                    </div>
                    <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">{activeModule.mockData.label2}</span>
                      <span className="text-xs font-bold text-white font-mono mt-0.5 block">{activeModule.mockData.val2}</span>
                    </div>
                    <div className="p-2 rounded bg-slate-950/80 border border-slate-800">
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

            {/* Bottom Connect Info */}
            <div className="pt-4 mt-4 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
              <span>Şirketinizin organizasyon şemasına ve yetki matrisine göre yapılandırılabilir.</span>
              <button
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('openChatWithMessage', {
                      detail: `${activeModule.title} modülü hakkında detaylı bilgi ve uyarlama desteği almak istiyorum.`,
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
