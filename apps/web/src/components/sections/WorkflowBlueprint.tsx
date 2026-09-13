'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface WorkflowStep {
  id: string;
  stepNumber: string;
  title: string;
  shortLabel: string;
  badge: string;
  badgeColor: string;
  desc: string;
  automatedActions: string[];
  docTitle: string;
  docCode: string;
  docTypeBadge: string;
  docItems: { label: string; detail: string; value?: string }[];
  docStatus: { text: string; color: string };
}

const STEPS: WorkflowStep[] = [
  {
    id: 'quote',
    stepNumber: '01',
    title: 'Teklif & CRM Yönetimi',
    shortLabel: '1. Teklif & CRM',
    badge: 'Müşteri Skoru & Onay',
    badgeColor: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    desc: 'Müşteri cari kartından gelen dinamik iskonto ve vade kurallarıyla dakikalar içinde teklif hazırlayın. Kredi limitini aşan tekliflerde yönetici onay akışı anında devreye girer.',
    automatedActions: [
      'Cari hesap risk limiti ve açık vadeli bakiye anlık sorgulanır',
      'Müşteriye özel fiyat listesi ve geçmiş sipariş eğilimleri yüklenir',
      'Yüksek iskontolarda (%15+) otomatik yönetici onay akışı başlar',
    ],
    docTitle: 'Fiyat Teklifi',
    docCode: 'TKL-2026-089',
    docTypeBadge: 'CRM Belgesi',
    docItems: [
      { label: 'Müşteri', detail: 'Atlas Endüstriyel Makine A.Ş.', value: 'VKN: 0920482910' },
      { label: 'Ürün', detail: 'Endüstriyel Hidrolik Pompa (X-400)', value: '350 Adet' },
      { label: 'Özel İskonto', detail: 'Yıllık Hacim İndirimi (%12)', value: '-₺40.800' },
      { label: 'Net Tutar', detail: 'KDV Hariç Net Toplam', value: '₺340.000' },
    ],
    docStatus: { text: 'Müşteri Tarafından Onaylandı', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  },
  {
    id: 'order',
    stepNumber: '02',
    title: 'Satış Siparişi & Stok Rezervasyonu',
    shortLabel: '2. Sipariş & Stok',
    badge: 'Anlık Stok Kilidi',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    desc: 'Kabul edilen teklif tek tıkla satış siparişine dönüşür. Sistem seçilen depolardaki mevcut stoğu anında kilitler; eksik hammadde varsa MRP üretim planı önerir.',
    automatedActions: [
      'Teklif kalemleri ve özel koşulları kopyalanmadan siparişe bağlanır',
      'FIFO ve parti/lot kurallarıyla en uygun depo stokları siparişe tahsis edilir',
      'Kritik stok seviyesine inen ürünler için otomatik satınalma önerisi oluşur',
    ],
    docTitle: 'Satış Siparişi & Tahsis',
    docCode: 'SIP-2026-4820',
    docTypeBadge: 'Sipariş Fişi',
    docItems: [
      { label: 'Tahsis Deposu', detail: 'Tuzla Merkez Depo (Koridor A-04)', value: '350 Adet Rezerve' },
      { label: 'Parti/Lot No', detail: 'LOT-2026-HYD-04', value: 'SKT: 12/2028' },
      { label: 'Kalan Serbest Stok', detail: 'Tüm depolar toplam serbest miktar', value: '180 Adet' },
      { label: 'Kargo Termini', detail: 'Yarın Saat 14:00 Sevk Planı', value: 'Öncelikli' },
    ],
    docStatus: { text: 'Stok Rezerve Edildi • Sevk Bekliyor', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  },
  {
    id: 'delivery',
    stepNumber: '03',
    title: 'Sevkiyat & GİB e-İrsaliye',
    shortLabel: '3. Sevkiyat & İrsaliye',
    badge: 'UBL-TR e-İrsaliye',
    badgeColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    desc: 'Depo personeli barkod okuyucuyla ürünleri doğrular. Koli ve parti etiketleri basılır, Gelir İdaresi Başkanlığı (GİB) sistemine yasal e-İrsaliye saniyeler içinde iletilir.',
    automatedActions: [
      'El terminali ile çeki listesi (picking list) parti/lot barkod doğrulaması',
      'Kısmi teslimatlarda sipariş bakiye takibi (kalan miktar korunur)',
      'GİB UBL-TR e-İrsaliye XML oluşturma, mali mühür imzalama ve zarflama',
    ],
    docTitle: 'Resmi e-İrsaliye',
    docCode: 'IRS2026000000184',
    docTypeBadge: 'GİB Belgesi',
    docItems: [
      { label: 'GİB Zarf Kodu', value: 'Durum 1300', detail: 'Gelir İdaresi Başkanlığı İletildi' },
      { label: 'Taşıyıcı Bilgisi', detail: '34 ARS 190 / Aras Kargo Lojistik', value: 'Soför: Kemal Demir' },
      { label: 'Paket & Ambalaj', detail: '12 Koli • Güvenlik Mühürlü', value: 'Brüt: 420 kg' },
      { label: 'Karekod (QR)', detail: 'Yol denetimi için dijital doğrulama', value: 'Doğrulandı' },
    ],
    docStatus: { text: 'GİB İletildi • Yolda', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  },
  {
    id: 'invoice',
    stepNumber: '04',
    title: 'GİB e-Fatura Dönüşümü',
    shortLabel: '4. e-Fatura',
    badge: 'Sıfır Veri Tekrarı',
    badgeColor: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    desc: 'İrsaliyesi onaylanan sipariş tek tıkla resmi e-Faturaya dönüşür. Satır bilgileri, KDV tevkifatları ve istisna maddeleri birebir aktarılır, elle yazım hatası önlenir.',
    automatedActions: [
      'GİB e-Fatura / e-Arşiv ayrımı müşteri VKN sorgusu ile otomatik yapılır',
      'Tevkifat, istisna ve stopaj kodları mevzuat maddesine göre bağlanır',
      'İptal ve itiraz süreleri (8 gün) yasal takvimde otomatik izlenir',
    ],
    docTitle: 'UBL-TR Ticari e-Fatura',
    docCode: 'GIB2026000004128',
    docTypeBadge: 'Resmi Fatura',
    docItems: [
      { label: 'Matrah', detail: 'Ürün ve Hizmet Bedeli', value: '₺340.000,00' },
      { label: 'KDV Tutarı (%20)', detail: '391 Hesaplanan KDV', value: '₺68.000,00' },
      { label: 'Ödenecek Tutar', detail: 'Vergiler Dahil Genel Toplam', value: '₺408.000,00' },
      { label: 'ETTN Belge No', detail: 'e8c4-9a21-419b-88df-28d', value: 'İmzalandı' },
    ],
    docStatus: { text: 'GİB Onaylı • Müşteriye Gönderildi', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  },
  {
    id: 'finance',
    stepNumber: '05',
    title: 'Tahsilat, Banka Eşleme & Yevmiye',
    shortLabel: '5. Banka & Muhasebe',
    badge: 'Otomatik Defter Kaydı',
    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    desc: 'Kesilen fatura tekdüzen hesap planına anında işlenir. Banka ekstre API’sinden gelen havaleler fatura ile akıllı eşleşerek cari bakiyeyi tek tıkla kapatır.',
    automatedActions: [
      'Yevmiye fişi: 120 Alıcılar (Borç) / 600 Satışlar & 391 KDV (Alacak) otomatik oluşur',
      'Banka ekstre API’sinden gelen havale %99 güven skoruyla faturayı kapatır',
      'Cari hesap ekstresine, yaşlandırma raporuna ve BA/BS formuna anında işlenir',
    ],
    docTitle: 'Yevmiye Fişi & Mahsup',
    docCode: 'YVM-2026-904',
    docTypeBadge: 'Muhasebe Kaydı',
    docItems: [
      { label: '102.01 Bankalar', detail: 'Garanti BBVA Ticari Hesap (Borç)', value: '₺408.000,00' },
      { label: '120.01 Alıcılar', detail: 'Atlas Endüstriyel Cari Mahsubu (Alacak)', value: '₺408.000,00' },
      { label: 'Bakiye Durumu', detail: 'Fatura Kapatıldı • Açık Bakiye', value: '₺0,00' },
      { label: 'BA/BS Mutabakatı', detail: 'Ay Sonu Bildirimine Hazır', value: 'Uyumlu' },
    ],
    docStatus: { text: 'Tahsilat Tamamlandı • Bakiye Kapandı', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  },
];

export default function WorkflowBlueprint() {
  const [activeStepId, setActiveStepId] = useState<string>('quote');
  const activeStep = STEPS.find((s) => s.id === activeStepId) || STEPS[0];

  return (
    <section id="workflow" className="py-20 lg:py-28 relative bg-[#0F172A] border-t border-slate-800 text-slate-100 overflow-hidden">
      <div className="section-container relative z-10">
        
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="max-w-3xl mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] text-xs font-mono text-slate-400 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>SÜREÇ ENTEGRASYONU</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-[-0.02em] leading-tight mb-4">
            Hiçbir veriyi iki kez yazmayın.<br />
            <span className="text-slate-400 font-normal">
              Tekliften muhasebe fişine tek bir kurumsal akış.
            </span>
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
            Axon ERP, departmanlar arasındaki kopuklukları ortadan kaldırır. Teklif onaylandığında sipariş oluşur, stok kilitlenir, resmi irsaliye ve e-fatura tek tıkla üretilir, yevmiye fişi kendiliğinden yazılır.
          </p>
        </motion.div>

        {/* Step Selector Buttons */}
        <div className="mb-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 p-1.5 bg-slate-900/80 border border-slate-800 rounded-xl">
            {STEPS.map((step) => {
              const isActive = step.id === activeStepId;
              return (
                <button
                  key={step.id}
                  onClick={() => setActiveStepId(step.id)}
                  className={`relative p-3 rounded-lg text-left transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                    isActive
                      ? 'bg-slate-800 border border-blue-500/50 shadow-md shadow-blue-500/10'
                      : 'hover:bg-slate-800/60 border border-transparent text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold ${isActive ? 'text-blue-400' : 'text-slate-500'}`}>
                      Adım {step.stepNumber}
                    </span>
                    {isActive && (
                      <span className="w-2 h-2 rounded-full bg-blue-400" />
                    )}
                  </div>
                  <div className={`text-xs font-semibold ${isActive ? 'text-white' : 'text-slate-300'}`}>
                    {step.shortLabel}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Step Deep-Dive Showcase */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeStep.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-900/70 border border-slate-800 rounded-2xl p-6 sm:p-8 backdrop-blur-sm shadow-xl"
          >
            {/* Left Box: Step Details and Automated Actions */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded border border-blue-500/20">
                    AŞAMA {activeStep.stepNumber}
                  </span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded border ${activeStep.badgeColor}`}>
                    {activeStep.badge}
                  </span>
                </div>

                <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">
                  {activeStep.title}
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {activeStep.desc}
                </p>
              </div>

              {/* Automated Actions List */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-slate-400">
                  Otomatik Yürütülen Sistem Adımları:
                </div>
                {activeStep.automatedActions.map((action, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-200">
                    <div className="w-4 h-4 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span>{action}</span>
                  </div>
                ))}
              </div>

              {/* Seamless Data Transfer Callout */}
              <div className="pt-4 border-t border-slate-800">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    Bir sonraki aşamaya geçerken tüm bilgiler otomatik taşınır, elle veri girişi ihtiyacı kalmaz.
                  </span>
                </div>
              </div>
            </div>

            {/* Right Box: Living Interactive Document Preview Card */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-slate-950/90 border border-slate-800 rounded-xl p-5 shadow-inner">
              <div>
                {/* Header of Document Preview */}
                <div className="flex items-center justify-between pb-3.5 border-b border-slate-800 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span className="text-xs font-bold text-white">
                      {activeStep.docTitle}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    {activeStep.docCode}
                  </span>
                </div>

                {/* Document Item Rows */}
                <div className="space-y-2.5">
                  {activeStep.docItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-slate-900/90 rounded-lg border border-slate-800/80 flex items-center justify-between gap-3"
                    >
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-slate-400 block">{item.label}</span>
                        <span className="text-xs font-medium text-slate-200">{item.detail}</span>
                      </div>
                      {item.value && (
                        <span className="text-xs font-semibold text-white bg-slate-800 px-2 py-1 rounded text-right whitespace-nowrap">
                          {item.value}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Document Status Bottom Pill */}
              <div className="pt-4 mt-4 border-t border-slate-800 flex items-center justify-between">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${activeStep.docStatus.color}`}>
                  ✓ {activeStep.docStatus.text}
                </span>
                <span className="text-[11px] text-slate-500">
                  Doğrulandı
                </span>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

      </div>
    </section>
  );
}
