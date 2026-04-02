'use client';

import Image from 'next/image';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { useState, useEffect, useRef } from 'react';

const slides = [
  {
    image: '/gs.jpg',
    title: 'Görsel Vizyon',
    subtitle: 'Derin Estetik',
    desc: 'İşletmenizin geleceğini en üst düzey görsel standartlarla ve sınırsız esneklikle şekillendirin.',
    cards: [
      { text: 'Verimlilik: %98', icon: '📈', x: -280, y: -120, delay: 0.2 },
      { text: 'Sistem: Aktif', icon: '⚡', x: 250, y: 80, delay: 0.4 }
    ]
  },
  {
    image: '/guts.jpg',
    title: 'Güç ve Direnç',
    subtitle: 'Sarsılmaz Altyapı',
    desc: 'Zorlu operasyonel süreçlerinizi en dayanıklı ve ölçeklenebilir teknolojiyle yönetin.',
    cards: [
      { text: 'Güvenlik: Tam', icon: '🛡️', x: -220, y: 100, delay: 0.2 },
      { text: 'Bulut: Global', icon: '🌍', x: 280, y: -80, delay: 0.4 }
    ]
  },
  {
    image: '/guts2.jpg',
    title: 'Sınırları Zorlayın',
    subtitle: 'Nihai Performans',
    desc: 'Kurumsal sınırların ötesine geçen performans odaklı sistem mimarisi.',
    cards: [
      { text: 'Hız: <10ms', icon: '🚀', x: -240, y: -150, delay: 0.2 },
      { text: 'ROI: 4.5X', icon: '💎', x: 220, y: 120, delay: 0.4 }
    ]
  }
];

export default function Hero() {
  const [current, setCurrent] = useState(0);
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"]
  });

  const opacityScroll = useTransform(scrollYProgress, [0, 0.4], [1, 0]);
  const scaleScroll = useTransform(scrollYProgress, [0, 0.4], [1, 0.95]);
  const yScroll = useTransform(scrollYProgress, [0, 0.4], [0, 100]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section ref={containerRef} className="relative min-h-screen flex flex-col justify-center pt-32 pb-24 overflow-hidden bg-white">
      
      {/* 🌌 Atmospheric Mesh System */}
      <div className="mesh-container">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            x: [0, 50, 0],
            y: [0, -30, 0]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="mesh-sphere w-[800px] h-[800px] bg-blue-600/30 -top-1/4 -left-1/4"
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.3, 1],
            x: [0, -60, 0],
            y: [0, 40, 0]
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 1 }}
          className="mesh-sphere w-[700px] h-[700px] bg-indigo-500/20 top-1/2 -right-1/4"
        />
      </div>

      <div className="section-container relative z-10">
        <div className="flex flex-col items-center text-center">
          
          {/* Trust Badge & Indicators */}
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 md:gap-6 mb-8 md:mb-12"
          >
            <div className="inline-flex items-center gap-2 md:gap-3 px-4 md:px-6 py-2 bg-slate-900/5 rounded-full border border-slate-900/10 backdrop-blur-md">
              <span className="flex h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
              <span className="text-[8px] md:text-[10px] font-black text-slate-900 uppercase tracking-[0.2em] md:tracking-[0.3em]">
                Enterprise Edition 2024
              </span>
            </div>
            
            <div className="flex gap-2">
              {slides.map((_, i) => (
                <button 
                  key={i} 
                  onClick={() => setCurrent(i)}
                  className={`h-1 rounded-full transition-all duration-700 ${
                    i === current ? 'w-8 md:w-12 bg-blue-700' : 'w-2 md:w-3 bg-slate-200 hover:bg-slate-300'
                  }`}
                />
              ))}
            </div>
          </motion.div>
 
          {/* Cinematic Headline */}
          <motion.div 
            style={{ opacity: opacityScroll, y: yScroll }}
            className="relative mb-16 md:mb-24 w-full px-2"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                initial={{ opacity: 0, filter: 'blur(20px)', scale: 1.1 }}
                animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
                exit={{ opacity: 0, filter: 'blur(20px)', scale: 0.9 }}
                transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-6 md:space-y-10"
              >
                <h1 className="text-4xl sm:text-6xl md:text-8xl lg:text-[9rem] font-black text-slate-900 leading-[0.9] md:leading-[0.8] tracking-[-0.04em] uppercase italic perspective-1000">
                  {slides[current].title} <br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-600 not-italic tracking-[-0.06em]">
                    {slides[current].subtitle}
                  </span>
                </h1>
                
                <p className="text-sm md:text-xl lg:text-2xl text-slate-500 font-medium max-w-4xl mx-auto leading-relaxed italic tracking-tight px-4">
                  {slides[current].desc}
                </p>
 
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6 pt-4 md:pt-8">
                  <button className="btn-premium-primary group w-full sm:w-auto">
                    <span className="relative z-10">HEMEN BAŞLAYIN</span>
                    <motion.div 
                      className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </button>
                  <button className="btn-premium-secondary flex items-center justify-center gap-3 w-full sm:w-auto">
                    <span className="text-xl">▷</span> TANITIMI İZLE
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
          
          {/* Dashboard Showpiece */}
          <motion.div 
            style={{ scale: scaleScroll }}
            className="w-full max-w-[1200px] relative mt-8 md:mt-12 px-2 md:px-4"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={current}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -40 }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Floating Meta Cards */}
                {slides[current].cards.map((card, i) => (
                  <motion.div
                    key={i}
                    animate={{ y: [0, -15, 0], rotate: [0, 1, 0] }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
                    className="absolute hidden lg:flex items-center gap-4 glass-card p-5 z-20"
                    style={{ left: `calc(50% + ${card.x}px)`, top: `calc(50% + ${card.y}px)` }}
                  >
                    <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-2xl shadow-xl">
                      {card.icon}
                    </div>
                    <div className="flex flex-col items-start pr-4">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">
                        {card.text.split(':')[0]}
                      </span>
                      <span className="text-base font-black text-slate-900 tracking-tight leading-none italic uppercase">
                        {card.text.split(':')[1]}
                      </span>
                    </div>
                  </motion.div>
                ))}
 
                {/* Main Visual Container */}
                <div className="relative p-1 md:p-2 bg-gradient-to-b from-white/80 to-white/20 rounded-2xl md:rounded-[3rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] md:shadow-[0_80px_150px_-30px_rgba(0,0,0,0.15)] border border-white/40">
                  <div className="overflow-hidden rounded-xl md:rounded-[2.5rem] bg-slate-100 aspect-video">
                    <Image 
                      src={slides[current].image} 
                      alt={slides[current].title} 
                      width={1600} 
                      height={900} 
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-[2000ms]"
                      priority
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/20 to-transparent pointer-events-none" />
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      {/* Scroll Hint */}
      <motion.div 
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 opacity-30"
      >
        <span className="text-[9px] font-black text-slate-900 uppercase tracking-[0.5em] italic">KEŞFEDİN</span>
        <div className="w-px h-12 bg-gradient-to-b from-blue-600 to-transparent" />
      </motion.div>
    </section>
  );
}
