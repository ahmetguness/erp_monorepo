'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface NavItem {
  name: string;
  href: string;
  subItems?: { name: string; desc: string; href: string }[];
}

const navItems: NavItem[] = [
  {
    name: 'Ürün',
    href: '#features',
    subItems: [
      { name: 'Modül Kataloğu', desc: 'Tedarik, üretim, satış ve finans modülleri', href: '#features' },
      { name: 'Süreç Akışı', desc: 'Tekliften muhasebeye kesintisiz veri aktarımı', href: '#workflow' },
      { name: 'Entegrasyonlar', desc: 'GİB e-Belge, pazaryerleri ve banka ekstreleri', href: '#integrations' },
      { name: 'Yetki & Güvenlik', desc: 'Rol bazlı erişim ve şube veri izolasyonu', href: '#security' },
    ],
  },
  { name: 'Çözümler', href: '#workflow' },
  { name: 'Sektörler', href: '#sectors' },
  { name: 'Fiyatlandırma', href: '#pricing' },
];

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 32);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleDemoClick = () => {
    window.dispatchEvent(
      new CustomEvent('openChatWithMessage', { detail: 'Axon ERP canlı demo hesabı talep etmek istiyorum.' })
    );
  };

  return (
    <>
      <header className="fixed left-0 right-0 z-[100] top-0 transition-all duration-200">
        <div
          className={`transition-all duration-200 ${
            isScrolled
              ? 'bg-[#080F1E]/90 backdrop-blur-md border-b border-white/[0.08] shadow-xl shadow-black/30'
              : 'bg-[#080F1E]/60 backdrop-blur-sm border-b border-white/[0.05]'
          }`}
        >
          <div className="section-container">
            <div className="flex items-center justify-between h-14 sm:h-16">
              
              {/* Brand Logo */}
              <Link href="/" className="flex items-center gap-2.5 group flex-shrink-0">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500 transition-colors shadow-sm shadow-blue-500/20">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold tracking-tight text-white">
                    Axon<span className="text-blue-400 font-extrabold">ERP</span>
                  </span>
                  <span className="hidden sm:inline-block text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                    Kurumsal
                  </span>
                </div>
              </Link>

              {/* Simplified Desktop Navigation (4 Items) */}
              <nav className="hidden md:flex items-center gap-1">
                {navItems.map((item) => (
                  <div
                    key={item.name}
                    className="relative"
                    onMouseEnter={() => item.subItems && setProductDropdownOpen(true)}
                    onMouseLeave={() => item.subItems && setProductDropdownOpen(false)}
                  >
                    <Link
                      href={item.href}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.05] transition-all duration-150 inline-flex items-center gap-1"
                    >
                      <span>{item.name}</span>
                      {item.subItems && (
                        <svg
                          className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${
                            productDropdownOpen ? 'rotate-180 text-blue-400' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </Link>

                    {/* Submenu Dropdown for 'Ürün' */}
                    {item.subItems && (
                      <AnimatePresence>
                        {productDropdownOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 6 }}
                            transition={{ duration: 0.15 }}
                            className="absolute top-full left-0 mt-1 w-64 p-2 bg-[#0B1424] border border-slate-700/80 rounded-xl shadow-2xl z-50"
                          >
                            {item.subItems.map((sub) => (
                              <Link
                                key={sub.name}
                                href={sub.href}
                                onClick={() => setProductDropdownOpen(false)}
                                className="block p-2.5 rounded-lg hover:bg-white/[0.04] transition-colors group/sub"
                              >
                                <div className="text-xs font-semibold text-slate-200 group-hover/sub:text-blue-400 transition-colors">
                                  {sub.name}
                                </div>
                                <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                                  {sub.desc}
                                </div>
                              </Link>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    )}
                  </div>
                ))}
              </nav>

              {/* Right Action Group */}
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="hidden sm:block text-xs font-medium text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
                >
                  Giriş Yap
                </Link>

                <button
                  onClick={handleDemoClick}
                  className="btn-primary flex items-center gap-1.5 text-xs py-2 px-3.5 cursor-pointer"
                >
                  <span>Canlı Demo İsteyin</span>
                  <span className="text-blue-200">→</span>
                </button>

                {/* Mobile Hamburger Toggle */}
                <button
                  className="md:hidden w-9 h-9 flex flex-col items-center justify-center gap-1 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-label="Menüyü aç/kapat"
                >
                  <span className={`w-4 h-0.5 bg-slate-200 transition-transform ${mobileMenuOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
                  <span className={`w-4 h-0.5 bg-slate-200 transition-opacity ${mobileMenuOpen ? 'opacity-0' : ''}`} />
                  <span className={`w-4 h-0.5 bg-slate-200 transition-transform ${mobileMenuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
                </button>
              </div>

            </div>
          </div>
        </div>
      </header>

      {/* Responsive Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150] md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            <motion.nav
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.22 }}
              className="absolute right-0 top-0 bottom-0 w-72 bg-[#0B1424] border-l border-slate-800 flex flex-col shadow-2xl p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <span className="font-bold text-white text-sm">Axon ERP</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.05]"
                  aria-label="Kapat"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-col py-4 flex-1 space-y-1 overflow-y-auto">
                <Link
                  href="#features"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.04]"
                >
                  Ürün & Modüller
                </Link>
                <Link
                  href="#workflow"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.04]"
                >
                  Süreç Akışı
                </Link>
                <Link
                  href="#sectors"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.04]"
                >
                  Sektörel Çözümler
                </Link>
                <Link
                  href="#pricing"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.04]"
                >
                  Fiyatlandırma
                </Link>
                <Link
                  href="#security"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.04]"
                >
                  Yetki & Güvenlik
                </Link>
                <Link
                  href="#deployment"
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/[0.04]"
                >
                  Kurulum Seçenekleri
                </Link>
              </div>

              <div className="pt-4 border-t border-slate-800 space-y-2">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleDemoClick();
                  }}
                  className="w-full btn-primary text-xs py-2.5 justify-center flex items-center gap-1.5"
                >
                  <span>Canlı Demo İsteyin</span>
                  <span>→</span>
                </button>
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full btn-secondary text-xs py-2.5 text-center block"
                >
                  Giriş Yap
                </Link>
              </div>
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
