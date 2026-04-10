import Link from 'next/link';
import {
  Ruler, Tag, Percent, DollarSign, ChevronRight, Settings, Shield, UserPlus,
  Database, Sparkles,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';

interface SettingsItem {
  href: string;
  icon: typeof Settings;
  label: string;
  description: string;
  color: string;
  bg: string;
  ring: string;
}

interface SettingsGroup {
  title: string;
  items: SettingsItem[];
}

const GROUPS: SettingsGroup[] = [
  {
    title: 'Ekip',
    items: [
      { href: '/dashboard/settings/users', icon: UserPlus, label: 'Kullanıcılar & Davetler', description: 'Ekip üyelerini yönetin, yeni kullanıcılar davet edin', color: 'text-blue-400', bg: 'bg-blue-500/10', ring: 'group-hover:ring-blue-500/20' },
    ],
  },
  {
    title: 'Referans Verileri',
    items: [
      { href: '/dashboard/settings/units', icon: Ruler, label: 'Birimler', description: 'Ölçü birimleri (adet, kg, lt…)', color: 'text-sky-400', bg: 'bg-sky-500/10', ring: 'group-hover:ring-sky-500/20' },
      { href: '/dashboard/settings/categories', icon: Tag, label: 'Kategoriler', description: 'Ürün kategori ağacı', color: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'group-hover:ring-emerald-500/20' },
      { href: '/dashboard/settings/tax-rates', icon: Percent, label: 'KDV Oranları', description: 'Vergi oranı tanımları', color: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'group-hover:ring-amber-500/20' },
      { href: '/dashboard/settings/currencies', icon: DollarSign, label: 'Para Birimleri', description: 'Döviz ve kur tanımları', color: 'text-violet-400', bg: 'bg-violet-500/10', ring: 'group-hover:ring-violet-500/20' },
    ],
  },
  {
    title: 'Sistem',
    items: [
      { href: '/dashboard/settings/general', icon: Settings, label: 'Genel Ayarlar', description: 'Şirket bilgileri ve yapılandırma', color: 'text-slate-300', bg: 'bg-slate-700/40', ring: 'group-hover:ring-slate-600/30' },
      { href: '/dashboard/settings/audit-log', icon: Shield, label: 'Denetim Kaydı', description: 'Tüm işlem geçmişi ve loglar', color: 'text-pink-400', bg: 'bg-pink-500/10', ring: 'group-hover:ring-pink-500/20' },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Ayarlar" subtitle="Referans verileri ve sistem yapılandırması." />

      <div className="space-y-8">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px flex-1 bg-gradient-to-r from-slate-800 to-transparent" />
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-2">{group.title}</span>
              <div className="h-px flex-1 bg-gradient-to-l from-slate-800 to-transparent" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.items.map(({ href, icon: Icon, label, description, color, bg, ring }) => (
                <Link key={href} href={href}
                  className={`group relative bg-slate-900/80 border border-slate-800/80 rounded-2xl p-5 ring-1 ring-transparent ${ring} hover:bg-slate-800/40 hover:border-slate-700/60 transition-all duration-300 overflow-hidden`}>

                  {/* Hover glow */}
                  <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none blur-2xl"
                    style={{ background: `radial-gradient(circle, currentColor 0%, transparent 70%)` }} />

                  <div className="relative z-10 flex items-start gap-4">
                    <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110`}>
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">{label}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all duration-300 shrink-0 mt-1" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
