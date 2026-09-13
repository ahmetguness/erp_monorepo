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
      title: 'WhatsApp mesajları, Excel listeleri ve belirsiz stok',
      chatLog: [
        { from: 'Satış (Ahmet)', text: 'Abi depoda bu vanadan 350 tane var mı acil teklif geçmem lazım?', time: '11:04' },
        { from: 'Depo (Mehmet)', text: 'Raflara bi bakayım abi var galiba akşama doğru net söylerim.', time: '12:15' },
        { from: 'Müşteri (Atlas Makine)', text: 'Teklifi onayladık ama ürün gelmedi, başka yerden mi alalım?', time: '16:40' },
      ],
      painPoints: [
        'Depocunun WhatsApp yanıtı beklenirken müşteri telefonda bekletilir',
        'Stok aynı anda iki müşteriye satılır (çift satış krizi çıkar)',
        'Müşteri özel iskontoları ve vadeleri kişilerin hafızasındadır',
      ],
      consequence: 'Sonuç: Müşteri güveni sarsılır, iptal edilen siparişler ve ciro kaybı.',
    },
    after: {
      title: 'Teklif onaylandığı an depodan kilitlenen kesin stok',
      actionLog: [
        { step: '11:04 • Teklif Hazırlandı', detail: 'Müşteri özel iskonto (%12) ve 45 gün vade otomatik bağlandı', status: 'Doğrulandı' },
        { step: '11:05 • Dijital Onay Alındı', detail: 'Tuzla depodan 300 ad., Kadıköy depodan 50 ad. anında rezerve edildi', status: 'Kilitlendi' },
        { step: '11:06 • Sevk Emri Çıktı', detail: 'Çift satış engellendi, depo el terminaline çeki listesi iletildi', status: 'Aktif' },
      ],
      benefits: [
        'Serbest ve kilitli stok ayrımı sayesinde çift satış riski %0',
        'Cari risk limiti aşıldığında yöneticiye anlık onay düşer',
        'Kabul edilen teklif tek tıkla resmi sipariş ve sevk fişine dönüşür',
      ],
      gain: 'Kazanım: Sıfır sipariş iptali ve dakikalar içinde tamamlanan profesyonel satış.',
    },
  },
  {
    id: 'warehouse',
    label: '2. Depo & Sevkiyat',
    dept: 'Lojistik ve Mal Kabul',
    before: {
      title: 'Kağıt fişler, el yazısıyla koli üstü notlar ve geciken irsaliyeler',
      chatLog: [
        { from: 'Şoför (Kemal)', text: 'Kamyonu yükledik ama irsaliye kağıdı muhasebede çıkmamış bekliyorum.', time: '14:20' },
        { from: 'Muhasebe (Banu)', text: 'Hangi partiden kaç koli yüklendi fişi bulamadım, yeniden sayın.', time: '15:10' },
        { from: 'Yol Denetimi', text: 'Resmi e-İrsaliye GİB sistemine zamanında iletilmemiş, ceza riski.', time: '16:30' },
      ],
      painPoints: [
        'Yanlış parti/lot veya yanlış ürün yükleme riski çok yüksektir',
        'Hangi rafta ne kadar sağlam mal kaldığı sadece sayım günü anlaşılır',
        'Kamyon kapıdan çıktıktan sonra kağıt fiş muhasebeye 3 gün sonra ulaşır',
      ],
      consequence: 'Sonuç: Hatalı sevkiyatlar, yol denetimi cezaları ve müşteri iade maliyeti.',
    },
    after: {
      title: 'El terminaliyle barkod tarama ve anlık GİB e-İrsaliye',
      actionLog: [
        { step: '14:20 • Barkod Doğrulandı', detail: 'LOT-2026-HYD partisi el terminaliyle okutuldu, yanlış ürün engellendi', status: 'Doğrulandı' },
        { step: '14:21 • Koli Etiketi Basıldı', detail: '12 Koli için ağırlık ve karekod içeren sevk etiketleri basıldı', status: 'Basıldı' },
        { step: '14:22 • GİB İletildi', detail: 'Plaka 34 ARS 190 ile UBL-TR e-İrsaliye resmi mühürle imzalandı', status: 'GİB 1300' },
      ],
      benefits: [
        'Barkodlu çeki listesi (picking list) ile %100 doğru ürün toplama',
        'Karekodlu resmi GİB e-İrsaliye şoför kapıdan çıkmadan onaylanır',
        'Parti, lot ve son kullanma tarihi (SKT) geriye dönük tam izlenir',
      ],
      gain: 'Kazanım: Hatalı sevkiyatlar sıfırlanır, kamyonlar beklemeden yola çıkar.',
    },
  },
  {
    id: 'mrp',
    label: '3. Üretim & Reçete',
    dept: 'Fabrika ve Üretim Planlama',
    before: {
      title: 'Eksik hammadde yüzünden duran tezgâhlar ve tahminî maliyet',
      chatLog: [
        { from: 'Usta (Ali)', text: 'Pompa gövdesi tezgâha bağlandı ama rulman kalmamış hat durdu.', time: '09:30' },
        { from: 'Satınalma (Cem)', text: 'Bize kimse rulmanın bittiğini söylemedi, sipariş geçsek 10 güne gelir.', time: '10:15' },
        { from: 'Müşteri', text: 'Termin süresi 2 hafta gecikti, gecikme cezasını keseceğiz.', time: '11:00' },
      ],
      painPoints: [
        'Reçeteler ustaların aklındadır, revizyon geçmişi tutulamaz',
        'Fiili maliyet bilinmez, ürünün kâr mı zarar mı getirdiği tahmin edilir',
        'Hammadde son dakikaya kaldığı için piyasadan fahiş fiyata temin edilir',
      ],
      consequence: 'Sonuç: Tezgâh duruş maliyetleri, kaçan teslimatlar ve eriyen kâr marjı.',
    },
    after: {
      title: 'Çok seviyeli ürün ağacı (BOM) ve otomatik satın alma önerisi',
      actionLog: [
        { step: 'İş Emri Açıldı', detail: '350 Adet pompa için 3 kademeli reçete patlatıldı', status: 'Hesaplandı' },
        { step: 'Kritik Eşik Kontrolü', detail: '120 adet rulman eksiği tespit edilerek tedarikçiye PO önerildi', status: 'Satınalma Emri' },
        { step: 'Gerçek Maliyetleme', detail: 'Fiili hammadde + elektrik + işçilik ile net birim maliyet çıktı', status: '₺420,50/Ad.' },
      ],
      benefits: [
        'Çok aşamalı montaj reçeteleri, fire oranları ve rota süreleri net',
        'Tezgâh ve istasyon kapasiteleri canlı izlenir, darboğazlar önceden görülür',
        'Hammadde, fason işçilik ve giderlerle gerçek ürün kârlılığı ölçülür',
      ],
      gain: 'Kazanım: Sıfır tezgâh duruşu, planlı tedarik ve net kârlılık kontrolü.',
    },
  },
  {
    id: 'finance',
    label: '4. Fatura & Banka',
    dept: 'Finans ve Muhasebe',
    before: {
      title: 'Elle kesilen faturalar, uyuşmayan banka ekstreleri ve açık hesaplar',
      chatLog: [
        { from: 'Muhasebe (Sevgi)', text: 'İrsaliye fişindeki tutarla faturadaki KDV uyuşmuyor, müşteri reddetti.', time: '16:00' },
        { from: 'CFO (Kemal)', text: 'Bankaya 400 bin TL para gelmiş ama kimin havalesi olduğunu çözen yok.', time: '17:30' },
        { from: 'Patron', text: 'Ay bitti, bu ay ne kadar kâr ettik kasada ne var neden göremiyorum?', time: '18:15' },
      ],
      painPoints: [
        'İrsaliye elle faturaya yazılırken matrah veya tevkifat hatası yapılır',
        'Havale açıklaması eksikse hangi müşterinin bakiyesi kapandı bilinemez',
        'Ay sonunda mizan bağlamak ve BA/BS mutabakatı yapmak günler sürer',
      ],
      consequence: 'Sonuç: Fazla mesailer, ceza riskleri ve kontrolsüz nakit açıkları.',
    },
    after: {
      title: 'Tek tıkla e-Fatura dönüşümü ve otomatik banka mutabakatı',
      actionLog: [
        { step: 'Tek Tıkla e-Fatura', detail: 'İrsaliye satırları ve tevkifat kodu sıfır hatayla resmi faturaya dönüştü', status: 'GİB 200' },
        { step: 'Banka Ekstre Eşleşti', detail: 'Garanti BBVA hesabına gelen ₺408.000 havale faturayı kapattı', status: 'Bakiye: ₺0' },
        { step: 'Yevmiye Yazıldı', detail: '102 Bankalar (Borç) / 120 Alıcılar (Alacak) fişi anında deftere işlendi', status: 'Dengeli' },
      ],
      benefits: [
        'İrsaliyeden faturaya sıfır veri tekrarı, %100 yasal UBL-TR uyumu',
        'Gelen havaleler fatura tutarıyla eşleşir, açık cari anında sıfırlanır',
        'Ay sonu mizanı için 15 gün beklenmez, anlık bilanço ve gelir tablosu hazırdır',
      ],
      gain: 'Kazanım: Ay sonu kapanışları 15 günden 1 güne iner, nakit akışı nettir.',
    },
  },
];

