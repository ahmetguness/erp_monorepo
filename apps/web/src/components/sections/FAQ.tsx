'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const faqs = [
  {
    question: "Veri güvenliğini nasıl sağlıyorsunuz?",
    answer: "Tüm verileriniz banka düzeyinde SSL sertifikaları ve uçtan uca şifreleme ile korunur. Bulut altyapımızda verileriniz günlük olarak yedeklenir ve ISO 27001 standartlarında veri merkezlerinde saklanır."
  },
  {
    question: "Eğitim ve kurulum süreci ne kadar sürer?",
    answer: "İşletmenizin büyüklüğüne göre kurulum 2-4 iş günü, personel eğitimleri ise 1 hafta içinde tamamlanır. Süreç boyunca uzman danışmanlarımız birebir destek sağlar."
  },
  {
    question: "Mevcut verilerimi ERP'ye aktarabilir miyim?",
    answer: "Evet. Mevcut Excel tablolarınız veya farklı yazılımlardaki verileriniz; veri aktarım araçlarımız ve teknik ekibimiz tarafından kontrollü bir şekilde ERP sistemine entegre edilir."
  },
  {
    question: "Destek hizmetleriniz nelerdir?",
    answer: "7/24 telefon ve ticket desteği, düzenli sürüm güncellemeleri, yerinde danışmanlık opsiyonu ve kapsamlı dokümantasyon merkezimiz ile her zaman yanınızdayız."
  }
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="section-spacing bg-white">
      <div className="section-container">
        <header className="text-center max-w-2xl mx-auto mb-20 space-y-4">
          <h2 className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tight leading-none uppercase tracking-tighter">Sıkça Sorulan Sorular</h2>
          <p className="text-xl text-slate-600 font-medium">Aklınıza takılan tüm sorular için kurumsal yanıtlarımız.</p>
        </header>

        <div className="max-w-3xl mx-auto space-y-4">
          {faqs.map((faq, idx) => (
            <article 
              key={idx}
              className={`border-2 rounded-2xl transition-all duration-300 ${
                openIndex === idx ? 'border-blue-600 bg-blue-50/10 shadow-xl' : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              <button 
                onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                className="w-full text-left p-8 flex justify-between items-center"
              >
                <h3 className={`text-lg font-black tracking-tight ${openIndex === idx ? 'text-blue-700' : 'text-slate-900'}`}>
                  {faq.question}
                </h3>
                <span className={`text-2xl transition-transform duration-300 ${openIndex === idx ? 'rotate-180 text-blue-700' : 'text-slate-400'}`}>
                  ▼
                </span>
              </button>
              
              <AnimatePresence>
                {openIndex === idx && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <p className="px-8 pb-8 text-slate-600 font-bold leading-relaxed text-sm lg:text-base italic decoration-blue-100 decoration-4 underline-offset-8">
                      {faq.answer}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
