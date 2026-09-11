'use client';

import type { AdminRoleKey } from '@repo/types';
import {
  ShieldAlert,
  ShieldCheck,
  Activity,
  CreditCard,
  Headphones,
  Eye,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RoleConfig {
  key: AdminRoleKey;
  label: string;
  badge: string;
  description: string;
  icon: typeof ShieldCheck;
  colorClasses: {
    selectedBorder: string;
    selectedBg: string;
    badgeBg: string;
    badgeText: string;
    iconColor: string;
  };
}

export const ADMIN_ROLE_CONFIGS: Record<AdminRoleKey, RoleConfig> = {
  SUPER_ADMIN: {
    key: 'SUPER_ADMIN',
    label: 'Süper Yönetici',
    badge: 'SUPER_ADMIN',
    description: 'Tüm platform, ayarlar, tenantlar ve kullanıcılar üzerinde tam yetki.',
    icon: ShieldAlert,
    colorClasses: {
      selectedBorder: 'border-rose-500/60 ring-1 ring-rose-500/40',
      selectedBg: 'bg-rose-500/10',
      badgeBg: 'bg-rose-500/15',
      badgeText: 'text-rose-300 border-rose-500/30',
      iconColor: 'text-rose-400',
    },
  },
  SECURITY: {
    key: 'SECURITY',
    label: 'Güvenlik Yöneticisi',
    badge: 'SECURITY',
    description: 'Güvenlik olayları, denetim (audit) logları ve oturum takibi.',
    icon: ShieldCheck,
    colorClasses: {
      selectedBorder: 'border-emerald-500/60 ring-1 ring-emerald-500/40',
      selectedBg: 'bg-emerald-500/10',
      badgeBg: 'bg-emerald-500/15',
      badgeText: 'text-emerald-300 border-emerald-500/30',
      iconColor: 'text-emerald-400',
    },
  },
  OPERATIONS: {
    key: 'OPERATIONS',
    label: 'Operasyon Yöneticisi',
    badge: 'OPERATIONS',
    description: 'Platform operasyonları, sistem durumu ve tenant durum onayları.',
    icon: Activity,
    colorClasses: {
      selectedBorder: 'border-amber-500/60 ring-1 ring-amber-500/40',
      selectedBg: 'bg-amber-500/10',
      badgeBg: 'bg-amber-500/15',
      badgeText: 'text-amber-300 border-amber-500/30',
      iconColor: 'text-amber-400',
    },
  },
  FINANCE: {
    key: 'FINANCE',
    label: 'Finans Yöneticisi',
    badge: 'FINANCE',
    description: 'Tenant plan/fiyat değişiklikleri ve finansal onay talepleri.',
    icon: CreditCard,
    colorClasses: {
      selectedBorder: 'border-sky-500/60 ring-1 ring-sky-500/40',
      selectedBg: 'bg-sky-500/10',
      badgeBg: 'bg-sky-500/15',
      badgeText: 'text-sky-300 border-sky-500/30',
      iconColor: 'text-sky-400',
    },
  },
  SUPPORT: {
    key: 'SUPPORT',
    label: 'Destek Uzmanı',
    badge: 'SUPPORT',
    description: 'Tenant ayar desteği ve müşteri destek oturumları yönetimi.',
    icon: Headphones,
    colorClasses: {
      selectedBorder: 'border-violet-500/60 ring-1 ring-violet-500/40',
      selectedBg: 'bg-violet-500/10',
      badgeBg: 'bg-violet-500/15',
      badgeText: 'text-violet-300 border-violet-500/30',
      iconColor: 'text-violet-400',
    },
  },
  READ_ONLY_AUDITOR: {
    key: 'READ_ONLY_AUDITOR',
    label: 'Salt Okunur Denetçi',
    badge: 'READ_ONLY_AUDITOR',
    description: 'Tüm verileri, denetim loglarını ve raporları salt okunur görüntüleme.',
    icon: Eye,
    colorClasses: {
      selectedBorder: 'border-slate-400/60 ring-1 ring-slate-400/40',
      selectedBg: 'bg-slate-500/10',
      badgeBg: 'bg-slate-500/15',
      badgeText: 'text-slate-300 border-slate-600',
      iconColor: 'text-slate-300',
    },
  },
};

const ALL_ROLES: AdminRoleKey[] = [
  'SUPER_ADMIN',
  'SECURITY',
  'OPERATIONS',
  'FINANCE',
  'SUPPORT',
  'READ_ONLY_AUDITOR',
];

export function AdminRoleSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: AdminRoleKey[];
  onChange: (roles: AdminRoleKey[]) => void;
  disabled?: boolean;
}) {
  const toggleRole = (role: AdminRoleKey) => {
    if (disabled) return;
    if (value.includes(role)) {
      onChange(value.filter((r) => r !== role));
    } else {
      onChange([...value, role]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Yetki Rolleri <span className="text-rose-400">*</span>
        </label>
        <span className="text-xs text-slate-500">
          {value.length} rol seçildi
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {ALL_ROLES.map((roleKey) => {
          const config = ADMIN_ROLE_CONFIGS[roleKey];
          const isSelected = value.includes(roleKey);
          const Icon = config.icon;

          return (
            <button
              key={roleKey}
              type="button"
              disabled={disabled}
              onClick={() => toggleRole(roleKey)}
              className={cn(
                'group relative flex flex-col items-start rounded-xl border p-3.5 text-left transition-all duration-200',
                disabled && 'cursor-not-allowed opacity-50',
                isSelected
                  ? cn(
                      'border-slate-700 bg-slate-900/90 shadow-md',
                      config.colorClasses.selectedBorder,
                      config.colorClasses.selectedBg,
                    )
                  : 'border-slate-800/90 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/40',
              )}
            >
              <div className="flex w-full items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/80 transition-colors',
                      isSelected && config.colorClasses.iconColor,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-200 group-hover:text-white">
                      {config.label}
                    </div>
                    <div className="font-mono text-[10px] text-slate-500">
                      {config.badge}
                    </div>
                  </div>
                </div>

                <div
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all',
                    isSelected
                      ? 'border-transparent bg-sky-500 text-white shadow-sm'
                      : 'border-slate-700 bg-slate-900/60 text-transparent group-hover:border-slate-600',
                  )}
                >
                  <Check className="h-3 w-3 stroke-[3]" />
                </div>
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                {config.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
