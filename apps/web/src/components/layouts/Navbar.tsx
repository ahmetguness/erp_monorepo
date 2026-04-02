'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logoImg from '@/assets/logo/logo.png';

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Özellikler', href: '#features' },
    { name: 'Sektörler', href: '#solutions' },
    { name: 'Neden Biz', href: '#why-us' },
    { name: 'Fiyatlandırma', href: '#pricing' },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-[100] px-4 md:px-6 py-6 md:py-8 pointer-events-none">
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={`mx-auto max-w-7xl pointer-events-auto transition-all duration-700 ${
          isScrolled 
            ? 'bg-white/80 backdrop-blur-2xl border border-white/20 py-3 md:py-4 px-6 md:px-8 rounded-2xl md:rounded-[2rem] shadow-2xl scale-[0.98]' 
            : 'bg-transparent py-4 px-4 scale-100'
        }`}
      >
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="group flex items-center gap-3">
            <div className="w-10 h-10 relative overflow-hidden rounded-xl bg-slate-900 flex items-center justify-center group-hover:scale-105 transition-transform duration-500 shadow-lg">
              <Image 
                src={logoImg} 
                alt="Axon Logo" 
                fill 
                className="object-contain p-1.5"
              />
            </div>
            <span className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic">
              Axon<span className="text-blue-700 not-italic group-hover:text-slate-900 transition-colors">ERP</span>
            </span>
          </Link>
          
          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-10">
            {navLinks.map((link) => (
              <Link 
                key={link.name}
                href={link.href} 
                className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] hover:text-blue-700 transition-all relative group"
              >
                {link.name}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-blue-700 transition-all group-hover:w-full" />
              </Link>
            ))}
          </nav>

          {/* CTA Buttons */}
          <div className="flex items-center gap-2 md:gap-4">
            <button className="hidden lg:block text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">
              Müşteri Girişi
            </button>
            <button className={`${
              isScrolled ? 'bg-blue-700' : 'bg-slate-900'
            } hidden sm:block text-white px-6 md:px-8 py-3 md:py-3.5 rounded-xl text-[10px] font-black hover:bg-blue-800 transition-all shadow-xl shadow-blue-900/10 uppercase tracking-[0.15em] leading-none active:scale-95`}>
              DEMO TALEBİ
            </button>
            
            {/* Mobile Menu Toggle */}
            <button 
              className="md:hidden w-10 h-10 flex flex-col items-center justify-center gap-1.5 pointer-events-auto"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Menu"
            >
              <div className={`w-6 h-0.5 bg-slate-900 transition-all duration-300 ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <div className={`w-6 h-0.5 bg-slate-900 transition-all duration-300 ${mobileMenuOpen ? 'opacity-0 scale-0' : ''}`} />
              <div className={`w-6 h-0.5 bg-slate-900 transition-all duration-300 ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Mobile Menu Backdrop */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-md z-[150] md:hidden pointer-events-auto"
            onClick={() => setMobileMenuOpen(false)}
          >
            <motion.nav 
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="absolute right-0 top-0 bottom-0 w-[85%] max-w-sm bg-white p-8 md:p-12 flex flex-col shadow-[-20px_0_60px_rgba(0,0,0,0.1)] border-l border-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-16">
                <div className="text-xl font-black text-slate-900 tracking-tighter uppercase italic">MENÜ</div>
                <button 
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-10 h-10 flex items-center justify-center text-2xl font-light hover:rotate-90 transition-transform"
                >
                  ✕
                </button>
              </div>

              <div className="flex flex-col gap-8">
                {navLinks.map((link, i) => (
                  <motion.div
                    key={link.name}
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <Link 
                      href={link.href} 
                      className="text-3xl font-black text-slate-900 uppercase italic hover:text-blue-700 transition-colors tracking-tight flex items-center justify-between group"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {link.name}
                      <span className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
                    </Link>
                  </motion.div>
                ))}
              </div>

              <div className="mt-auto space-y-4">
                <button className="w-full bg-blue-700 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-blue-900/20 active:scale-95 transition-all">
                  DEMO TALEBİ
                </button>
                <div className="flex gap-4">
                  <button className="flex-1 border border-slate-200 py-4 rounded-xl font-black uppercase tracking-widest text-[10px] text-slate-600 hover:bg-slate-50 transition-colors">
                    GİRİŞ
                  </button>
                  <button className="flex-1 border border-slate-200 py-4 rounded-xl font-black uppercase tracking-widest text-[10px] text-slate-600 hover:bg-slate-50 transition-colors">
                    YARDIM
                  </button>
                </div>
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

