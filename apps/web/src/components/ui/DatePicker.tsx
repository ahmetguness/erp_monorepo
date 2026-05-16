import { forwardRef, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  label?: string;
  error?: string;
  helperText?: string;
  value?: string | null;
  onChange?: (value: string) => void;
  onValueChange?: (value: string | null) => void;
  required?: boolean;
  clearable?: boolean;
}

function formatDateDisplay(value?: string | null): string {
  if (!value) return 'gg.aa.yyyy';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  (
    {
      label,
      error,
      helperText,
      value,
      defaultValue,
      onChange,
      onValueChange,
      required,
      clearable = true,
      className,
      id,
      disabled,
      ...props
    },
    ref,
  ) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
    const [internalValue, setInternalValue] = useState(typeof defaultValue === 'string' ? defaultValue : '');
    const currentValue = value ?? internalValue;

    const commitValue = (nextValue: string) => {
      if (value === undefined) setInternalValue(nextValue);
      onChange?.(nextValue);
      onValueChange?.(nextValue || null);
    };

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-[13px] font-medium text-slate-300">
            {label}
            {required && <span className="ml-0.5 text-red-400">*</span>}
          </label>
        )}

        <div
          className={cn(
            'relative flex h-10 w-full items-center rounded-xl border bg-slate-950/35 text-sm text-white shadow-sm',
            'px-3.5 transition-all duration-150',
            'hover:border-slate-600/80 hover:bg-slate-900/60',
            'focus-within:border-sky-500/60 focus-within:bg-slate-950/50 focus-within:ring-2 focus-within:ring-sky-500/35',
            'disabled:opacity-50',
            error ? 'border-red-500/80 focus-within:border-red-500 focus-within:ring-red-500/30' : 'border-slate-700/75',
            disabled && 'opacity-50',
            className,
          )}
        >
          <CalendarDays className="mr-2 h-3.5 w-3.5 shrink-0 text-slate-500" />
          <span className={cn('truncate', currentValue ? 'text-white' : 'text-slate-500')}>
            {formatDateDisplay(currentValue)}
          </span>
          {clearable && currentValue && !disabled && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                commitValue('');
              }}
              className="relative z-10 ml-auto rounded-md p-1 text-slate-600 transition-colors hover:bg-slate-800 hover:text-slate-300"
              aria-label="Tarihi temizle"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <input
            ref={ref}
            id={inputId}
            type="date"
            value={currentValue}
            disabled={disabled}
            onChange={(event) => commitValue(event.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            aria-label={label}
            {...props}
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
        {!error && helperText && <p className="text-xs text-slate-500">{helperText}</p>}
      </div>
    );
  },
);

DatePicker.displayName = 'DatePicker';
