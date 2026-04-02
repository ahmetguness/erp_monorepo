'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const navLinks = [
  { name: 'Modüller', href: '#features' },
  { name: 'Sektörler', href: '#solutions' },
  { name: 'Kurulum', href: '#deployment' },
  { name: 'Fiyatlandırma', href: '#pricing' },
];

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeLink, setActiveLink] = useState('');

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 48);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      {/* Announcement bar kaldırıldı */}

      <header className={`fixed left-0 right-0 z-[100] transition-all duration-300 top-0`}>
        <div
          className={`transition-all duration-300 ${
            isScrolled
              ? 'mx-0 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm'
              : 'mx-4 lg:mx-8 mt-2 bg-white/10 backdrop-blur-md border border-white/15 rounded-xl shadow-lg shadow-black/10'
          }`}
        >
          <div className={`transition-all duration-300 ${isScrolled ? 'section-container' : 'px-5'}`}>
            <div className="flex items-center justify-between" style={{ height: '52px' }}>

              {/* Logo */}
              <Link href="/" className="flex items-center gap-2.5 group flex-shrink-0">
                <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500 transition-colors">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <span className={`text-[15px] font-bold tracking-tight transition-colors duration-300 ${isScrolled ? 'text-slate-900' : 'text-white'}`}>
                  Axon<span className="text-blue-400">ERP</span>
                </span>
              </Link>

              {/* Desktop Nav */}
              <nav className="hidden md:flex items-center gap-0.5">
                {navLinks.map((link) => (
                  <Link
                    key={link.name}
                    href={link.href}
                    onClick={() => setActiveLink(link.href)}
                    className={`relative px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isScrolled
                        ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {link.name}
                    {activeLink === link.href && (
                      <motion.span
                        layoutId="nav-dot"
                        className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500"
                      />
                    )}
                  </Link>
                ))}
              </nav>

              {/* Right actions */}
              <div className="flex items-center gap-2">
                <button
                  className={`hidden lg:block text-sm font-medium px-3 py-1.5 rounded-lg transition-all duration-150 ${
                    isScrolled
                      ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  Giriş Yap
                </button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className={`hidden sm:flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition-all duration-150 ${
                    isScrolled
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                      : 'bg-white text-blue-700 hover:bg-blue-50 shadow-sm'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Demo Talep Et
                </motion.button>

                {/* Mobile Toggle */}
                <button
                  className={`md:hidden w-8 h-8 flex flex-col items-center justify-center gap-1.5 rounded-lg transition-colors ${
                    isScrolled ? 'hover:bg-slate-100' : 'hover:bg-white/10'
                  }`}
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-label="Menüyü aç/kapat"
                >
                  <motion.span animate={mobileMenuOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }} style={{ width: '18px' }} className={`h-0.5 block ${isScrolled ? 'bg-slate-800' : 'bg-white'}`} />
                  <motion.span animate={mobileMenuOpen ? { opacity: 0, scaleX: 0 } : { opacity: 1, scaleX: 1 }} style={{ width: '18px' }} className={`h-0.5 block ${isScrolled ? 'bg-slate-800' : 'bg-white'}`} />
                  <motion.span animate={mobileMenuOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }} style={{ width: '18px' }} className={`h-0.5 block ${isScrolled ? 'bg-slate-800' : 'bg-white'}`} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[150] md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            <motion.nav
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.22 }}
              className="absolute right-0 top-0 bottom-0 w-64 bg-white flex flex-col shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 h-14 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <span className="font-bold text-slate-900 text-sm">AxonERP</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-col px-3 py-3 flex-1">
                {navLinks.map((link, i) => (
                  <motion.div key={link.name} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                    <Link
                      href={link.href}
                      className="flex items-center text-sm font-medium text-slate-700 hover:text-blue-600 hover:bg-blue-50 px-3 py-2.5 rounded-lg transition-colors"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      {link.name}
                    </Link>
                  </motion.div>
                ))}
              </div>

              <div className="px-4 pb-6 space-y-2 border-t border-slate-100 pt-4">
                <button className="w-full btn-primary py-2.5 flex items-center justify-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Demo Talep Et
                </button>
                <button className="w-full btn-secondary py-2.5">Giriş Yap</button>
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
