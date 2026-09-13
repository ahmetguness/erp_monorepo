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
    title: 'Teklif & Müşteri Koşulları',
    shortLabel: '1. Teklif',
    badge: 'Müşteri Koşulları',
    badgeColor: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    desc: 'Müşteri cari kartından gelen tanımlı iskonto ve vade kurallarıyla dakikalar içinde resmi teklif hazırlayın. Belirlenen iskonto sınırları aşıldığında yönetici onay akışı devreye girer.',
    automatedActions: [
      'Müşteri cari risk limiti ve açık vadeli bakiye anlık kontrol edilir',
      'Müşteriye tanımlı özel fiyat listesi ve geçmiş sipariş şartları uygulanır',
      'Yetki sınırını aşan iskonto oranlarında yönetici onayı talep edilir',
    ],
    docTitle: 'Fiyat Teklifi',
    docCode: 'TKL-2026-089 (Örnek Demo Verisi)',
    docTypeBadge: 'Satış Belgesi',
    docItems: [
      { label: 'Cari Kart', detail: 'Atlas Endüstriyel Makine A.Ş.', value: 'Müşteri' },
      { label: 'Ürün', detail: 'Endüstriyel Pompa Ünitesi', value: '350 Adet' },
      { label: 'Uygulanan İskonto', detail: 'Hacim İndirimi', value: '%10 İskonto' },
      { label: 'Net Tutar', detail: 'KDV Hariç Net Toplam', value: '₺340.000' },
    ],
    docStatus: { text: 'Teklif Onaylandı', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  },
  {
    id: 'order',
    stepNumber: '02',
    title: 'Satış Siparişi & Depo Rezervasyonu',
    shortLabel: '2. Sipariş & Stok',
    badge: 'Anlık Stok Rezervasyonu',
    badgeColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    desc: 'Kabul edilen teklif tek tıkla satış siparişine dönüşür. Sistem seçilen depodaki stoğu rezerve ederek çift satışı önler; eksik malzeme varsa üretim veya satın alma önerir.',
    automatedActions: [
      'Teklif kalemleri ve özel şartlar kopyalanmadan siparişe aktarılır',
      'Seçilen depodaki serbest stok sipariş için rezerve edilir',
      'Eksik parça veya kritik stok durumunda satınalma/üretim talebi açılır',
    ],
    docTitle: 'Satış Siparişi',
    docCode: 'SIP-2026-4820 (Örnek Demo Verisi)',
    docTypeBadge: 'Sipariş Fişi',
    docItems: [
      { label: 'Tahsis Deposu', detail: 'Tuzla Merkez Depo', value: '350 Adet Rezerve' },
      { label: 'Parti/Lot No', detail: 'LOT-2026-04', value: 'Geçerli Seri' },
      { label: 'Kalan Serbest Stok', detail: 'Diğer siparişlere açık miktar', value: '180 Adet' },
      { label: 'Sevk Durumu', detail: 'Toplama listesi hazırlandı', value: 'Hazırlıkta' },
    ],
    docStatus: { text: 'Stok Rezerve Edildi', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  },
  {
    id: 'production-procurement',
    stepNumber: '03',
    title: 'Üretim İş Emri veya Satın Alma',
    shortLabel: '3. Üretim / Tedarik',
    badge: 'Malzeme İhtiyacı',
    badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    desc: 'Stokta bulunmayan veya imalatı gereken ürünler için otomatik iş emri ve ürün reçetesi açılır; hammadde eksikse tedarikçiye satınalma emri oluşturulur.',
    automatedActions: [
      'Çok seviyeli ürün reçetesi (BOM) patlatılarak hammadde ihtiyacı listelenir',
      'Tezgâh ve istasyon kapasitesi doğrultusunda rota planı oluşturulur',
      'Tedarikçi teklifleri karşılaştırılarak onaylı satınalma siparişi açılır',
    ],
    docTitle: 'Üretim & Malzeme Talebi',
    docCode: 'URT-2026-102 (Örnek Demo Verisi)',
    docTypeBadge: 'Planlama',
    docItems: [
      { label: 'İş Emri Kodu', detail: 'İmalat İstasyonu #03', value: 'Aktif Hat' },
      { label: 'Reçete Adı', detail: 'Standart Montaj Reçetesi (v2)', value: '3 Kademe' },
      { label: 'Hammadde Durumu', detail: 'Depo stoklarından karşılandı', value: 'Tamamlandı' },
      { label: 'Fiili Maliyet', detail: 'Birim hammadde + operasyon', value: 'Hesaplandı' },
    ],
    docStatus: { text: 'İmalat Tamamlandı', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  },
  {
    id: 'delivery',
    stepNumber: '04',
    title: 'Sevkiyat & e-İrsaliye',
    shortLabel: '4. Sevkiyat',
    badge: 'e-İrsaliye Entegrasyonu',
    badgeColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    desc: 'Depo personeli barkod okuyucuyla ürünleri doğrular. Koli ve parti etiketleri basılır, Gelir İdaresi Başkanlığı sistemine resmi e-İrsaliye düzenlenir.',
    automatedActions: [
      'Çeki listesi doğrultusunda parti/lot barkod taraması yapılır',
      'Kısmi teslimatlarda sipariş bakiyesi otomatik izlenir',
      'Resmi e-İrsaliye araç yola çıkmadan önce dijital olarak onaylanır',
    ],
    docTitle: 'Resmi e-İrsaliye',
    docCode: 'IRS2026000000184 (Örnek Demo Verisi)',
    docTypeBadge: 'e-Belge',
    docItems: [
      { label: 'Belge Tipi', detail: 'UBL-TR e-İrsaliye', value: 'Resmi Format' },
      { label: 'Taşıyıcı', detail: 'Özmal / Anlaşmalı Kargo', value: '34 ARS 190' },
      { label: 'Paket Sayısı', detail: '12 Koli • Barkodlu', value: 'Brüt: 420 kg' },
      { label: 'Karekod', detail: 'Yol denetimi doğrulaması', value: 'Onaylandı' },
    ],
    docStatus: { text: 'e-İrsaliye İletildi', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  },
  {
    id: 'invoice-finance',
    stepNumber: '05',
    title: 'e-Fatura, Tahsilat & Yevmiye',
    shortLabel: '5. Fatura & Muhasebe',
    badge: 'Tekdüzen Muhasebe',
    badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    desc: 'İrsaliyesi onaylanan sipariş tek tıkla resmi e-Faturaya dönüşür. Satırlar birebir aktarılır, yevmiye fişi yazılır ve bankadan gelen havale faturayı otomatik kapatır.',
    automatedActions: [
      'İrsaliye bilgileri mükerrer yazım olmadan doğrudan faturaya aktarılır',
      'Tevkifat ve KDV oranları tanımlı parametrelere göre hesaplanır',
      'Muhasebe yevmiye kaydı oluşur, banka ekstresiyle cari bakiye kapatılır',
    ],
    docTitle: 'Ticari e-Fatura & Defter Kaydı',
    docCode: 'GIB2026000004128 (Örnek Demo Verisi)',
    docTypeBadge: 'Resmi Muhasebe',
    docItems: [
      { label: 'Net Matrah', detail: 'Ürün ve Hizmet Bedeli', value: '₺340.000,00' },
      { label: 'Hesaplanan KDV', detail: '%20 KDV Tutarı', value: '₺68.000,00' },
      { label: 'Genel Toplam', detail: 'Ödenecek Tutar', value: '₺408.000,00' },
      { label: 'Cari Kapanış', detail: 'Banka havalesi ile eşleşti', value: 'Bakiye: ₺0' },
    ],
    docStatus: { text: 'Fatura Kapandı • Muhasebeleşti', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  },
];

export default function WorkflowBlueprint() {
  const [activeStepId, setActiveStepId] = useState<string>('quote');
  const activeStep = STEPS.find((s) => s.id === activeStepId) || STEPS[0];

  return (
    <section id="workflow" className="py-20 lg:py-28 bg-[#080F1E] border-t border-slate-800 text-slate-100 overflow-hidden">
      <div className="section-container">
        
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="max-w-3xl mb-12"
        >
          <div className="section-label">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>UÇTAN UCA SÜREÇ AKIŞI</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight mb-4">
            Bir kez girin, tüm süreç boyunca kullanın.
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
            Axon ERP, departmanlar arasındaki kopuklukları ortadan kaldırır. Teklif onaylandığında sipariş oluşur, stok rezerve edilir, üretim planlanır, irsaliye ve fatura tek tıkla üretilir, yevmiye kaydı kendiliğinden yazılır.
          </p>
        </motion.div>

        {/* Connected Step Pipeline Buttons (Horizontal on desktop, vertical on mobile) */}
        <div className="mb-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 p-1.5 bg-[#0B1424] border border-slate-800 rounded-xl">
            {STEPS.map((step) => {
              const isActive = step.id === activeStepId;
              return (
                <button
                  key={step.id}
                  onClick={() => setActiveStepId(step.id)}
                  className={`relative p-3 rounded-lg text-left transition-all duration-150 cursor-pointer flex flex-col justify-between ${
                    isActive
                      ? 'bg-[#080F1E] border border-blue-500/50 shadow-md shadow-blue-500/10'
                      : 'hover:bg-[#080F1E]/60 border border-transparent text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] font-bold ${isActive ? 'text-blue-400' : 'text-slate-500'}`}>
                      Adım {step.stepNumber}
                    </span>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
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
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-[#0B1424] border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl"
          >
            {/* Left Box: Step Details and Actions */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-xs font-bold text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded border border-blue-500/20">
                    AŞAMA {activeStep.stepNumber}
                  </span>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded border ${activeStep.badgeColor}`}>
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
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>
                    Bir sonraki aşamaya geçerken tüm bilgiler otomatik aktarılır; mükerrer elle veri girişi gerekmez.
                  </span>
                </div>
              </div>
            </div>

            {/* Right Box: Demo Document Preview (Explicitly Designated as Demo Data) */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-[#080F1E] border border-slate-800 rounded-xl p-5 shadow-inner">
              <div>
                {/* Header of Document Preview */}
                <div className="flex items-center justify-between pb-3.5 border-b border-slate-800 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span className="text-xs font-bold text-white">
                      {activeStep.docTitle}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.08]">
                    Örnek Belge
                  </span>
                </div>

                <div className="text-[11px] font-mono text-slate-400 mb-3 block">
                  {activeStep.docCode}
                </div>

                {/* Document Item Rows */}
                <div className="space-y-2">
                  {activeStep.docItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-[#0B1424] rounded-lg border border-slate-800 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <span className="text-[10px] text-slate-400 block">{item.label}</span>
                        <span className="font-medium text-slate-200">{item.detail}</span>
                      </div>
                      {item.value && (
                        <span className="font-semibold text-white bg-slate-800/80 px-2 py-1 rounded text-right whitespace-nowrap">
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
                <span className="text-[11px] text-slate-500 font-mono">
                  Sistem Kaydı
                </span>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

      </div>
    </section>
  );
}
