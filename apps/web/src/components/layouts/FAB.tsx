'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

export default function FAB() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          initial={{ opacity: 0, y: 50, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.8 }}
          className="fixed bottom-8 right-8 z-[100] flex flex-col items-end gap-4"
        >
          <div className="bg-white border-2 border-blue-700 px-6 py-3 rounded-full shadow-2xl text-xs font-black text-blue-700 uppercase tracking-widest hidden md:block">
            Sizi Arayalım mı?
          </div>
          <button 
            className="w-16 h-16 bg-blue-700 text-white rounded-full flex items-center justify-center shadow-2xl hover:bg-blue-800 transition-all active:scale-95 group relative"
            aria-label="İletişime Geçin"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform">📞</span>
            <span className="absolute inset-0 rounded-full bg-blue-700 animate-ping opacity-20 pointer-events-none" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
