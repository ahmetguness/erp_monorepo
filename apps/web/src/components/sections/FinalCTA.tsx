'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

export default function FinalCTA() {
  const handleDemoClick = () => {
    window.dispatchEvent(
      new CustomEvent('openChatWithMessage', {
        detail: 'Axon ERP canlı demo görüşmesi planlamak ve sistem hakkında detaylı bilgi almak istiyorum.',
      })
    );
  };

  return (
    <section className="py-20 lg:py-24 bg-[#0B1424] border-t border-slate-800 text-slate-100 relative overflow-hidden">
      {/* Subtle controlled royal blue glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="section-container relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35 }}
          className="p-8 sm:p-12 rounded-3xl bg-[#080F1E] border border-blue-500/30 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-8"
        >
          <div className="max-w-2xl">
            <span className="text-xs font-mono text-blue-400 font-semibold uppercase tracking-wider mb-2 block">
              Kurumsal Dijitalleşme
            </span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight mb-3">
              İşletmenizi dağınık sistemlerle yönetmeyi bırakın.
            </h2>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Siparişten üretime, stoktan faturaya tüm operasyonunuzu tek platformda yönetin.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-shrink-0 w-full md:w-auto">
            <button
              onClick={handleDemoClick}
              className="btn-primary py-3 px-6 text-sm font-semibold justify-center flex items-center gap-2 cursor-pointer"
            >
              <span>Canlı Demo İsteyin</span>
              <span>→</span>
            </button>
            <Link
              href="#pricing"
              className="btn-secondary py-3 px-6 text-sm font-semibold text-center"
            >
              Fiyatları İnceleyin
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
