'use client';

import { motion } from 'framer-motion';

const testimonials = [
  {
    quote: "Axon ERP ile üretim süreçlerimizi tamamen dijitalleştirdik. Verimliliğimiz ilk altı ayda %40 arttı ve hata payımızı minimize ettik.",
    author: "Ahmet Erkoç",
    role: "CEO",
    company: "Erkoç Otomotiv",
    image: "https://avatar.vercel.sh/ahmet"
  },
  {
    quote: "Saha satış ekiplerimizle merkez ofisimiz arasındaki iletişim bariyerlerini yıktık. CRM modülü sayesinde müşteri sadakatimiz hiç olmadığı kadar yüksek.",
    author: "Selin Yılmaz",
    role: "Pazarlama Müdürü",
    company: "Yılmaz Lojistik",
    image: "https://avatar.vercel.sh/selin"
  },
  {
    quote: "Uluslararası standartlarda bir raporlama altyapısına kavuştuk. Finansal analizlerimiz artık sadece saniyeler sürüyor, günler değil.",
    author: "Caner Aydın",
    role: "IT Direktörü",
    company: "Global Gıda A.Ş.",
    image: "https://avatar.vercel.sh/caner"
  }
];

export default function Testimonials() {
  return (
    <section className="section-spacing bg-white">
      <div className="section-container">
        <header className="text-center max-w-2xl mx-auto mb-20 space-y-4">
          <h2 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight">İş Ortaklarımızın Gözünden</h2>
          <p className="text-xl text-slate-600 font-medium">Türkiye'nin öncü kurumları süreçlerini bizimle yönetiyor.</p>
        </header>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {testimonials.map((t, idx) => (
            <motion.article 
              key={idx}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: idx * 0.1 }}
              className="bg-slate-50 p-12 rounded-3xl border border-slate-100 flex flex-col justify-between space-y-10 group hover:bg-white hover:shadow-2xl hover:border-blue-700/10 transition-all duration-300"
            >
              <div className="text-5xl text-blue-700 opacity-20 group-hover:opacity-100 transition-opacity select-none font-serif leading-none italic">
                “
              </div>
              <blockquote className="text-xl text-slate-900 font-bold leading-relaxed italic border-l-4 border-blue-600 pl-6 underline decoration-slate-100 decoration-4 underline-offset-8">
                {t.quote}
              </blockquote>
              <div className="flex items-center gap-6 pt-6 grayscale group-hover:grayscale-0 transition-all">
                {/* Image Placeholder */}
                <div className="w-16 h-16 rounded-full bg-blue-100 border-2 border-white shadow-xl flex items-center justify-center font-black text-blue-700 text-xl tracking-tighter">
                  {t.author[0]}
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900">{t.author}</h4>
                  <p className="text-slate-500 font-bold text-sm uppercase tracking-wider">{t.role} | {t.company}</p>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
