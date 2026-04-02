'use client';

import { motion } from 'framer-motion';

export default function Newsletter() {
  return (
    <section className="py-12 bg-white border-t border-slate-200">
      <div className="section-container">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="bg-slate-50 border border-slate-200 rounded-lg p-7 lg:p-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6"
        >
          <div className="lg:max-w-sm">
            <h3 className="text-base font-semibold text-slate-900 mb-1.5">Sektörel gelişmeleri takip edin</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              ERP ve dijital dönüşüm alanındaki güncel bilgileri aylık bültenimizle alın.
            </p>
          </div>
          <form className="flex flex-col sm:flex-row gap-2.5 w-full lg:w-auto lg:min-w-80">
            <input
              type="email"
              placeholder="E-posta adresiniz"
              className="flex-1 bg-white border border-slate-200 px-4 py-2.5 rounded-md text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
              required
            />
            <button type="submit" className="btn-primary whitespace-nowrap">
              Abone Ol
            </button>
          </form>
        </motion.div>
      </div>
    </section>
  );
}
