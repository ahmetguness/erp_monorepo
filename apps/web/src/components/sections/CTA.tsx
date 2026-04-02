'use client';

import { motion } from 'framer-motion';

export default function CTA() {
  return (
    <section id="cta" className="section-spacing bg-blue-700 text-white overflow-hidden relative">
      {/* Kurumsal Mikro-Grid */}
      <motion.div 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 0.1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.5 }}
        className="absolute inset-0 pointer-events-none"
      >
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="cta-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cta-grid)" />
        </svg>
      </motion.div>

      <div className="section-container relative z-10 text-center space-y-12 max-w-4xl mx-auto">
        <motion.header 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8 }}
          className="space-y-6"
        >
          <h2 className="text-4xl lg:text-7xl font-black tracking-tight leading-none text-white">
            İşinizi Dijitalleştirmeye <br/> Bugün Başlayın
          </h2>
          <p className="text-xl lg:text-2xl text-blue-100 font-medium max-w-2xl mx-auto leading-relaxed underline underline-offset-8 decoration-blue-100/20">
            Süreçlerinizi optimize edin, verimliliğinizi artırın. Kurumsal gücümüzle yanınızdayız.
          </p>
        </motion.header>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-4"
        >
          <button className="w-full sm:w-auto bg-white text-blue-700 px-12 py-5 rounded text-lg font-black hover:bg-slate-50 transition-all shadow-2xl active:scale-95 uppercase tracking-widest">
            ÜCRETSİZ DEMO TALEBİ
          </button>
          <button className="w-full sm:w-auto bg-transparent border-2 border-white/40 text-white px-12 py-5 rounded text-lg font-black hover:bg-white/10 transition-all active:scale-95 uppercase tracking-widest">
            UZMANLA GÖRÜŞÜN
          </button>
        </motion.div>
      </div>
    </section>
  );
}
