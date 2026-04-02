'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

const trustItems = [
  { text: 'Satış, stok, muhasebe ve raporlama tek sistemde' },
  { text: 'Bulut veya şirket içi kurulum' },
  { text: 'Kurulum ve eğitim desteği dahil' },
];

export default function Hero() {
  return (
    <section className="relative pt-14 pb-0 bg-[#0F172A] overflow-hidden">
      {/* Grid overlay */}
      <div className="absolute inset-0 bg-grid-dark opacity-100 pointer-events-none" />

      {/* Subtle blue glow top-left */}
      <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-20 right-0 w-[400px] h-[400px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="section-container relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center py-16 lg:py-24">
          {/* Left: Text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
          >
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex items-center gap-2 bg-blue-600/10 border border-blue-500/20 text-blue-400 text-xs font-semibold px-3 py-1.5 rounded-md mb-5 uppercase tracking-widest"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              Kurumsal ERP Yazılımı
            </motion.div>

            <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-white leading-tight mb-5">
              Tüm iş süreçlerinizi{' '}
              <span className="text-blue-400">tek platformda</span>{' '}
              yönetin
            </h1>
            <p className="text-base text-slate-400 leading-relaxed mb-8 max-w-lg">
              Muhasebe, stok, satış, satın alma ve personel yönetimini birbirine entegre bir sistemde toplayın.
              Axon ERP ile operasyonel verimliliğinizi artırın, manuel süreçleri azaltın.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-10">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="btn-primary px-6 py-3 text-sm"
              >
                Demo Talep Et
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="bg-white/5 border border-white/10 text-slate-300 px-6 py-3 rounded-md text-sm font-semibold hover:bg-white/10 transition-colors"
              >
                Modülleri İncele
              </motion.button>
            </div>

            {/* Trust items */}
            <div className="flex flex-col gap-2.5">
              {trustItems.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.1, duration: 0.35 }}
                  className="flex items-center gap-2.5 text-sm text-slate-400"
                >
                  <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {item.text}
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right: Dashboard */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.2 }}
            className="relative"
          >
            {/* Floating metric cards */}
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8, duration: 0.4 }}
              className="absolute -left-4 top-8 z-10 hidden lg:flex items-center gap-2.5 bg-slate-800 border border-slate-700 rounded-md px-3.5 py-2.5 shadow-xl"
            >
              <div className="w-7 h-7 bg-green-500/20 rounded flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-medium leading-none mb-0.5">Bu ay ciro</div>
                <div className="text-xs font-bold text-white">₺2.847.500</div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.95, duration: 0.4 }}
              className="absolute -right-4 bottom-12 z-10 hidden lg:flex items-center gap-2.5 bg-slate-800 border border-slate-700 rounded-md px-3.5 py-2.5 shadow-xl"
            >
              <div className="w-7 h-7 bg-blue-500/20 rounded flex items-center justify-center flex-shrink-0">
                <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-medium leading-none mb-0.5">Güvenlik</div>
                <div className="text-xs font-bold text-white">ISO 27001</div>
              </div>
            </motion.div>

            <div className="rounded-lg overflow-hidden border border-slate-700 shadow-2xl shadow-black/40">
              <Image
                src="/hero-dashboard.png"
                alt="Axon ERP Yönetim Paneli"
                width={1200}
                height={720}
                className="w-full h-auto"
                priority
              />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Bottom fade — seamless into Features */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-b from-transparent to-[#0F172A] pointer-events-none z-20" />
    </section>
  );
}