export default function BeforeAfterComparison() {
  const [activeScenarioId, setActiveScenarioId] = useState<string>('sales');
  const active = SCENARIOS.find((s) => s.id === activeScenarioId) || SCENARIOS[0];

  return (
    <section className="py-20 lg:py-28 relative bg-[#0B1120] border-t border-slate-800 text-slate-100 overflow-hidden">
      <div className="section-container relative z-10">
        
        {/* Section Header: Crisp, High-Contrast Typography */}
        <div className="max-w-3xl mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] text-xs font-mono text-slate-400 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>OPERASYONEL KARŞILAŞTIRMA</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-[-0.02em] leading-tight mb-4">
            Eski usul karmaşa mı, <span className="text-slate-400 font-normal">yoksa tıkır tıkır işleyen bir operasyon mu?</span>
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
            Bir işletmeyi yavaşlatan şey çalışanlar değildir; birbiriyle konuşmayan Excel dosyaları, WhatsApp grupları ve kopuk programlardır.
          </p>
        </div>

        {/* Scenario Selector Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-8">
          <div className="inline-flex p-1 bg-slate-900/80 border border-slate-800 rounded-lg">
            {SCENARIOS.map((sc) => {
              const isActive = sc.id === activeScenarioId;
              return (
                <button
                  key={sc.id}
                  onClick={() => setActiveScenarioId(sc.id)}
                  className={`px-4 py-2 rounded-md text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
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

        {/* Comparison Showcase Container */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.22 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            {/* Left Box: Eski Usul (Simulated WhatsApp & Chaos) */}
            <div className="p-6 rounded-xl bg-slate-900/85 border border-rose-900/40 shadow-xl shadow-slate-950/40 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-rose-900/20">
                  <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5 font-mono">
                    <span>✕</span> ESKİ USUL & KOPUK DÜZEN
                  </span>
                  <span className="text-[11px] text-slate-400">{active.dept}</span>
                </div>

                <h3 className="text-base font-bold text-white">
                  {active.before.title}
                </h3>

                {/* Simulated Real WhatsApp/Chat Messages */}
                <div className="space-y-2 p-3 rounded-lg bg-slate-950/70 border border-rose-950/60 text-xs">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
                    Günlük İletişim Trafiği:
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
              </div>

              <div className="pt-4 mt-5 border-t border-rose-900/20 text-xs font-semibold text-rose-400">
                {active.before.consequence}
              </div>
            </div>

            {/* Right Box: Axon ERP (Automated Pipeline) */}
            <div className="p-6 rounded-xl bg-slate-900/85 border border-blue-500/30 shadow-xl shadow-blue-950/20 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-blue-500/20">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 font-mono">
                    <span>✓</span> AXON ERP İLE DİJİTAL SİSTEM
                  </span>
                  <span className="text-[11px] text-blue-300 font-medium font-mono">Otomatik Doğrulama</span>
                </div>

                <h3 className="text-base font-bold text-white">
                  {active.after.title}
                </h3>

                {/* Simulated Real Action Pipeline */}
                <div className="space-y-2 p-3 rounded-lg bg-slate-950/70 border border-blue-950/60 text-xs">
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
