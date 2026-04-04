import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:   'bg-sky-500 hover:bg-sky-400 text-white shadow-sm shadow-sky-500/20 focus-visible:ring-sky-500',
  secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 focus-visible:ring-slate-500',
  danger:    'bg-red-600 hover:bg-red-500 text-white shadow-sm shadow-red-500/20 focus-visible:ring-red-500',
  ghost:     'bg-transparent hover:bg-slate-800 text-slate-400 hover:text-slate-200 focus-visible:ring-slate-500',
  outline:   'bg-transparent border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white focus-visible:ring-slate-500',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-xl',
  lg: 'h-11 px-5 text-sm gap-2 rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, leftIcon, rightIcon, disabled, className, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
        'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]',
        VARIANT[variant], SIZE[size], className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : leftIcon && <span className="shrink-0">{leftIcon}</span>}
      {children}
      {!loading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  ),
);

Button.displayName = 'Button';
