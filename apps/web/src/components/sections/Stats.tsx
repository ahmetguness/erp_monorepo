'use client';

import { motion, useInView, useMotionValue, useSpring } from 'framer-motion';
import { useEffect, useRef } from 'react';

function Counter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    damping: 30,
    stiffness: 100,
  });
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  useEffect(() => {
    if (isInView) {
      motionValue.set(value);
    }
  }, [isInView, value, motionValue]);

  useEffect(() => {
    return springValue.on("change", (latest) => {
      if (ref.current) {
        ref.current.textContent = Intl.NumberFormat("en-US").format(Math.floor(latest as number)) + suffix;
      }
    });
  }, [springValue, suffix]);

  return <span ref={ref} />;
}

export default function Stats() {
  const stats = [
    { label: 'Yıllık Tecrübe', value: 25, suffix: '+' },
    { label: 'Aktif Kullanıcı', value: 50000, suffix: '+' },
    { label: 'Uzman Personel', value: 1500, suffix: '+' },
    { label: 'Entegre Modül', value: 100, suffix: '+' }
  ];

  return (
    <section className="section-spacing bg-white">
      <div className="section-container">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-24">
          {stats.map((s, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: idx * 0.1 }}
              className="text-center space-y-4"
            >
              <div className="text-4xl lg:text-7xl font-black text-blue-700 tracking-tighter">
                <Counter value={s.value} suffix={s.suffix} />
              </div>
              <div className="text-sm lg:text-base font-black text-slate-400 uppercase tracking-[0.2em]">
                {s.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
