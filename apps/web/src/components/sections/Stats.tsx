'use client';

import { motion, useInView, useMotionValue, useSpring } from 'framer-motion';
import { useEffect, useRef } from 'react';

function Counter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { damping: 30, stiffness: 80 });
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  useEffect(() => {
    if (isInView) motionValue.set(value);
  }, [isInView, value, motionValue]);

  useEffect(() => {
    return springValue.on('change', (latest) => {
      if (ref.current) {
        ref.current.textContent = Intl.NumberFormat('tr-TR').format(Math.floor(latest as number)) + suffix;
      }
    });
  }, [springValue, suffix]);

  return <span ref={ref} />;
}

const stats = [
  { label: 'Yıllık sektör deneyimi', value: 15, suffix: '+' },
  { label: 'Aktif müşteri işletme', value: 2400, suffix: '+' },
  { label: 'Kurulu modül', value: 18, suffix: '' },
  { label: 'Teknik destek uzmanı', value: 85, suffix: '+' },
];

export default function Stats() {
  return (
    <section className="py-12 bg-slate-50 border-y border-slate-200">
      <div className="section-container">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {stats.map((s, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.07 }}
              className="text-center"
            >
              <div className="text-2xl lg:text-3xl font-bold text-slate-900 mb-1">
                <Counter value={s.value} suffix={s.suffix} />
              </div>
              <div className="text-sm text-slate-500">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
