'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

interface LiveOrder {
  id: string;
  client: string;
  amount: string;
  qty: string;
  status: string;
  statusColor: string;
  time: string;
}

const INITIAL_ORDERS: LiveOrder[] = [
  {
    id: 'SIP-4820',
    client: 'Atlas Makine A.Ş.',
    amount: '₺408.000',
    qty: '350 Ad.',
    status: 'GİB e-İrsaliye Yolda',
    statusColor: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    time: '14:24',
  },
  {
    id: 'SIP-4821',
    client: 'Tekno Metal Ltd.',
    amount: '₺185.000',
    qty: '120 Ad.',
    status: 'Üretimde (Tezgâh #3)',
    statusColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    time: '14:18',
  },
  {
    id: 'SIP-4822',
    client: 'Borusan Dağıtım',
    amount: '₺620.000',
    qty: '900 Ad.',
    status: 'Stok Kilitli (Tuzla)',
    statusColor: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    time: '14:10',
  },
];

const METRICS = [
  {
    metric: '< 2 Saniye',
    title: 'Anlık Stok Rezervasyonu',
    desc: 'Sipariş geldiği an depodaki fiziksel stok kilitlenir, çift satış riski sıfırlanır.',
    badge: 'Stok Kilidi',
  },
  {
    metric: '%100 UBL-TR',
    title: 'GİB e-Belge Entegrasyonu',
    desc: 'e-Fatura, e-İrsaliye ve e-Arşiv belgeleri Gelir İdaresi standartlarında saniyeler içinde iletilir.',
    badge: 'Yasal Uyum',
  },
  {
    metric: '5 Pazaryeri',
    title: 'Çift Yönlü Otomasyon',
    desc: 'Trendyol, Hepsiburada, Amazon ve Shopify siparişleri doğrudan ERP iş emrine dönüşür.',
    badge: 'E-Ticaret',
  },
  {
    metric: 'Sıfır Sızıntı',
    title: 'Şubeler Arası İzolasyon',
    desc: 'PostgreSQL RLS mimarisiyle şubeler sadece kendi verilerini görür, merkez konsolide eder.',
    badge: 'Güvenlik',
  },
];

const ECOSYSTEM = [
  'Gelir İdaresi Başkanlığı (GİB)',
  'Trendyol Pazaryeri',
  'Hepsiburada API',
  'Amazon Türkiye',
  'Shopify Entegrasyonu',
  'Garanti BBVA',
  'Akbank Kurumsal',
  'Türkiye İş Bankası',
  'Yurtiçi Kargo API',
  'MNG Kargo Entegrasyonu',
];

