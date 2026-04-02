'use client';

import { motion } from 'framer-motion';

const testimonials = [
  {
    quote: 'Stok ve fatura süreçlerimizde hata payını sıfıra indirdik. Aylık kapanışlarımız artık günler değil saatler sürüyor.',
    author: 'Ahmet Erkoç',
    role: 'CEO',
    company: 'Erkoç Otomotiv',
  },
  {
    quote: 'Saha satış ekiplerimizle merkez ofis arasındaki bilgi kopukluğunu giderdik. CRM modülü sayesinde müşteri takibimiz çok daha sistematik hale geldi.',
    author: 'Selin Yılmaz',
    role: 'Satış Müdürü',
    company: 'Yılmaz Lojistik',
  },
  {
    quote: 'Uluslararası standartlarda raporlama altyapısına kavuştuk. Yönetim kuruluna sunduğumuz finansal analizler artık gerçek zamanlı veriye dayanıyor.',
    author: 'Caner Aydın',
    role: 'Finans Direktörü',
    company: 'Global Gıda A.Ş.',
  },
];

export default function Testimonials() {
  return (
    <section className="section-spacing relative bg-[#0F172A] overflow-hidden">
      <div className="absolute top-0 right-1/4 w-[400px] h-[300px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="section-container relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45 }}
          className="max-w-2xl mb-12"
        >
          <div className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-3">Müşteri Görüşleri</div>
          <h2 className="text-2xl lg:text-3xl font-bold text-white mb-3">
            Müşterilerimiz ne diyor?
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Farklı sektörlerden işletmeler Axon ERP ile süreçlerini nasıl iyileştirdi.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {testimonials.map((t, idx) => (
            <motion.article
              key={idx}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              className="bg-slate-800/40 border border-slate-700 rounded-lg p-6 flex flex-col gap-4 hover:border-slate-600 transition-colors duration-150"
            >
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <svg key={i} className="w-3 h-3 text-amber-400 fill-current" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>

              <blockquote className="text-sm text-slate-300 leading-relaxed flex-grow">
                {t.quote}
              </blockquote>

              <div className="flex items-center gap-3 pt-3 border-t border-slate-700">
                <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-400 flex-shrink-0">
                  {t.author[0]}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-200">{t.author}</div>
                  <div className="text-xs text-slate-500">{t.role}, {t.company}</div>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
