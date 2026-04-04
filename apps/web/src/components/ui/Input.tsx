import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  error?: string;
  helperText?: string;
  prefixIcon?: React.ReactNode;
  suffixIcon?: React.ReactNode;
  required?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, prefixIcon, suffixIcon, required, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-slate-300">
            {label}
            {required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
        )}

        <div className="relative flex items-center">
          {prefixIcon && (
            <div className="absolute left-3 text-slate-500 pointer-events-none">{prefixIcon}</div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full bg-slate-800 border rounded-lg text-sm text-white placeholder-slate-500',
              'px-3.5 py-2.5 transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error ? 'border-red-500' : 'border-slate-700',
              !!prefixIcon && 'pl-9',
              !!suffixIcon && 'pr-9',
              className,
            )}
            {...props}
          />
          {suffixIcon && (
            <div className="absolute right-3 text-slate-500 pointer-events-none">{suffixIcon}</div>
          )}
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {!error && helperText && <p className="text-xs text-slate-500">{helperText}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';
