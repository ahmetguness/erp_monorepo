'use client';

import { motion } from 'framer-motion';

const stats = [
  { label: 'Yıllık deneyim', value: '25+' },
  { label: 'Mutlu müşteri', value: '50.000+' },
  { label: 'Çözüm ortağı', value: '1.200+' },
  { label: 'Aktif kullanıcı', value: '250K+' }
];

export default function Trust() {
  return (
    <section className="py-16 bg-blue-600">
      <div className="section-container">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
          {stats.map((s, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.08 }}
            >
              <div className="text-3xl lg:text-4xl font-bold text-white mb-1">{s.value}</div>
              <div className="text-sm text-blue-100">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
