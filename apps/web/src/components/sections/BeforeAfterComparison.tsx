'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Scenario {
  id: string;
  label: string;
  dept: string;
  before: {
    title: string;
    chatLog: { from: string; text: string; time: string }[];
    painPoints: string[];
    consequence: string;
  };
  after: {
    title: string;
    actionLog: { step: string; detail: string; status: string }[];
    benefits: string[];
    gain: string;
  };
}

const SCENARIOS: Scenario[] = [
  {
    id: 'sales',
    label: '1. Satış & Sipariş',
    dept: 'Satış ve Müşteri İlişkileri',
    before: {
      title: 'WhatsApp mesajları, dağınık listeler ve belirsiz stok',
      chatLog: [
        { from: 'Satış', text: 'Depoda bu vanadan 350 adet var mı acil teklif geçmem lazım?', time: '11:04' },
        { from: 'Depo', text: 'Raflara bi bakayım, akşama doğru net söylerim.', time: '12:15' },
        { from: 'Müşteri', text: 'Teklifi onayladık ama ürün gelmedi, ne zaman sevk edilecek?', time: '16:40' },
      ],
      painPoints: [
        'Depo yanıtı beklenirken müşteri telefonda bekletilir',
        'Stok aynı anda iki müşteriye teklif edilerek çift satış riski doğar',
        'Müşteri özel iskontoları ve vadeleri kişilerin hafızasındadır',
      ],
      consequence: 'Sonuç: Müşteri memnuniyetsizliği, geciken teklifler ve satış kaybı.',
    },
    after: {
      title: 'Teklif onaylandığı an depodan rezerve edilen kesin stok',
      actionLog: [
        { step: '11:04 • Teklif Hazırlandı', detail: 'Müşteri cari koşulları ve tanımlı iskonto otomatik uygulandı', status: 'Onaylandı' },
        { step: '11:05 • Dijital Onay', detail: 'Tuzla depodan 350 adet anında rezerve edildi, çift satış engellendi', status: 'Kilitlendi' },
        { step: '11:06 • Sevk Emri Çıktı', detail: 'Depo personeline otomatik hazırlama ve toplama görevi düştü', status: 'Hazırlıkta' },
      ],
      benefits: [
        'Serbest ve rezerve stok ayrımı sayesinde çift satış riski kalkar',
        'Müşteriye özel fiyat ve iskonto kuralları sistemsel korunur',
        'Kabul edilen teklif tek tıkla resmi sipariş ve sevk fişine dönüşür',
      ],
      gain: 'Kazanım: Dakikalar içinde tamamlanan profesyonel ve güvenilir satış akışı.',
    },
  },
  {
    id: 'warehouse',
    label: '2. Depo & Sevkiyat',
    dept: 'Lojistik ve Mal Kabul',
    before: {
      title: 'Kağıt fişler, el yazısı notlar ve geciken irsaliyeler',
      chatLog: [
        { from: 'Şoför', text: 'Aracı yükledik ama irsaliye kağıdı muhasebeden henüz çıkmadı.', time: '14:20' },
        { from: 'Muhasebe', text: 'Hangi partiden kaç koli yüklendi fişi bulamadım, yeniden kontrol edin.', time: '15:10' },
        { from: 'Sevkiyat', text: 'Karekodlu resmi irsaliye yetişmedi, araç kapıda bekliyor.', time: '16:00' },
      ],
      painPoints: [
        'Hatalı parti/lot veya yanlış ürün yükleme riski yüksektir',
        'Hangi rafta ne kadar mal kaldığı sadece sayım günlerinde netleşir',
        'Kağıt sevk fişleri muhasebeye günler sonra ulaşır',
      ],
      consequence: 'Sonuç: Hatalı sevkiyatlar, zaman kayıpları ve ek lojistik maliyetleri.',
    },
    after: {
      title: 'Barkod doğrulama ve anlık e-İrsaliye düzenleme',
      actionLog: [
        { step: '14:20 • Barkod Doğrulandı', detail: 'Ürün partisi okutuldu, siparişle eşleştiği doğrulandı', status: 'Doğrulandı' },
        { step: '14:21 • Koli Etiketi Basıldı', detail: 'Sevkiyat için çeki listesi ve koli bilgileri hazırlandı', status: 'Basıldı' },
        { step: '14:22 • e-İrsaliye İletildi', detail: 'Resmi e-İrsaliye Gelir İdaresi standartlarında düzenlendi', status: 'Hazır' },
      ],
      benefits: [
        'Barkodlu çeki listesi ile doğru ürün toplama ve kontrol',
        'Resmi e-İrsaliye araç yola çıkmadan dijital olarak onaylanır',
        'Parti, lot ve son kullanma tarihleri geriye dönük izlenebilir',
      ],
      gain: 'Kazanım: Hatalı sevkiyatlar engellenir, araçlar beklemeden yola çıkar.',
    },
  },
  {
    id: 'mrp',
    label: '3. Üretim & Reçete',
    dept: 'Fabrika ve Üretim Planlama',
    before: {
      title: 'Eksik hammadde yüzünden duran işler ve belirsiz maliyet',
      chatLog: [
        { from: 'Üretim', text: 'İş tezgâha alındı ama bağlantı parçası bitmiş, hat durdu.', time: '09:30' },
        { from: 'Satınalma', text: 'Parçanın bittiğinden haberimiz yoktu, sipariş geçsek temini zaman alır.', time: '10:15' },
        { from: 'Yönetim', text: 'Bu siparişte kâr mı ettik zarar mı net göremiyoruz.', time: '11:00' },
      ],
      painPoints: [
        'Ürün reçeteleri kişilerin aklındadır, revizyonlar kayıt altına alınamaz',
        'Fiili maliyet tam bilinmez, ürün kârlılığı tahminle yürütülür',
        'Eksik hammadde son anda fark edilerek teslimatlar aksar',
      ],
      consequence: 'Sonuç: Üretim duruşları, kaçan teslim tarihleri ve belirsiz kâr marjı.',
    },
    after: {
      title: 'Çok seviyeli ürün reçeteleri ve planlı malzeme ihtiyacı',
      actionLog: [
        { step: 'İş Emri Açıldı', detail: 'Sipariş için tanımlı ürün reçetesi otomatik patlatıldı', status: 'Planlandı' },
        { step: 'Eksik Kontrolü', detail: 'Kritik stok seviyesindeki malzeme için satınalma talebi önerildi', status: 'Talep Açıldı' },
        { step: 'Maliyet Çıkarıldı', detail: 'Fiili hammadde ve işçilikle gerçek üretim maliyeti oluştu', status: 'Hesaplandı' },
      ],
      benefits: [
        'Çok aşamalı montaj reçeteleri, fire oranları ve rota süreleri net',
        'Tezgâh ve istasyon kapasiteleri izlenerek darboğazlar öngörülür',
        'Hammadde ve operasyon giderleriyle gerçek ürün kârlılığı ölçülür',
      ],
      gain: 'Kazanım: Planlı hammadde tedariği, zamanında üretim ve net kâr hesabı.',
    },
  },
  {
    id: 'finance',
    label: '4. Fatura & Banka',
    dept: 'Finans ve Muhasebe',
    before: {
      title: 'Elle yazılan faturalar ve uyuşmayan banka ekstreleri',
      chatLog: [
        { from: 'Muhasebe', text: 'İrsaliyedeki tutarla faturadaki KDV tutmadı, müşteri faturayı reddetti.', time: '16:00' },
        { from: 'Finans', text: 'Bankaya ödeme gelmiş ama açıklama olmadığı için hangi carinin çözemedik.', time: '17:30' },
        { from: 'Yönetim', text: 'Haftalık nakit durumumuz ve vadesi gelen alacaklar ne durumda?', time: '18:15' },
      ],
      painPoints: [
        'İrsaliye elle faturaya aktarılırken matrah veya tevkifat hatası yapılır',
        'Havale açıklaması eksik olduğunda açık cariler günlerce kapanmaz',
        'Ay sonunda mizan ve mutabakat süreçleri yoğun mesai gerektirir',
      ],
      consequence: 'Sonuç: Mükerrer yazımlar, ceza riskleri ve geciken finansal tablolar.',
    },
    after: {
      title: 'Tek tıkla e-Fatura dönüşümü ve otomatik banka eşleşmesi',
      actionLog: [
        { step: 'e-Fatura Dönüşümü', detail: 'İrsaliye satırları hatasız biçimde resmi faturaya dönüştü', status: 'Onaylandı' },
        { step: 'Banka Ekstre Eşleşti', detail: 'Gelen havale fatura tutarıyla eşleşerek cari bakiyeyi kapattı', status: 'Eşleşti' },
        { step: 'Deftere İşlendi', detail: 'Yevmiye kaydı sistem tarafından otomatik oluşturuldu', status: 'Kaydedildi' },
      ],
      benefits: [
        'İrsaliyeden faturaya sıfır veri tekrarı, hatasız belge üretimi',
        'Gelen havaleler açık faturalarla eşleşerek cariyi anında kapatır',
        'Mizan, bilanço ve nakit akışı tabloları anlık olarak güncellenir',
      ],
      gain: 'Kazanım: Hızlı ay sonu kapanışları, hatasız cari hesaplar ve şeffaf nakit yönetimi.',
    },
  },
];

