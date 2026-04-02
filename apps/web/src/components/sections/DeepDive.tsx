'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const modules = [
  {
    id: 'accounting',
    title: 'Muhasebe & Finans',
    icon: '💳',
    features: [
      'Genel Muhasebe & Beyanname',
      'Nakit Akış Yönetimi',
      'E-Fatura & E-Arşiv Entegrasyonu',
      'Banka & Post Hesap Takibi',
      'Maliyet Muhasebesi'
    ],
    highlight: 'Finansal süreçlerinizi %100 dijitalleştirin, hata payını sıfıra indirin.'
  },
  {
    id: 'crm',
    title: 'CRM & Satış',
    icon: '🤝',
    features: [
      'Müşteri Sadakati & Takibi',
      'Satış Fırsatları (Pipeline)',
      'Kampanya Yönetimi',
      'Saha Satış Otomasyonu',
      'Satış Sonrası Destek'
    ],
    highlight: 'Müşteri ilişkilerinizi veriye dayalı yöneterek satışlarınızı artırın.'
  },
  {
    id: 'production',
    title: 'Üretim & Planlama',
    icon: '🏭',
    features: [
      'Kaynak Planlama (MRP)',
      'İş Emirleri & Takibi',
      'Kalite Kontrol Süreçleri',
      'Fason Takibi',
      'Makine Verimlilik Analizi'
    ],
    highlight: 'Üretim bandınızı dijital ikizinizle takip edin, verimliliği maksimize edin.'
  }
];

export default function DeepDive() {
  const [activeTab, setActiveTab] = useState(modules[0].id);

  const activeModule = modules.find(m => m.id === activeTab)!;

  return (
    <section className="section-spacing bg-slate-50 border-y border-slate-100">
      <div className="section-container">
        <header className="text-center max-w-3xl mx-auto mb-20 space-y-4">
          <h2 className="text-4xl lg:text-6xl font-black text-slate-900 tracking-tight">Çözümlerimize Yakından Bakın</h2>
          <p className="text-xl text-slate-600 font-medium">İşletmenizin derin operasyonel ihtiyaçları için detaylandırılmış kurumsal modüller.</p>
        </header>
        
        <div className="flex flex-col lg:flex-row gap-16 items-start">
          {/* Tabs Sidebar */}
          <nav className="w-full lg:w-1/3 flex flex-col gap-2">
            {modules.map((m) => (
              <button
                key={m.id}
                onClick={() => setActiveTab(m.id)}
                className={`text-left p-8 rounded-xl border-2 transition-all duration-300 relative overflow-hidden group ${
                  activeTab === m.id 
                  ? 'bg-white border-blue-600 shadow-xl shadow-blue-900/5' 
                  : 'bg-transparent border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-6">
                  <span className={`text-3xl transition-transform duration-300 ${activeTab === m.id ? 'scale-110' : 'grayscale opacity-40'}`}>
                    {m.icon}
                  </span>
                  <div>
                    <h3 className={`font-black uppercase tracking-widest text-sm ${activeTab === m.id ? 'text-blue-700' : 'text-slate-500'}`}>
                      {m.title}
                    </h3>
                    <p className="text-slate-400 text-xs font-bold mt-1 uppercase tracking-wider">Detayları İncele →</p>
                  </div>
                </div>
                {activeTab === m.id && (
                  <motion.div layoutId="activeTab" className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600" />
                )}
              </button>
            ))}
          </nav>

          {/* Content Area */}
          <div className="flex-1 w-full bg-white rounded-3xl border-2 border-slate-200 p-12 lg:p-20 shadow-2xl relative overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.5 }}
                className="space-y-12"
              >
                <div className="space-y-6">
                  <h4 className="text-3xl lg:text-4xl font-black text-slate-900 tracking-tight">{activeModule.title}</h4>
                  <p className="text-xl text-blue-700 font-bold leading-relaxed max-w-2xl italic border-l-4 border-blue-600 pl-6 uppercase tracking-tight">
                    {activeModule.highlight}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {activeModule.features.map((f, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-center gap-4 text-slate-600 font-bold"
                    >
                      <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0" />
                      <span className="text-lg tracking-tight">{f}</span>
                    </motion.div>
                  ))}
                </div>

                <div className="pt-8 border-t border-slate-100 flex flex-col sm:flex-row gap-6">
                  <button className="bg-slate-900 text-white px-8 py-4 rounded text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all">Modül Broşürünü İndir</button>
                  <button className="text-blue-700 font-black text-xs uppercase tracking-widest hover:underline decoration-2 underline-offset-8">Özellik Listesini Karşılaştır →</button>
                </div>
              </motion.div>
            </AnimatePresence>
            
            {/* Subtle decor */}
            <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-slate-50 rounded-full flex items-center justify-center text-slate-100 text-[10rem] font-black select-none pointer-events-none">
              {activeModule.icon}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
