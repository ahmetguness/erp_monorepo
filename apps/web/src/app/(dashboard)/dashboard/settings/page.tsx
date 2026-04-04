import Link from 'next/link';
import { Ruler, Tag, Percent, DollarSign, ChevronRight, Settings, Shield } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';

const ITEMS = [
  { href: '/dashboard/settings/units', icon: Ruler, label: 'Birimler', description: 'Ölçü birimleri', color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'hover:border-sky-500/20' },
  { href: '/dashboard/settings/categories', icon: Tag, label: 'Kategoriler', description: 'Ürün kategorileri', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'hover:border-emerald-500/20' },
  { href: '/dashboard/settings/tax-rates', icon: Percent, label: 'KDV Oranları', description: 'Vergi oranları', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'hover:border-amber-500/20' },
  { href: '/dashboard/settings/currencies', icon: DollarSign, label: 'Para Birimleri', description: 'Döviz tanımları', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'hover:border-violet-500/20' },
  { href: '/dashboard/settings/general', icon: Settings, label: 'Genel Ayarlar', description: 'Sistem yapılandırması', color: 'text-slate-300', bg: 'bg-slate-700/50', border: 'hover:border-slate-600/50' },
  { href: '/dashboard/settings/audit-log', icon: Shield, label: 'Denetim Kaydı', description: 'İşlem geçmişi', color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'hover:border-pink-500/20' },
] as const;

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Ayarlar" subtitle="Referans verileri ve sistem yapılandırması." />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {ITEMS.map(({ href, icon: Icon, label, description, color, bg, border }) => (
          <Link key={href} href={href}
            className={`relative bg-slate-900 border border-slate-800 rounded-xl p-5 ${border} hover:bg-slate-800/30 transition-all duration-200 group overflow-hidden`}>
            {/* Subtle glow on hover */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              style={{ background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.02) 0%, transparent 70%)' }} />

            <div className="relative z-10">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">{label}</p>
              <p className="text-xs text-slate-500 mt-1">{description}</p>
            </div>

            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-800 group-hover:text-slate-600 transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}
