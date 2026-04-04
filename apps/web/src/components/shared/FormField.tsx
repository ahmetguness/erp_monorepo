import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────
// FormField — label + input + error wrapper
// ─────────────────────────────────────────────

export interface FormFieldProps {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  error,
  helperText,
  required,
  htmlFor,
  children,
  className,
}: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-sm font-medium text-slate-300">
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && helperText && <p className="text-xs text-slate-500">{helperText}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────
// FormRow — horizontal layout for form fields
// ─────────────────────────────────────────────

export interface FormRowProps {
  children: React.ReactNode;
  cols?: 1 | 2 | 3 | 4;
  className?: string;
}

const COLS_STYLES: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

export function FormRow({ children, cols = 2, className }: FormRowProps) {
  return (
    <div className={cn('grid gap-4', COLS_STYLES[cols], className)}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
// FormSection — titled section within a form
// ─────────────────────────────────────────────

export interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="pb-2 border-b border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}
