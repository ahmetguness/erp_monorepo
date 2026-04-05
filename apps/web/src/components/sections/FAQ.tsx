'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const faqs = [
  {
    question: 'Kurulum ne kadar sürer?',
    answer: 'İşletmenizin büyüklüğüne ve seçilen modüllere göre kurulum 3-7 iş günü arasında tamamlanır. Veri aktarımı ve entegrasyonlar bu süreye dahildir.',
  },
  {
    question: 'Mevcut verilerimi sisteme aktarabilir miyim?',
    answer: 'Evet. Excel tabloları, muhasebe yazılımları veya farklı ERP sistemlerindeki verileriniz teknik ekibimiz tarafından kontrollü biçimde aktarılır.',
  },
  {
    question: 'Bulut ve şirket içi kurulum seçenekleri var mı?',
    answer: 'Her iki seçeneği de sunuyoruz. Bulut çözümü hızlı kurulum ve düşük başlangıç maliyeti sağlar. Şirket içi kurulum ise tam veri kontrolü isteyen işletmeler için uygundur.',
  },
  {
    question: 'Eğitim desteği sağlanıyor mu?',
    answer: 'Evet. Canlıya geçiş öncesinde modül bazlı kullanıcı eğitimleri verilir. Uzaktan veya yerinde gerçekleştirilebilir.',
  },
  {
    question: 'Modüller sonradan eklenebilir mi?',
    answer: 'Evet. Başlangıçta ihtiyaç duyduğunuz modüllerle başlayabilir, işletmeniz büyüdükçe yeni modüller ekleyebilirsiniz.',
  },
  {
    question: 'Teknik destek nasıl sağlanıyor?',
    answer: '7/24 telefon, e-posta ve uzaktan bağlantı desteği sunulmaktadır. Profesyonel ve Kurumsal paketlerde kişisel teknik danışman atanır.',
  },
  {
    question: 'Veri güvenliği nasıl sağlanıyor?',
    answer: 'Tüm veriler 256-bit SSL şifreleme ile korunur. ISO 27001 sertifikalı altyapımızda günlük otomatik yedekleme yapılır. Rol bazlı yetkilendirme ile erişim kontrol altındadır.',
  },
  {
    question: 'KVKK uyumluluğu sağlanıyor mu?',
    answer: 'Evet. Sistem KVKK ve GDPR gerekliliklerine uygun tasarlanmıştır. Veri saklama ve silme politikaları sistem üzerinden yönetilebilir.',
  },
];

export default function FAQ() {
  const [expanded, setExpanded] = useState(false);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="py-10 relative bg-[#0F172A]">
      <div className="section-container">

        {/* Trigger row */}
        <motion.button
          onClick={() => { setExpanded(!expanded); setOpenIndex(null); }}
          whileHover={{ scale: 1.005 }}
          whileTap={{ scale: 0.998 }}
          className={
            'w-full flex items-center justify-between px-6 py-4 rounded-xl border transition-all duration-200 group ' +
            (expanded
              ? 'bg-slate-800/60 border-slate-700 rounded-b-none border-b-0'
              : 'bg-slate-800/30 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50')
          }
        >
          <div className="flex items-center gap-4">
            {/* Icon */}
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-left">
              <div className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
                Sık Sorulan Sorular
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {faqs.length} soru — kurulum, güvenlik, destek ve daha fazlası
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <span className={
              'text-xs font-medium px-3 py-1 rounded-md transition-all duration-150 ' +
              (expanded
                ? 'text-blue-400 bg-blue-500/10'
                : 'text-slate-500 bg-slate-800 group-hover:text-slate-300')
            }>
              {expanded ? 'Gizle' : 'Göster'}
            </span>
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.22 }}
            >
              <svg className={
                'w-4 h-4 transition-colors duration-150 ' +
                (expanded ? 'text-blue-400' : 'text-slate-600 group-hover:text-slate-400')
              } fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </motion.div>
          </div>
        </motion.button>

        {/* Expandable FAQ list */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="bg-slate-800/30 border border-slate-700 border-t-0 rounded-b-xl divide-y divide-slate-800">
                {faqs.map((faq, idx) => (
                  <div key={idx}>
                    <button
                      onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                      className="w-full text-left flex items-center justify-between px-6 py-4 hover:bg-slate-800/40 transition-colors duration-150 group"
                    >
                      <div className="flex items-center gap-3">
                        <span className={
                          'text-[11px] font-bold tabular-nums w-5 flex-shrink-0 ' +
                          (openIndex === idx ? 'text-blue-500' : 'text-slate-700')
                        }>
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className={
                          'text-sm transition-colors duration-150 ' +
                          (openIndex === idx
                            ? 'text-white font-medium'
                            : 'text-slate-400 group-hover:text-slate-200')
                        }>
                          {faq.question}
                        </span>
                      </div>
                      <motion.div
                        animate={{ rotate: openIndex === idx ? 45 : 0 }}
                        transition={{ duration: 0.18 }}
                        className="flex-shrink-0 ml-4"
                      >
                        <div className={
                          'w-5 h-5 rounded flex items-center justify-center transition-all duration-150 ' +
                          (openIndex === idx
                            ? 'bg-blue-500/10'
                            : 'group-hover:bg-slate-800')
                        }>
                          <svg className={
                            'w-2.5 h-2.5 transition-colors duration-150 ' +
                            (openIndex === idx ? 'text-blue-400' : 'text-slate-600 group-hover:text-slate-400')
                          } fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                          </svg>
                        </div>
                      </motion.div>
                    </button>

                    <AnimatePresence initial={false}>
                      {openIndex === idx && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: 'easeInOut' }}
                          className="overflow-hidden"
                        >
                          <div className="px-6 pb-5 pl-14">
                            <p className="text-sm text-slate-400 leading-relaxed border-l border-slate-700 pl-4">
                              {faq.answer}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </section>
  );
}
