'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: 'Mevcut verilerimizi Axon ERP’ye aktarabilir miyiz?',
    answer: 'Evet. Mevcut Excel tablolarınız, eski muhasebe programlarınız veya farklı ticari yazılımlardaki cari kartlarınız, stok kayıtlarınız ve açık hesap bakiyeleriniz veri migrasyon şablonları aracılığıyla uzman ekibimiz tarafından kontrollü biçimde sisteme aktarılır.',
  },
  {
    question: 'Kurulum ve canlı kullanıma geçiş süreci nasıl ilerliyor?',
    answer: 'Süreç 4 aşamada yürütülür: İhtiyaç ve süreç analizi, işletmenize özel sistem yapılandırması (şube, depo, onay kuralları), veri aktarımı ve kullanıcı eğitimleri. Canlı geçiş öncesinde tüm süreçler test edilir.',
  },
  {
    question: 'Bulut (SaaS) ile Şirket İçi (On-Premise) kurulum arasındaki temel fark nedir?',
    answer: 'Bulut modelinde sunucu bakımı, yedekleme ve güncellemeler Axon altyapısı tarafından yönetilir ve internet tarayıcısından her cihazla erişilir. Şirket içi modelde ise sistem kurumunuzun kendi sunucularında çalışır ve veriler tamamen şirket ağınızda saklanır.',
  },
  {
    question: 'Başlangıçtan sonra ek modüller veya yeni kullanıcılar ekleyebilir miyiz?',
    answer: 'Evet. Axon ERP modüler mimariye sahiptir. Başlangıçta temel satış ve stok modülleriyle başlayabilir; işletmeniz büyüdükçe üretim (MRP), teknik servis, pazaryeri entegrasyonu veya ek kullanıcı lisanslarını mevcut sisteminizi kesintiye uğratmadan dahil edebilirsiniz.',
  },
  {
    question: 'Kullanıcı yetkilendirmesi ve şube veri izolasyonu nasıl çalışır?',
    answer: 'Rol bazlı erişim yönetimi (RBAC) ile her personel yalnızca görev tanımına uygun ekranları ve verileri görür. Şubeli yapılarda şube personeli diğer şubenin finansal veya ticari verilerine erişemez; merkez yönetim ise konsolide raporları inceler.',
  },
  {
    question: 'e-Fatura, e-İrsaliye ve resmi mevzuat entegrasyonu nasıl çalışır?',
    answer: 'Sistem Gelir İdaresi Başkanlığı (GİB) UBL-TR standartlarında doğrudan e-Belge düzenlemeyi destekler. Depoda onaylanan sevk fişinden tek tıkla e-İrsaliye, onaylanan siparişten resmi e-Fatura üretilir ve yasal entegratör üzerinden otomatik iletilir.',
  },
  {
    question: 'Teknik destek ve kullanıcı eğitimi süreci nasıl sağlanıyor?',
    answer: 'Devreye alma aşamasında departman bazlı uygulamalı eğitimler verilir. Canlı kullanım süresince teknik destek ekibimiz e-posta, telefon ve uzaktan erişim kanallarıyla kesintisiz destek sağlar.',
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-20 lg:py-28 bg-[#080F1E] border-t border-slate-800 text-slate-100 overflow-hidden">
      <div className="section-container">
        
        {/* Section Header */}
        <div className="max-w-3xl mb-12">
          <div className="section-label">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>SIK SORULAN SORULAR</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight mb-4">
            Aklınızdaki sorulara net yanıtlar.
          </h2>
          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl">
            ERP geçişi öncesinde veri güvenliği, kurulum aşamaları ve entegrasyon süreçlerine dair merak edilen konular.
          </p>
        </div>

        {/* Accessible Accordion List */}
        <div className="max-w-4xl space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-xl bg-[#0B1424] border border-slate-800 overflow-hidden transition-colors"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="w-full text-left p-5 sm:p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm sm:text-base font-semibold text-white">
                    {faq.question}
                  </span>
                  <span className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold transition-transform flex-shrink-0 ${
                    isOpen ? 'bg-blue-600 text-white rotate-45' : 'bg-slate-800 text-slate-400'
                  }`}>
                    +
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-6 sm:px-6 pt-1 text-xs sm:text-sm text-slate-300 leading-relaxed border-t border-slate-800/80">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
