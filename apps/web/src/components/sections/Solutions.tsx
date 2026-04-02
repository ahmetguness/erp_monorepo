'use client';

import { motion } from 'framer-motion';

export default function Solutions() {
  const industries = [
    { title: 'Perakende', desc: 'Market, Mağaza ve Giyim' },
    { title: 'Üretim', desc: 'Fabrika ve Atölye' },
    { title: 'Restoran', desc: 'Kafe, Bar ve Fast Food' },
    { title: 'Otel / Turizm', desc: 'Konaklama ve Rezervasyon' },
    { title: 'E-Ticaret', desc: 'Pazaryeri ve Kargo' },
    { title: 'Sağlık', desc: 'Eczane ve Klinik' }
  ];

  return (
    <section className="section-padding" id="solutions" style={{ background: '#ffffff', borderTop: '1px solid #eee' }}>
      <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '6rem' }}>
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           whileInView={{ opacity: 1, y: 0 }}
           viewport={{ once: true }}
           transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
           style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}
        >
          <h2 style={{ fontSize: '3.5rem', fontWeight: 800, marginBottom: '1.5rem' }}>
            Her Sektör İçin <span style={{ color: 'var(--accent)' }}>Özel Çözümler</span>
          </h2>
          <p style={{ fontSize: '1.1rem', color: 'var(--muted)', fontWeight: 500 }}>
            İşletmenizin kendine has süreçlerini dijital mükemmelliğe taşıyan sektörel dikey modüllerimizle tanışın.
          </p>
        </motion.div>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '2rem'
        }}>
          {industries.map((industry, idx) => (
            <motion.div 
              key={idx} 
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: idx * 0.1 }}
              whileHover={{ 
                y: -10, 
                boxShadow: 'var(--shadow-xl)', 
                borderColor: 'var(--accent)', 
                background: 'var(--secondary)' 
              }}
              style={{
                padding: '3rem',
                border: '1.5px solid var(--border)',
                borderRadius: 'var(--radius)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                background: '#ffffff',
                cursor: 'pointer',
                transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            >
              <h3 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{industry.title}</h3>
              <div style={{ width: '40px', height: '2px', background: 'var(--accent)', opacity: 0.3 }} />
              <p style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--muted)', lineHeight: '1.6' }}>{industry.desc}</p>
              <div style={{ marginTop: 'auto', fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.05em' }}>
                DETAYLI BİLGİ →
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