export default function Hero() {
  const [orders, setOrders] = useState<LiveOrder[]>(INITIAL_ORDERS);
  const [dailyRevenue, setDailyRevenue] = useState<number>(1213000);
  const [activeShipmentCount, setActiveShipmentCount] = useState<number>(34);
  const [notificationToast, setNotificationToast] = useState<string | null>(null);

  const openDemoChat = () => {
    window.dispatchEvent(
      new CustomEvent('openChatWithMessage', {
        detail: 'Axon ERP demo hesabı oluşturmak ve kurumsal özellikleri incelemek istiyorum.',
      })
    );
  };

  const simulateNewOrder = () => {
    const newId = `SIP-${Math.floor(4823 + Math.random() * 50)}`;
    const clients = ['Kocaman Lojistik A.Ş.', 'Ege Demir Çelik', 'Norm Civata Grubu', 'Yıldız Makine'];
    const randomClient = clients[Math.floor(Math.random() * clients.length)];
    const randomAmount = 95000 + Math.floor(Math.random() * 150000);

    const newOrder: LiveOrder = {
      id: newId,
      client: randomClient,
      amount: `₺${randomAmount.toLocaleString('tr-TR')}`,
      qty: `${100 + Math.floor(Math.random() * 200)} Ad.`,
      status: 'Tek Tıkla Kilitlendi',
      statusColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
      time: 'Şimdi',
    };

    setOrders([newOrder, ...orders.slice(0, 2)]);
    setDailyRevenue((prev) => prev + randomAmount);
    setActiveShipmentCount((prev) => prev + 1);
    setNotificationToast(`${newId} — ${randomClient} siparişi alındı, stok anında kilitlendi!`);
    setTimeout(() => setNotificationToast(null), 3000);
  };

  return (
    <section className="relative pt-24 pb-16 lg:pt-28 lg:pb-20 bg-[#0F172A] text-slate-100 overflow-hidden">
      {/* Precision hairline grid background */}
      <div className="absolute inset-0 bg-grid-dark opacity-70 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0F172A]/80 to-[#0F172A] pointer-events-none" />

      <div className="section-container relative z-10">
        
        {/* Top Two-Column Grid: Left Editorial Value Prop, Right Live Desktop ERP */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center mb-16">
          
          {/* Left Column: Authentic, Confident Editorial Headline */}
          <div className="lg:col-span-7 text-left">
            
            {/* Precision Hairline Tag */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              onClick={openDemoChat}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] text-xs text-slate-300 mb-6 cursor-pointer group transition-all duration-150"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              <span className="font-semibold text-white">Axon Enterprise v2.4</span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-300 group-hover:text-white transition-colors">
                Türkiye için Tasarlanmış Kurumsal ERP
              </span>
              <span className="text-blue-400 font-bold ml-0.5">→</span>
            </motion.div>

            {/* High-Contrast Bold Headline without rainbow gradient */}
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.06 }}
              className="text-3xl sm:text-4xl lg:text-[3.25rem] font-extrabold text-white tracking-[-0.03em] leading-[1.14] mb-6"
            >
              Kopuk programlara ve karmaşık tablolara son verin.<br />
              <span className="text-slate-400 font-normal">
                Siparişten üretime, depodan faturaya{' '}
              </span>
              <span className="text-white">
                tüm şirketiniz aynı ritimde çalışsın.
              </span>
            </motion.h1>

            {/* Grounded Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.12 }}
              className="text-base sm:text-lg text-slate-300 leading-relaxed mb-8 max-w-xl"
            >
              Teklif kabul edilirken depo stoğu ayrılsın, sevkiyat yapılırken resmi e-faturanız kesilsin. WhatsApp mesajları ve kaybolan kağıt fişler yerine, ekibinizin her gün güvenle kullanacağı modern kurumsal ERP.
            </motion.p>

            {/* Action Buttons with high craftsmanship */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.18 }}
              className="flex flex-wrap items-center gap-3.5 mb-8"
            >
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={openDemoChat}
                className="px-6 py-3 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 shadow-[0_1px_2px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.2)] transition-all cursor-pointer flex items-center gap-2"
              >
                <span>Canlı Demo Talep Edin</span>
                <span className="text-blue-200">→</span>
              </motion.button>

              <Link
                href="#workflow"
                className="px-6 py-3 rounded-lg text-sm font-semibold text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] transition-all flex items-center gap-2"
              >
                <span>Nasıl Çalışır?</span>
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </Link>
            </motion.div>

            {/* Trust Anchors */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                GİB e-Fatura & e-İrsaliye Tam Uyumlu
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                5 Pazaryeri Çift Yönlü Senkron
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                Bulut veya Kendi Sunucunuzda (On-Prem)
              </span>
            </div>
          </div>

          {/* Right Column: Authentic Desktop ERP Window */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="lg:col-span-5"
          >
            <div className="rounded-xl bg-slate-900/95 border border-slate-800 shadow-2xl shadow-slate-950/60 overflow-hidden">
              
              {/* Authentic OS Window Titlebar */}
              <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 ml-2">
                    axon-erp.internal / live
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] text-emerald-400 font-semibold font-mono">
                    Canlı Masa
                  </span>
                </div>
              </div>

              {/* KPI Bar */}
              <div className="grid grid-cols-3 border-b border-slate-800 bg-slate-900/80">
                <div className="p-3 border-r border-slate-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Bugünkü Ciro</span>
                  <div className="text-sm font-bold text-white font-mono">
                    ₺{dailyRevenue.toLocaleString('tr-TR')}
                  </div>
                  <span className="text-[9px] text-emerald-400 font-medium">Garanti Eşleşti</span>
                </div>

                <div className="p-3 border-r border-slate-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Sevkiyat</span>
                  <div className="text-sm font-bold text-white font-mono">
                    {activeShipmentCount} Sipariş
                  </div>
                  <span className="text-[9px] text-blue-400 font-medium">GİB e-İrsaliye</span>
                </div>

                <div className="p-3">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Stok Kilidi</span>
                  <div className="text-sm font-bold text-white font-mono">
                    450 Adet
                  </div>
                  <span className="text-[9px] text-purple-400 font-medium">%0 Çift Satış</span>
                </div>
              </div>

              {/* Real Operational Order Table */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Son Operasyonel Siparişler</span>
                  <button
                    onClick={simulateNewOrder}
                    className="text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-500 px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span>+ Canlı Sipariş Simüle Et</span>
                  </button>
                </div>

                {/* Toast Notification */}
                <AnimatePresence>
                  {notificationToast && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-2 rounded bg-emerald-500/15 border border-emerald-500/30 text-[11px] text-emerald-300 font-medium flex items-center justify-between"
                    >
                      <span>⚡ {notificationToast}</span>
                      <span className="text-[10px] text-emerald-400">Şimdi</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Order Rows */}
                <div className="space-y-1.5">
                  {orders.map((ord) => (
                    <div
                      key={ord.id}
                      className="p-2.5 rounded bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-slate-400 text-[11px]">{ord.id}</span>
                        <div>
                          <span className="font-medium text-white block">{ord.client}</span>
                          <span className="text-[10px] text-slate-400">{ord.qty} • Tuzla Depo</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="font-mono font-bold text-white block text-xs">{ord.amount}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border inline-block mt-0.5 ${ord.statusColor}`}>
                          {ord.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] text-slate-400">
                  <span>Atlas Metal Sanayi A.Ş. • Canlı Çalışma Alanı</span>
                  <span className="text-slate-300 font-mono">ACID Protected</span>
                </div>
              </div>

            </div>
          </motion.div>
        </div>

        {/* Clean, Non-Redundant Metric & Capabilities Ribbon */}
        <div className="pt-8 border-t border-slate-800/80">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {METRICS.map((m, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700/80 transition-all duration-150 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-black text-white font-mono tracking-tight">{m.metric}</span>
                    <span className="text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                      {m.badge}
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-slate-200 mb-1">{m.title}</h3>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Integrated Ecosystem Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400 px-2">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Yerli & Küresel Entegrasyonlar:
            </span>
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {ECOSYSTEM.map((eco, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 rounded bg-slate-900/80 border border-slate-800 text-slate-400 font-medium"
                >
                  {eco}
                </span>
              ))}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
