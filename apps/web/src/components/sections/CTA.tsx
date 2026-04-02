'use client';

import { motion } from 'framer-motion';

export default function CTA() {
  return (
    <section className="py-16 bg-blue-600 border-t border-blue-700">
      <div className="section-container">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8"
        >
          <div className="max-w-xl">
            <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2 leading-tight">
              Sistemi işletmenizde görmek ister misiniz?
            </h2>
            <p className="text-blue-100 text-sm leading-relaxed">
              Uzmanlarımız işletmenizin ihtiyaçlarını dinleyerek size özel bir demo sunar.
              Kurulum ve fiyat bilgisi için satış ekibimizle görüşün.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
            <button className="bg-white text-blue-600 px-6 py-2.5 rounded-md text-sm font-semibold hover:bg-blue-50 transition-colors active:scale-[0.98]">
              Demo Talep Et
            </button>
            <button className="bg-transparent border border-white/40 text-white px-6 py-2.5 rounded-md text-sm font-semibold hover:bg-white/10 transition-colors active:scale-[0.98]">
              Satış Ekibiyle Görüş
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
