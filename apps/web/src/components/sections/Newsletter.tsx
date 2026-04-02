'use client';

import { motion } from 'framer-motion';

export default function Newsletter() {
  return (
    <section className="section-spacing bg-white border-t border-slate-50">
      <div className="section-container">
        <div className="bg-blue-50 border border-blue-100 rounded-3xl p-12 lg:p-24 text-center space-y-10 relative overflow-hidden">
          {/* Subtle decoration */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-100/30 rounded-full blur-3xl -mr-32 -mt-32" />
          
          <motion.header 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="space-y-4 relative z-10"
          >
            <h2 className="text-3xl lg:text-5xl font-black text-slate-900 tracking-tight">Sektörel Gelişmeleri Takip Edin</h2>
            <p className="text-lg text-slate-600 font-medium max-w-xl mx-auto">Kurumsal teknoloji trendlerini ve ERP dünyasındaki güncel haberleri ilk siz öğrenin.</p>
          </motion.header>
          
          <motion.form 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="max-w-md mx-auto flex flex-col sm:flex-row gap-4 relative z-10"
          >
            <input 
              type="email" 
              placeholder="E-posta adresiniz" 
              className="flex-1 bg-white border-2 border-slate-100 px-6 py-4 rounded text-sm font-bold focus:border-blue-700 focus:outline-none transition-all"
              required
            />
            <button className="bg-blue-700 text-white px-8 py-4 rounded text-sm font-black hover:bg-blue-800 transition-all uppercase tracking-widest shadow-xl shadow-blue-900/10 active:scale-95">KAYIT OL</button>
          </motion.form>
        </div>
      </div>
    </section>
  );
}
