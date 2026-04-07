import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface KpiCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: { value: string; positive: boolean };
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info';
  className?: string;
}

const ICON_BG: Record<string, string> = {
  default: 'bg-slate-800 text-slate-400',
  success: 'bg-emerald-500/10 text-emerald-400',
  danger: 'bg-red-500/10 text-red-400',
  warning: 'bg-amber-500/10 text-amber-400',
  info: 'bg-sky-500/10 text-sky-400',
};

export function KpiCard({ label, value, icon: Icon, trend, variant = 'default', className }: KpiCardProps) {
  return (
    <div className={cn('bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start gap-3', className)}>
      {Icon && (
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', ICON_BG[variant])}>
          <Icon className="w-4.5 h-4.5" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">{label}</p>
        <p className="text-lg font-semibold text-white mt-0.5 truncate">{value}</p>
        {trend && (
          <p className={cn('text-xs mt-0.5', trend.positive ? 'text-emerald-400' : 'text-red-400')}>
            {trend.value}
          </p>
        )}
      </div>
    </div>
  );
}
