import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, required, className, id, ...props }, ref) => {
    const textareaId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={textareaId} className="text-[13px] font-medium text-slate-300">
            {label}
            {required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={3}
          className={cn(
            'w-full rounded-xl border bg-slate-950/35 text-sm text-white placeholder-slate-500 shadow-sm',
            'px-3.5 py-2.5 transition-all duration-150 resize-none',
            'hover:border-slate-600/80 hover:bg-slate-900/60',
            'focus:outline-none focus:ring-2 focus:ring-sky-500/35 focus:border-sky-500/60 focus:bg-slate-950/50',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error ? 'border-red-500/80 focus:ring-red-500/30 focus:border-red-500' : 'border-slate-700/75',
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        {!error && helperText && <p className="text-xs text-slate-500">{helperText}</p>}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
