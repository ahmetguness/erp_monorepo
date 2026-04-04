import Link from 'next/link';
import { Ruler, Tag, Percent, DollarSign, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';

const SETTINGS_ITEMS = [
  { href: '/dashboard/settings/units', icon: Ruler, label: 'Birimler', description: 'Ürün ölçü birimlerini yönetin' },
  { href: '/dashboard/settings/categories', icon: Tag, label: 'Kategoriler', description: 'Ürün kategorilerini yönetin' },
  { href: '/dashboard/settings/tax-rates', icon: Percent, label: 'KDV Oranları', description: 'Vergi oranlarını yönetin' },
  { href: '/dashboard/settings/currencies', icon: DollarSign, label: 'Para Birimleri', description: 'Döviz kurlarını yönetin' },
] as const;

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Ayarlar" subtitle="Referans verilerini ve sistem ayarlarını yönetin." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
        {SETTINGS_ITEMS.map(({ href, icon: Icon, label, description }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-4 p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 hover:bg-slate-800/50 transition-colors group"
          >
            <div className="p-2.5 rounded-lg bg-slate-800 group-hover:bg-slate-700 transition-colors shrink-0">
              <Icon className="w-5 h-5 text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200">{label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