export default function BeforeAfterComparison() {
  const [activeScenarioId, setActiveScenarioId] = useState<string>('sales');
  const active = SCENARIOS.find((s) => s.id === activeScenarioId) || SCENARIOS[0];

  return (
    <section className="py-20 lg:py-28 bg-[#0B1424] border-t border-slate-800 text-slate-100 overflow-hidden">
      <div className="section-container">
        
        {/* Section Header */}
        <div className="max-w-3xl mb-12">
          <div className="section-label">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>OPERASYONEL KARŞILAŞTIRMA</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight mb-4">
            Eski usul karmaşa mı, <span className="text-slate-400 font-normal">yoksa tıkır tıkır işleyen bir operasyon mu?</span>
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
            Bir işletmeyi yavaşlatan şey çalışanlar değil; birbiriyle konuşmayan Excel dosyaları, WhatsApp yazışmaları ve kopuk programlardır.
          </p>
        </div>

        {/* Scenario Selector Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-8">
          <div className="inline-flex p-1 bg-[#080F1E] border border-slate-800 rounded-xl">
            {SCENARIOS.map((sc) => {
              const isActive = sc.id === activeScenarioId;
              return (
                <button
                  key={sc.id}
                  onClick={() => setActiveScenarioId(sc.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  {sc.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Side-by-Side Comparison Container */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* Left Box: Eski Yöntem (Kopuk Düzen) */}
            <div className="p-6 sm:p-7 rounded-2xl bg-[#080F1E] border border-rose-900/30 flex flex-col justify-between shadow-xl">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-rose-900/20">
                  <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5 font-mono">
                    <span>✕</span> ESKİ YÖNTEM & KOPUK DÜZEN
                  </span>
                  <span className="text-[11px] text-slate-400">{active.dept}</span>
                </div>

                <h3 className="text-base font-bold text-white leading-snug">
                  {active.before.title}
                </h3>

                {/* Simulated Communication Trail */}
                <div className="space-y-2 p-3.5 rounded-xl bg-[#060B15] border border-rose-950/50 text-xs">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
                    Örnek İletişim Trafiği:
                  </span>
                  {active.before.chatLog.map((msg, i) => (
                    <div key={i} className="p-2 rounded bg-white/[0.02] border border-white/[0.04] flex items-start justify-between gap-3">
                      <div>
                        <span className="font-semibold text-rose-300 block text-[11px]">{msg.from}:</span>
                        <span className="text-slate-300 text-[11px]">{msg.text}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400 flex-shrink-0">{msg.time}</span>
                    </div>
                  ))}
                </div>

                {/* Pain Points */}
                <div className="space-y-1.5 pt-1">
                  {active.before.painPoints.map((point, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-400">
                      <span className="text-rose-500 font-bold">•</span>
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 mt-5 border-t border-rose-900/20 text-xs font-semibold text-rose-400">
                {active.before.consequence}
              </div>
            </div>

            {/* Right Box: Axon ERP İle (Entegre Düzen) */}
            <div className="p-6 sm:p-7 rounded-2xl bg-[#080F1E] border border-blue-500/30 flex flex-col justify-between shadow-xl">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-blue-500/20">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 font-mono">
                    <span>✓</span> AXON ERP İLE DİJİTAL SİSTEM
                  </span>
                  <span className="text-[11px] text-blue-300 font-medium">Tek Veri Kaynağı</span>
                </div>

                <h3 className="text-base font-bold text-white leading-snug">
                  {active.after.title}
                </h3>

                {/* Simulated Pipeline Steps */}
                <div className="space-y-2 p-3.5 rounded-xl bg-[#060B15] border border-blue-950/40 text-xs">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
                    Sistemik İşlem Kaydı:
                  </span>
                  {active.after.actionLog.map((log, i) => (
                    <div key={i} className="p-2 rounded bg-blue-950/20 border border-blue-500/20 flex items-center justify-between gap-3">
                      <div>
                        <span className="font-semibold text-blue-300 block text-[11px]">{log.step}</span>
                        <span className="text-slate-300 text-[11px]">{log.detail}</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex-shrink-0">
                        {log.status}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Benefits */}
                <div className="space-y-1.5 pt-1">
                  {active.after.benefits.map((point, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="text-emerald-400 font-bold">✓</span>
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 mt-5 border-t border-blue-500/20 text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                <span>✓</span>
                <span>{active.after.gain}</span>
              </div>
            </div>

          </motion.div>
        </AnimatePresence>

      </div>
    </section>
  );
}
