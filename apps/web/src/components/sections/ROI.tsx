'use client';

import { motion } from 'framer-motion';

const MEASURABLE_AREAS = [
  {
    title: 'Manuel İşlem Sayısı',
    desc: 'Teklif, sipariş, irsaliye ve fatura satırlarının elle tekrar tekrar sisteme girilmesini azaltarak insan hatası riskini en aza indirin.',
    focus: 'Veri Bütünlüğü',
  },
  {
    title: 'Sipariş İşlem Süresi',
    desc: 'Müşteri siparişinin onaylanmasından depoda hazırlanmasına ve sevk fişinin çıkmasına kadar geçen toplam operasyon süresini kısaltın.',
    focus: 'Operasyonel Hız',
  },
  {
    title: 'Stok Uyuşmazlıkları',
    desc: 'Raflardaki fiziksel stok ile sistemdeki kayıtların anlık eşleşmesini sağlayarak çift satışları ve stokta bulunmama krizlerini önleyin.',
    focus: 'Depo Doğruluğu',
  },
  {
    title: 'Sevkiyat ve İrsaliye Hızı',
    desc: 'El terminali barkod taraması ve otomatik UBL-TR e-İrsaliye ile araçların kapıda beklemeden zamanında yola çıkmasını sağlayın.',
    focus: 'Lojistik Disiplini',
  },
  {
    title: 'Finansal Kapanış Süreci',
    desc: 'Banka ekstrelerinin otomatik eşleşmesi ve kendiliğinden oluşan yevmiye fişleri ile ay sonu mizan ve mutabakat süresini hızlandırın.',
    focus: 'Nakit Şeffaflığı',
  },
];

export default function ROI() {
  const handleRoiClick = () => {
    window.dispatchEvent(
      new CustomEvent('openChatWithMessage', {
        detail: 'İşletmemizin süreçlerine özel süreç verimliliği ve ROI analiz desteği talep ediyoruz.',
      })
    );
  };

  return (
    <section className="py-20 lg:py-28 bg-[#0B1424] border-t border-slate-800 text-slate-100 overflow-hidden">
      <div className="section-container">
        
        {/* Section Header */}
        <div className="max-w-3xl mb-12">
          <div className="section-label">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>OPERASYONEL VERİMLİLİK</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight mb-4">
            Operasyonel verimliliğinizi ölçülebilir hale getirin.
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
            ERP yatırımı afaki vaatlerle değil; sipariş işlem süresi, stok doğruluğu ve finansal kapanış hızındaki somut iyileşmelerle değer yaratır.
          </p>
        </div>

        {/* Measurable Dimensions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
          {MEASURABLE_AREAS.map((area, idx) => (
            <motion.div
              key={area.title}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              className="p-6 rounded-2xl bg-[#080F1E] border border-white/[0.08] hover:border-white/[0.14] transition-all duration-200 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                    {area.focus}
                  </span>
                  <span className="text-xs font-mono text-slate-500">0{idx + 1}</span>
                </div>
                <h3 className="text-base font-bold text-white mb-2">
                  {area.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  {area.desc}
                </p>
              </div>
            </motion.div>
          ))}

          {/* CTA Card in the 6th Slot */}
          <div className="p-6 rounded-2xl bg-[#080F1E] border border-blue-500/30 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 mb-3 inline-block">
                Özel Süreç Değerlendirmesi
              </span>
              <h3 className="text-base font-bold text-white mb-2">
                İşletmenize Özel Süreç İncelemesi
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-4">
                Departman iş yükünüzü, açık sipariş hacminizi ve mevcut darboğazlarınızı analiz ederek size özel verimlilik haritası çıkaralım.
              </p>
            </div>

            <button
              onClick={handleRoiClick}
              className="btn-primary w-full text-xs py-2.5 justify-center flex items-center gap-1.5 cursor-pointer"
            >
              <span>İşletmeniz İçin ROI Analizi İsteyin</span>
              <span>→</span>
            </button>
          </div>
        </div>

      </div>
    </section>
  );
}
