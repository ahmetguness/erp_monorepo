import { cn } from '@/lib/utils';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  success: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20',
  warning: 'bg-amber-500/15 text-amber-400 ring-amber-500/20',
  danger:  'bg-red-500/15 text-red-400 ring-red-500/20',
  info:    'bg-sky-500/15 text-sky-400 ring-sky-500/20',
  neutral: 'bg-slate-700 text-slate-300 ring-slate-600/20',
  purple:  'bg-violet-500/15 text-violet-400 ring-violet-500/20',
};

export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ring-inset',
        VARIANT_STYLES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
