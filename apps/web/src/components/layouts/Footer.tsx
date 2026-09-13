'use client';

import Link from 'next/link';

const FOOTER_LINKS = {
  urun: [
    { name: 'Modül Kataloğu', href: '#features' },
    { name: 'Uçtan Uca Süreç Akışı', href: '#workflow' },
    { name: 'Sektörel Çözümler', href: '#sectors' },
    { name: 'Lisans Fiyatlandırması', href: '#pricing' },
  ],
  cozumler: [
    { name: 'Çok Depolu Stok', href: '#features' },
    { name: 'Üretim & MRP Planlama', href: '#features' },
    { name: 'GİB e-Belge Entegrasyonu', href: '#features' },
    { name: 'Banka Ekstre Eşleşmesi', href: '#features' },
  ],
  gelistirici: [
    { name: 'API Dokümantasyonu', href: '/api-docs' },
    { name: 'Entegrasyon Ekosistemi', href: '#integrations' },
    { name: 'Kurulum Modelleri', href: '#deployment' },
    { name: 'Yetki & Güvenlik', href: '#security' },
  ],
};

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#060B15] border-t border-slate-800 text-slate-100 overflow-hidden">
      <div className="section-container py-14 lg:py-16">
        
        {/* Main Footer Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          
          {/* Brand & Info Column */}
          <div className="lg:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-lg font-bold text-white tracking-tight">
                Axon<span className="text-blue-400 font-extrabold">ERP</span>
              </span>
            </Link>

            <p className="text-sm text-slate-400 leading-relaxed max-w-sm">
              Siparişten üretime, depodan faturaya tüm ticari ve operasyonel süreçlerinizi tek platformda birleştiren kurumsal iş yönetim sistemi.
            </p>

            <div className="space-y-1.5 text-xs text-slate-400 pt-1">
              <div>Telefon: +90 (544) 645 51 35</div>
              <div>E-posta: ahmetgunes.ceng@gmail.com</div>
              <div>Lokasyon: Manisa / Türkiye</div>
            </div>
          </div>

          {/* Navigation Links Columns */}
          <div>
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4">
              Ürün
            </div>
            <ul className="space-y-2 text-xs">
              {FOOTER_LINKS.urun.map((l) => (
                <li key={l.name}>
                  <Link href={l.href} className="text-slate-400 hover:text-white transition-colors">
                    {l.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4">
              Çözümler
            </div>
            <ul className="space-y-2 text-xs">
              {FOOTER_LINKS.cozumler.map((l) => (
                <li key={l.name}>
                  <Link href={l.href} className="text-slate-400 hover:text-white transition-colors">
                    {l.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4">
              Geliştirici & Altyapı
            </div>
            <ul className="space-y-2 text-xs">
              {FOOTER_LINKS.gelistirici.map((l) => (
                <li key={l.name}>
                  <Link href={l.href} className="text-slate-400 hover:text-white transition-colors">
                    {l.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="border-t border-slate-800/80 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>© {currentYear} Axon ERP. Tüm hakları saklıdır.</div>
          <div className="flex items-center gap-6">
            <Link href="#" className="hover:text-slate-300 transition-colors">Gizlilik ve KVKK</Link>
            <Link href="#" className="hover:text-slate-300 transition-colors">Kullanım Şartları</Link>
            <Link href="/login" className="hover:text-slate-300 transition-colors">Giriş Yap</Link>
          </div>
        </div>

      </div>
    </footer>
  );
}
