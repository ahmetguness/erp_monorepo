'use client';

import { motion } from 'framer-motion';

const BENEFITS = [
  {
    title: 'Tek Veri Kaynağı',
    desc: 'Satış, depo, üretim ve muhasebe aynı güncel kayıtlar üzerinde çalışır. Birbirinden kopuk Excel tabloları ve bilgi adacıkları tarihe karışır.',
    tag: 'Bütünleşik Sistem',
    points: [
      'Tüm departmanlarda anlık tutarlı veri',
      'Kopuk dosyalar yerine merkezi kayıt',
      'Yetkili ekipler için anlık şeffaflık',
    ],
  },
  {
    title: 'Daha Az Manuel İşlem',
    desc: 'Teklif onaylandığında sipariş oluşur, sevk edildiğinde irsaliye ve fatura kesilir. Verileri tekrar tekrar yazma ihtiyacı ortadan kalkar.',
    tag: 'Operasyonel Hız',
    points: [
      'Tekrarlanan veri girişlerini azaltma',
      'Yazım ve hesaplama hatalarını engelleme',
      'Otomatik belge dönüşümleri',
    ],
  },
  {
    title: 'Anlık Görünürlük',
    desc: 'Depodaki raftan bankadaki nakit akışına kadar işletmenizin tüm operasyonel ve finansal sağlığını tek ekrandan izleyin.',
    tag: 'Yönetim Kontrolü',
    points: [
      'Canlı stok ve sipariş durumu',
      'Vadesi gelen alacak ve borç takibi',
      'Darboğazları önceden fark etme',
    ],
  },
  {
    title: 'Kontrollü Erişim & Denetim',
    desc: 'Her çalışan yalnızca kendi görev tanımına uygun verilere erişir. Kritik işlemlerde onay akışları ve geriye dönük denetim izi devrededir.',
    tag: 'Kurumsal Güvence',
    points: [
      'Rol ve departman bazlı yetki matrisi',
      'Kritik işlemlerde çift kişi onayı',
      'Tarih, saat ve kullanıcı işlem kaydı',
    ],
  },
];

export default function Benefits() {
  return (
    <section className="py-20 lg:py-28 bg-[#0D1728] border-t border-slate-800 text-slate-100 overflow-hidden">
      <div className="section-container">
        
        {/* Section Header */}
        <div className="max-w-3xl mb-12">
          <div className="section-label">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>OPERASYONEL ÇIKTILAR</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight mb-4">
            Operasyonunuz büyürken sisteminiz geride kalmasın.
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
            Axon ERP sadece kayıt tutan bir veritabanı değildir; departmanlar arasındaki iletişimi hızlandıran, hataları önleyen ve yönetime tam kontrol sağlayan kurumsal bir omurgadır.
          </p>
        </div>

        {/* 4 Outcome Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {BENEFITS.map((b, idx) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              className="p-6 sm:p-7 rounded-2xl bg-[#080F1E] border border-white/[0.08] hover:border-white/[0.14] transition-all duration-200 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-semibold text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded border border-blue-500/20">
                    {b.tag}
                  </span>
                  <span className="text-xs font-mono text-slate-500">0{idx + 1}</span>
                </div>

                <h3 className="text-lg sm:text-xl font-bold text-white mb-2.5">
                  {b.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-5">
                  {b.desc}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-800/80 space-y-2">
                {b.points.map((pt, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span>{pt}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}
