'use client';

import Link from 'next/link';

const links = {
  urun: [
    { name: 'Modüller', href: '#features' },
    { name: 'Sektörel Çözümler', href: '#solutions' },
    { name: 'Kurulum Modelleri', href: '#deployment' },
    { name: 'Fiyatlandırma', href: '#pricing' },
  ],
  kurumsal: [
    { name: 'Hakkımızda', href: '#' },
    { name: 'Referanslar', href: '#' },
    { name: 'Kariyer', href: '#' },
    { name: 'İletişim', href: '#' },
  ],
  destek: [
    { name: 'Yardım Merkezi', href: '#' },
    { name: 'Eğitim Videoları', href: '#' },
    { name: 'API Dokümantasyonu', href: '#' },
    { name: 'Güvenlik Politikası', href: '#' },
  ],
};

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-slate-950 border-t border-slate-800">
      <div className="section-container py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-10">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <div className="w-7 h-7 relative overflow-hidden bg-blue-600 rounded flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-lg font-bold text-white tracking-tight">
                Axon<span className="text-blue-400">ERP</span>
              </span>
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs mb-5">
              Muhasebe, stok, satış ve personel yönetimini tek platformda birleştiren kurumsal ERP yazılımı.
            </p>

            {/* Contact info */}
            <div className="space-y-2 text-sm text-slate-500">
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span>0850 000 00 00</span>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>info@axonerp.com.tr</span>
              </div>
              <div className="flex items-start gap-2">
                <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Maslak Mah. Büyükdere Cad. No:123<br />Sarıyer / İstanbul</span>
              </div>
            </div>
          </div>

          {/* Links */}
          {[
            { title: 'Ürün', items: links.urun },
            { title: 'Kurumsal', items: links.kurumsal },
            { title: 'Destek', items: links.destek },
          ].map((col) => (
            <nav key={col.title}>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">{col.title}</h4>
              <ul className="space-y-2.5">
                {col.items.map((link) => (
                  <li key={link.name}>
                    <Link href={link.href} className="text-sm text-slate-500 hover:text-slate-200 transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Demo CTA strip */}
        <div className="border border-slate-800 rounded-lg px-6 py-4 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white mb-0.5">Demo talep edin</div>
            <div className="text-xs text-slate-400">Uzmanlarımız size özel bir sunum hazırlar.</div>
          </div>
          <button className="btn-primary text-sm flex-shrink-0">
            Demo Talep Et
          </button>
        </div>

        <div className="border-t border-slate-800 pt-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-slate-500">
          <p>© {currentYear} Axon ERP. Tüm hakları saklıdır.</p>
          <div className="flex gap-5">
            <Link href="#" className="hover:text-slate-300 transition-colors">Gizlilik ve KVKK</Link>
            <Link href="#" className="hover:text-slate-300 transition-colors">Kullanım Şartları</Link>
            <Link href="#" className="hover:text-slate-300 transition-colors">Mesafeli Satış</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
