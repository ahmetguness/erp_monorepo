'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ROI() {
  const [employees, setEmployees] = useState(50);
  const [savings, setSavings] = useState(0);

  useEffect(() => {
    const calculated = employees * 500;
    setSavings(calculated);
  }, [employees]);

  return (
    <section className="section-spacing relative bg-white overflow-hidden">
      <div className="section-container">
        <div className="relative bg-slate-950 rounded-[4rem] p-12 lg:p-32 overflow-hidden border border-white/10 shadow-[0_100px_200px_-50px_rgba(0,0,0,0.5)]">
          
          {/* Animated Background Gradients */}
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
              rotate: [0, 45, 0]
            }}
            transition={{ duration: 10, repeat: Infinity }}
            className="absolute -top-1/4 -right-1/4 w-[800px] h-[800px] bg-blue-600/30 blur-[150px] rounded-full pointer-events-none" 
          />
          <motion.div 
            animate={{ 
              scale: [1, 1.1, 1],
              opacity: [0.2, 0.4, 0.2],
              rotate: [0, -30, 0]
            }}
            transition={{ duration: 15, repeat: Infinity, delay: 2 }}
            className="absolute -bottom-1/4 -left-1/4 w-[600px] h-[600px] bg-indigo-900/40 blur-[120px] rounded-full pointer-events-none" 
          />

          <div className="flex flex-col lg:flex-row items-center justify-between gap-20 relative z-10">
            <header className="flex-1 space-y-12">
              <div className="inline-flex items-center gap-3 px-6 py-2 bg-white/5 rounded-full border border-white/10 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-[10px] font-black text-white uppercase tracking-[0.4em]">Stratejik Analiz</span>
              </div>
              
              <h2 className="text-5xl lg:text-8xl font-black text-white tracking-tighter uppercase italic leading-[0.85]">
                İşletmenizi <br/>
                <span className="text-blue-500 not-italic">Hızlandırın</span>
              </h2>
              
              <p className="text-xl text-slate-400 font-medium leading-relaxed max-w-xl italic">
                Dijitalleşme sadece bir tercih değil, bir karlılık stratejisidir. 
                Axon ERP ile ekiplerinizin operasyonel yükünü minimize edin.
              </p>
              
              <div className="pt-8">
                <button className="group relative bg-white text-slate-950 px-16 py-6 rounded-2xl text-lg font-black uppercase tracking-widest transition-all hover:bg-blue-600 hover:text-white hover:shadow-[0_30px_100px_rgba(37,99,235,0.4)] active:scale-95 shadow-2xl">
                  DETAYLI ANALİZ İSTE
                </button>
              </div>
            </header>

            <div className="flex-1 w-full max-w-[600px] bg-white/5 backdrop-blur-3xl border border-white/10 p-12 lg:p-20 rounded-[3rem] space-y-16 shadow-[0_50px_150px_-30px_rgba(0,0,0,0.5)]">
              <div className="space-y-8">
                <div className="flex justify-between items-end">
                  <div>
                    <label htmlFor="employees" className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500 mb-4 block leading-none">Personel Sayısı</label>
                    <div className="text-5xl font-black text-white tracking-tighter italic">{employees}</div>
                  </div>
                  <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-2xl border border-white/10">👥</div>
                </div>
                
                <input 
                  id="employees"
                  type="range" 
                  min="5" 
                  max="500" 
                  value={employees} 
                  onChange={(e) => setEmployees(parseInt(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
                />
              </div>

              <div className="pt-16 border-t border-white/10 relative overflow-hidden group">
                <div className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-500 mb-6 block leading-none italic">Aylık Tahmini Tasarruf</div>
                
                <AnimatePresence mode="wait">
                  <motion.div 
                    key={savings}
                    initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -20, filter: 'blur(10px)' }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-4"
                  >
                    <div className="text-6xl lg:text-8xl font-black text-white tracking-tighter italic">
                      {Intl.NumberFormat('en-US').format(employees * 20)} <span className="text-2xl text-blue-500 uppercase tracking-widest not-italic leading-none">Saat</span>
                    </div>
                    <div className="text-3xl font-black text-blue-500 tracking-tighter uppercase italic leading-none">
                      ≈ ${Intl.NumberFormat('en-US').format(savings)} <span className="text-sm text-slate-500 tracking-widest leading-none">USD</span>
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* Decorative Accent */}
                <div className="absolute right-0 bottom-0 opacity-10 group-hover:opacity-20 transition-opacity">
                  <div className="text-[10rem] font-black italic translate-x-1/4 translate-y-1/4 select-none">%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

