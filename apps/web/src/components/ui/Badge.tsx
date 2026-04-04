import { cn } from '@/lib/utils';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  danger:  'bg-red-500/10 text-red-400 border-red-500/20',
  info:    'bg-sky-500/10 text-sky-400 border-sky-500/20',
  neutral: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  purple:  'bg-violet-500/10 text-violet-400 border-violet-500/20',
};

const DOT_STYLES: Record<BadgeVariant, string> = {
  success: 'bg-emerald-400', warning: 'bg-amber-400', danger: 'bg-red-400',
  info: 'bg-sky-400', neutral: 'bg-slate-400', purple: 'bg-violet-400',
};

export function Badge({ variant = 'neutral', children, className, dot }: BadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border',
      VARIANT_STYLES[variant],
      className,
    )}>
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full', DOT_STYLES[variant])} />}
      {children}
    </span>
  );
}
