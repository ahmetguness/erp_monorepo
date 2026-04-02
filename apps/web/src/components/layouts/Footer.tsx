'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import logoImg from '@/assets/logo/logo.png';

// Premium SVG Icons for Social Media
const FacebookIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

const TwitterIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
  </svg>
);

const LinkedinIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect width="4" height="12" x="2" y="9" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const InstagramIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

export default function Footer() {
  const currentYear = new Date().getFullYear();
  
  const links = {
    urun: [
      { name: 'Modüller', href: '#features' },
      { name: 'Sektörel Çözümler', href: '#solutions' },
      { name: 'Fiyatlandırma', href: '#pricing' },
      { name: 'Güvenlik & Gizlilik', href: '#' }
    ],
    kurumsal: [
      { name: 'Hakkımızda', href: '#' },
      { name: 'İnsan Kaynakları', href: '#' },
      { name: 'Basın & Medya', href: '#' },
      { name: 'İletişim Kanalı', href: '#' }
    ],
    destek: [
      { name: 'Eğitim Videoları', href: '#' },
      { name: 'Yardım Merkezi', href: '#' },
      { name: 'Geliştiriciler (API)', href: '#' },
      { name: 'Topluluk Forumu', href: '#' }
    ]
  };

  const socials = [
    { name: 'Facebook', Icon: FacebookIcon },
    { name: 'Twitter', Icon: TwitterIcon },
    { name: 'Linkedin', Icon: LinkedinIcon },
    { name: 'Instagram', Icon: InstagramIcon }
  ];

  return (
    <footer className="relative bg-slate-950 pt-32 pb-16 overflow-hidden border-t border-white/5">
      
      {/* 🌌 Atmospheric Mesh Gradients */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-600/10 blur-[150px] rounded-full pointer-events-none -z-10" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-indigo-900/20 blur-[100px] rounded-full pointer-events-none -z-10" />

      <div className="section-container relative z-10">
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-20 mb-32">
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-10">
            <Link href="/" className="group flex items-center gap-3">
              <div className="w-12 h-12 relative overflow-hidden bg-blue-700 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform duration-500 shadow-xl">
                <Image 
                  src={logoImg} 
                  alt="Axon Logo" 
                  fill 
                  className="object-contain p-2"
                />
              </div>
              <span className="text-3xl font-black text-white tracking-tighter uppercase italic">
                Axon<span className="text-blue-500 not-italic group-hover:text-white transition-colors">ERP</span>
              </span>
            </Link>
            <p className="text-slate-400 text-xl leading-snug font-medium max-w-sm italic tracking-tight">
              İşletmenizi dijitalleştiren, uçtan uca yönetim sağlayan yeni nesil kurumsal Axon ekosistemi.
            </p>
            <div className="flex gap-4">
              {socials.map((social, i) => (
                <Link 
                  key={i} 
                  href="#" 
                  className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-blue-700 hover:border-blue-600 transition-all shadow-lg"
                  aria-label={social.name}
                >
                  <social.Icon size={20} />
                </Link>
              ))}
            </div>
          </div>

          {/* Links */}
          <nav>
            <h4 className="text-[12px] font-black text-blue-500 uppercase tracking-[0.4em] mb-12 italic">Ürün</h4>
            <ul className="space-y-6">
              {links.urun.map((link, i) => (
                <li key={i}>
                  <Link href={link.href} className="text-slate-400 hover:text-white transition-all font-black text-[13px] uppercase tracking-widest italic flex items-center gap-2 group">
                    <span className="w-0 h-px bg-blue-600 transition-all group-hover:w-4" /> {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav>
            <h4 className="text-[12px] font-black text-blue-500 uppercase tracking-[0.4em] mb-12 italic">Kurumsal</h4>
            <ul className="space-y-6">
              {links.kurumsal.map((link, i) => (
                <li key={i}>
                  <Link href={link.href} className="text-slate-400 hover:text-white transition-all font-black text-[13px] uppercase tracking-widest italic flex items-center gap-2 group">
                    <span className="w-0 h-px bg-blue-600 transition-all group-hover:w-4" /> {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav>
            <h4 className="text-[12px] font-black text-blue-500 uppercase tracking-[0.4em] mb-12 italic">Destek</h4>
            <ul className="space-y-6">
              {links.destek.map((link, i) => (
                <li key={i}>
                  <Link href={link.href} className="text-slate-400 hover:text-white transition-all font-black text-[13px] uppercase tracking-widest italic flex items-center gap-2 group">
                    <span className="w-0 h-px bg-blue-600 transition-all group-hover:w-4" /> {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Bottom Bar */}
        <div className="pt-16 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-12 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] italic">
          <div className="flex items-center gap-6">
            <p>© {currentYear} Axon ERP. Tüm hakları saklıdır.</p>
            <span className="hidden md:block w-px h-4 bg-white/10" />
            <p>Made with 💙 in Turkey</p>
          </div>
          <div className="flex gap-10">
            <Link href="#" className="hover:text-white transition-colors">Mesafeli Satış</Link>
            <Link href="#" className="hover:text-white transition-colors">Gizlilik & KVKK</Link>
            <Link href="#" className="hover:text-white transition-colors">Kullanım Şartları</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

