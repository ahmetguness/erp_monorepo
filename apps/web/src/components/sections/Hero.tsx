'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

interface DemoOrder {
  id: string;
  client: string;
  item: string;
  qty: string;
  status: string;
  statusStyle: string;
  time: string;
}

const INITIAL_DEMO_ORDERS: DemoOrder[] = [
  {
    id: 'SIP-4820',
    client: 'Atlas Makine A.Ş.',
    item: 'Endüstriyel Pompa',
    qty: '350 Adet',
    status: 'Sevk Bekliyor',
    statusStyle: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    time: '14:24',
  },
  {
    id: 'SIP-4821',
    client: 'Tekno Metal Ltd.',
    item: 'Hidrolik Valf Takımı',
    qty: '120 Adet',
    status: 'Üretimde',
    statusStyle: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    time: '14:18',
  },
  {
    id: 'SIP-4822',
    client: 'Borusan Dağıtım',
    item: 'Flanş Bağlantı Kiti',
    qty: '900 Adet',
    status: 'Stok Kilitlendi',
    statusStyle: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    time: '14:10',
  },
];

export default function Hero() {
  const [orders, setOrders] = useState<DemoOrder[]>(INITIAL_DEMO_ORDERS);
  const [simulationToast, setSimulationToast] = useState<string | null>(null);

  const handleDemoClick = () => {
    window.dispatchEvent(
      new CustomEvent('openChatWithMessage', {
        detail: 'Axon ERP canlı demo hesabı oluşturmak ve kurumsal özellikleri incelemek istiyorum.',
      })
    );
  };

  const simulateNewOrder = () => {
    const newId = `SIP-${Math.floor(4823 + Math.random() * 50)}`;
    const sampleClients = [
      'Kocaman Lojistik A.Ş.',
      'Ege Çelik Endüstri',
      'Norm Mekanik Grubu',
      'Yıldız Makine Sanayi',
    ];
    const client = sampleClients[Math.floor(Math.random() * sampleClients.length)];

    const newOrder: DemoOrder = {
      id: newId,
      client,
      item: 'Özel İmalat Yedek Parça',
      qty: `${100 + Math.floor(Math.random() * 250)} Adet`,
      status: 'Stok Kilitlendi',
      statusStyle: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      time: 'Şimdi',
    };

    setOrders([newOrder, ...orders.slice(0, 2)]);
    setSimulationToast(`${newId} kodlu yeni sipariş onaylandı, stok depoda anında rezerve edildi.`);
    setTimeout(() => setSimulationToast(null), 3500);
  };

  return (
    <section className="relative pt-28 pb-16 lg:pt-36 lg:pb-24 bg-[#080F1E] text-slate-100 overflow-hidden">
      {/* Precision hairline grid background */}
      <div className="absolute inset-0 bg-grid-dark opacity-60 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#080F1E]/70 to-[#080F1E] pointer-events-none" />

      <div className="section-container relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          
          {/* Left Column: Business-Focused Value Narrative */}
          <div className="lg:col-span-6 text-left">
            
            {/* Eyebrow */}
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-slate-300 mb-6"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span>Modern işletmeler için yeni nesil ERP</span>
            </motion.div>

            {/* High-Contrast Bold Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 }}
              className="text-3xl sm:text-4xl lg:text-[3.25rem] font-extrabold text-white tracking-[-0.03em] leading-[1.12] mb-6"
            >
              Üretimden faturaya tüm işletmenizi tek sistemden yönetin.
            </motion.h1>

            {/* Clean, Grounded Business Description (No Technical Acronym Clutter) */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="text-base sm:text-lg text-slate-300 leading-relaxed mb-8 max-w-xl"
            >
              Sipariş, stok, üretim, satın alma, sevkiyat ve finans süreçlerinizi tek platformda birleştirin. Kopuk programlar ve kaybolan tablolara son vererek tüm ekibinizi aynı güncel veri üzerinde buluşturun.
            </motion.p>

            {/* Consistent Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="flex flex-wrap items-center gap-3.5 mb-8"
            >
              <button
                onClick={handleDemoClick}
                className="btn-primary px-6 py-3 text-sm font-semibold flex items-center gap-2 cursor-pointer"
              >
                <span>Canlı Demo İsteyin</span>
                <span className="text-blue-200">→</span>
              </button>

              <Link
                href="#workflow"
                className="btn-secondary px-6 py-3 text-sm font-semibold flex items-center gap-2"
              >
                <span>Nasıl Çalıştığını Görün</span>
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </Link>
            </motion.div>

            {/* Trust Points */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                Uçtan uca entegre süreç yönetimi
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Bulut veya şirket içi kurulum seçeneği
              </span>
            </div>
          </div>

          {/* Right Column: Clean, Authentic Product Window with 2 Supporting Status Indicators */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, delay: 0.12 }}
            className="lg:col-span-6 relative"
          >
            {/* Supporting Card 1 (Stok Durumu) - Top Right */}
            <div className="hidden sm:flex items-center gap-3 absolute -top-4 -right-2 z-20 px-3.5 py-2.5 rounded-lg bg-[#0B1424] border border-slate-700/80 shadow-xl shadow-black/40 text-xs">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">Tuzla Merkez Depo</span>
                <span className="font-semibold text-white">850 Adet Serbest Stok</span>
              </div>
            </div>

            {/* Supporting Card 2 (Sipariş/Üretim Durumu) - Bottom Left */}
            <div className="hidden sm:flex items-center gap-3 absolute -bottom-4 -left-3 z-20 px-3.5 py-2.5 rounded-lg bg-[#0B1424] border border-slate-700/80 shadow-xl shadow-black/40 text-xs">
              <div className="w-2 h-2 rounded-full bg-blue-400" />
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">Üretim Durumu</span>
                <span className="font-semibold text-white">12 Aktif İş Emri • Sevk Bekliyor</span>
              </div>
            </div>

            {/* Main Product Window */}
            <div className="rounded-xl bg-[#0B1424] border border-slate-800 shadow-2xl shadow-black/50 overflow-hidden relative z-10">
              
              {/* Window Titlebar */}
              <div className="px-4 py-3 bg-[#060B15] border-b border-slate-800/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 ml-2">
                    Axon ERP • Operasyon Konsolu
                  </span>
                </div>

                <span className="text-[10px] text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.08]">
                  Örnek Görünüm
                </span>
              </div>

              {/* Order Console Table */}
              <div className="p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Son Operasyonel Kayıtlar</span>
                  <button
                    onClick={simulateNewOrder}
                    className="text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-500 px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span>+ Örnek Sipariş Ekle</span>
                  </button>
                </div>

                {/* Simulated Notification Toast */}
                <AnimatePresence>
                  {simulationToast && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-2.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 font-medium flex items-center justify-between"
                    >
                      <span>⚡ {simulationToast}</span>
                      <span className="text-[10px] text-emerald-400 font-mono">Şimdi</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Order Rows */}
                <div className="space-y-2">
                  {orders.map((ord) => (
                    <div
                      key={ord.id}
                      className="p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-400 text-[11px] font-semibold">{ord.id}</span>
                          <span className="font-medium text-white">{ord.client}</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {ord.item} • {ord.qty}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded border inline-block ${ord.statusStyle}`}>
                          {ord.status}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 block mt-1">{ord.time}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400">
                  <span>Tek tıkla irsaliye ve fatura dönüşümü</span>
                  <span className="text-slate-300 font-medium">Tek Sistem, Tek Veri</span>
                </div>
              </div>

            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
