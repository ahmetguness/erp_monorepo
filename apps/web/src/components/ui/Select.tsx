import { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SelectOption } from '@/types/form.types';

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  required?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, options, placeholder, required, className, id, 'aria-describedby': describedBy, 'aria-invalid': invalid, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const helpId = error || helperText ? selectId + '-help' : undefined;
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-[13px] font-medium text-slate-300">
            {label}{required && <span aria-hidden="true" className="text-red-400 ml-0.5">*</span>}
          </label>
        )}
        <div className="relative">
          <select ref={ref} id={selectId} required={required} aria-invalid={error ? true : invalid} aria-describedby={[describedBy, helpId].filter(Boolean).join(' ') || undefined}
            className={cn(
              'w-full appearance-none rounded-xl border bg-slate-950/35 text-sm text-white shadow-sm',
              'px-3.5 py-2.5 pr-9 transition-all duration-150',
              'hover:border-slate-600/80 hover:bg-slate-900/60',
              'focus:outline-none focus:ring-2 focus:ring-sky-500/35 focus:border-sky-500/60 focus:bg-slate-950/50',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error
                ? 'border-red-500/80 bg-red-950/10 hover:border-red-400 hover:bg-red-950/20 focus:ring-red-500/30 focus:border-red-500'
                : 'border-slate-700/75',
              className,
            )}
            {...props}
          >
            {placeholder && <option value="" disabled>{placeholder}</option>}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        </div>
        {error && <p id={helpId} role="alert" className="text-xs text-red-400">{error}</p>}
        {!error && helperText && <p id={helpId} className="text-xs text-slate-400">{helperText}</p>}
      </div>
    );
  },
);
Select.displayName = 'Select';
