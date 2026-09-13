'use client';

import { motion } from 'framer-motion';

const INTEGRATIONS = [
  { name: 'Gelir İdaresi Başkanlığı', category: 'e-Belge / Mevzuat', badge: 'GİB' },
  { name: 'Trendyol Pazaryeri', category: 'E-Ticaret', badge: 'Pazaryeri' },
  { name: 'Hepsiburada API', category: 'E-Ticaret', badge: 'Pazaryeri' },
  { name: 'Amazon Türkiye', category: 'E-Ticaret', badge: 'Pazaryeri' },
  { name: 'Shopify', category: 'E-Ticaret', badge: 'E-Mağaza' },
  { name: 'Garanti BBVA', category: 'Banka Ekstresi', badge: 'Finans' },
  { name: 'Akbank Kurumsal', category: 'Banka Ekstresi', badge: 'Finans' },
  { name: 'Türkiye İş Bankası', category: 'Banka Ekstresi', badge: 'Finans' },
  { name: 'Yurtiçi Kargo', category: 'Lojistik & Kargo', badge: 'Lojistik' },
  { name: 'MNG Kargo', category: 'Lojistik & Kargo', badge: 'Lojistik' },
];

export default function IntegrationEcosystem() {
  return (
    <section id="integrations" className="py-12 lg:py-16 bg-[#080F1E] border-t border-slate-800/80 text-slate-100 overflow-hidden">
      <div className="section-container">
        
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8"
        >
          <div>
            <div className="text-[11px] font-mono text-blue-400 font-semibold uppercase tracking-wider mb-1">
              Entegrasyon Ekosistemi
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              İşletmenizin kullandığı sistemlerle entegre çalışır.
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md leading-relaxed">
            Mevcut e-ticaret kanallarınızı, resmi e-belge süreçlerinizi ve banka hareketlerinizi tek merkezden senkronize edin.
          </p>
        </motion.div>

        {/* Integration Badges Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {INTEGRATIONS.map((item, idx) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: idx * 0.03 }}
              className="p-3.5 rounded-xl bg-[#0B1424] border border-white/[0.06] hover:border-white/[0.12] transition-colors flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
                  {item.badge}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white truncate">
                  {item.name}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {item.category}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}
