'use client';

import { motion } from 'framer-motion';

export default function Trust() {
  const stats = [
    { label: 'YILLIK DENEYİM', value: '25+' },
    { label: 'MUTLU MÜŞTERİ', value: '50.000+' },
    { label: 'ÇÖZÜM ORTAĞI', value: '1.200+' },
    { label: 'AKTİF KULLANICI', value: '250K+' }
  ];

  return (
    <section className="section-padding" style={{ background: 'var(--primary)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'radial-gradient(circle at 10% 20%, rgba(37, 99, 235, 0.1) 0%, transparent 60%)',
        pointerEvents: 'none'
      }} />

      <div className="container">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '4rem',
          textAlign: 'center',
          position: 'relative',
          zIndex: 1
        }}>
          {stats.map((s, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1, delay: idx * 1.1 }}
            >
              <div style={{ 
                fontSize: 'clamp(3rem, 7vw, 7.5rem)', 
                fontWeight: 900, 
                letterSpacing: '-0.07em',
                lineHeight: 1,
                color: 'white'
              }}>
                {s.value}
              </div>
              <div style={{ 
                fontSize: '0.85rem', 
                fontWeight: 800, 
                letterSpacing: '0.2rem', 
                opacity: 0.4,
                marginTop: '1rem',
                textTransform: 'uppercase'
              }}>
                {s.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
