'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SectorItem {
  id: string;
  title: string;
  problem: string;
  solution: string;
  modules: string[];
}

const SECTORS: SectorItem[] = [
  {
    id: 'mfg',
    title: 'Üretim & İmalat',
    problem: 'Hammadde eksikliği nedeniyle duran tezgâhlar, belirsiz fiili ürün maliyeti ve takip edilemeyen fire oranları.',
    solution: 'Çok seviyeli ürün reçeteleri (BOM), malzeme ihtiyaç planlaması (MRP) ve istasyon bazlı iş emirleriyle planlı üretim.',
    modules: ['MRP Planlama', 'Ürün Reçeteleri (BOM)', 'İş Emirleri', 'Fiili Maliyetleme'],
  },
  {
    id: 'retail',
    title: 'Perakende & Mağazacılık',
    problem: 'Mağazalar ve depolar arasında stok uyuşmazlığı, kasalarda yavaş işlem ve manuel satış konsolidasyonu.',
    solution: 'Anlık çok depolu stok takibi, hızlı satış kasa entegrasyonu ve merkezi ürün/fiyat yönetimi.',
    modules: ['Çoklu Depo', 'Kasa & Satış', 'Fiyat Listeleri', 'Barkod Takibi'],
  },
  {
    id: 'wholesale',
    title: 'Toptan & Dağıtım',
    problem: 'Büyük hacimli siparişlerde stok kilitleme karmaşası, müşteri bazlı farklı vade/iskonto takibinin zorluğu.',
    solution: 'Onaylanan siparişlerde anlık stok rezervasyonu, cari risk limitleri ve tek tıkla toplu e-İrsaliye ve e-Fatura kesimi.',
    modules: ['Sipariş Tahsisi', 'Cari Risk Yönetimi', 'e-İrsaliye & e-Fatura', 'Sevkiyat'],
  },
  {
    id: 'logistics',
    title: 'Lojistik & Depolama',
    problem: 'Raf ve koridor adreslemesi olmadan yapılan yavaş mal kabul, hatalı parti sevkiyatı ve geciken teslimatlar.',
    solution: 'Lokasyon bazlı depo yönetimi, el terminaliyle barkod/çeki listesi doğrulaması ve araç çıkışında otomatik e-İrsaliye.',
    modules: ['Depo Lokasyon', 'Parti / Lot Takibi', 'Çeki Listesi', 'Transfer Fişleri'],
  },
  {
    id: 'service',
    title: 'Hizmet & Proje',
    problem: 'Proje aşamalarında yapılan harcamaların bütçeden sapması, düzensiz hakediş ve geciken faturalandırma.',
    solution: 'Proje bazlı gelir-gider takibi, sözleşme ve periyodik faturalama kuralları ile şeffaf kârlılık kontrolü.',
    modules: ['Proje Yönetimi', 'Sözleşme Takibi', 'Periyodik Fatura', 'Gider Analizi'],
  },
  {
    id: 'field-service',
    title: 'Teknik Servis & Bakım',
    problem: 'Saha ekiplerinin dağınık iş takibi, kullanılan yedek parçaların depodan düşmemesi ve garanti süresi karmaşası.',
    solution: 'Servis talep ve iş emirleri, saha ekipleri için görev yönetimi, yedek parça stok düşümü ve seri no garanti takibi.',
    modules: ['Teknik Servis', 'Seri No & Garanti', 'Yedek Parça Stok', 'Saha İş Emri'],
  },
];

export default function Sectors() {
  const [activeSectorId, setActiveSectorId] = useState<string>('mfg');
  const activeSector = SECTORS.find((s) => s.id === activeSectorId) || SECTORS[0];

  return (
    <section id="sectors" className="py-20 lg:py-28 bg-[#0B1424] border-t border-slate-800 text-slate-100 overflow-hidden">
      {/* Anchor for solutions */}
      <div id="solutions" className="relative -top-24" />

      <div className="section-container">
        
        {/* Section Header */}
        <div className="max-w-3xl mb-12">
          <div className="section-label">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>SEKTÖREL UYUMLULUK</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight mb-4">
            İşletmenizin çalışma şekline uyum sağlar.
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
            Her sektörün operasyonel dinamiği farklıdır. Axon ERP, imalattan toptan ticarete, saha servisinden lojistiğe kadar sektörünüze özgü süreçleri doğrudan destekler.
          </p>
        </div>

        {/* Master Detail Sector Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Column: Sector List */}
          <div className="lg:col-span-4 flex flex-col gap-2">
            {SECTORS.map((sec) => {
              const isActive = sec.id === activeSectorId;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSectorId(sec.id)}
                  className={`p-4 rounded-xl text-left transition-all duration-150 cursor-pointer border flex items-center justify-between ${
                    isActive
                      ? 'bg-[#080F1E] border-blue-500/60 shadow-md shadow-blue-500/10'
                      : 'bg-[#080F1E]/40 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span className={`text-xs sm:text-sm font-semibold ${isActive ? 'text-white' : 'text-slate-400'}`}>
                    {sec.title}
                  </span>
                  {isActive && (
                    <span className="text-blue-400 font-bold text-xs">→</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Column: Problem -> Solution -> Modules */}
          <div className="lg:col-span-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSector.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="bg-[#080F1E] border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl"
              >
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <h3 className="text-xl font-bold text-white">
                    {activeSector.title} Sektörü İçin Çözüm
                  </h3>
                  <span className="text-[11px] text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded border border-blue-500/20">
                    Özelleştirilebilir
                  </span>
                </div>

                {/* Problem vs Solution */}
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-[#060B15] border border-rose-950/40">
                    <div className="text-[10px] font-mono text-rose-400 font-semibold uppercase tracking-wider mb-1">
                      Sektörel Darboğaz:
                    </div>
                    <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                      {activeSector.problem}
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#060B15] border border-blue-950/40">
                    <div className="text-[10px] font-mono text-emerald-400 font-semibold uppercase tracking-wider mb-1">
                      Axon ERP Çözümü:
                    </div>
                    <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                      {activeSector.solution}
                    </p>
                  </div>
                </div>

                {/* Modules Used */}
                <div>
                  <div className="text-xs font-semibold text-slate-400 mb-2.5">
                    Bu Sektörde Öne Çıkan Modüller:
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {activeSector.modules.map((mod) => (
                      <div
                        key={mod}
                        className="p-2.5 rounded-lg bg-[#0B1424] border border-slate-800 text-xs text-slate-300 text-center font-medium"
                      >
                        {mod}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom CTA */}
                <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    Sektörünüzün özel süreçleri için uzman ekibimizle görüşebilirsiniz.
                  </span>
                  <button
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('openChatWithMessage', {
                          detail: `${activeSector.title} sektörü için süreç analizi ve demo talep ediyorum.`,
                        })
                      );
                    }}
                    className="text-blue-400 hover:text-blue-300 font-semibold cursor-pointer transition-colors"
                  >
                    Demo İsteyin →
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

        </div>

      </div>
    </section>
  );
}
