'use client';

import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useUIStore, type Toast, type ToastVariant } from '@/store/ui.store';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'bg-emerald-950 border-emerald-800 text-emerald-100',
  error:   'bg-red-950 border-red-800 text-red-100',
  warning: 'bg-amber-950 border-amber-800 text-amber-100',
  info:    'bg-sky-950 border-sky-800 text-sky-100',
};

const VARIANT_ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />,
  error:   <XCircle className="w-4 h-4 text-red-400 shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
  info:    <Info className="w-4 h-4 text-sky-400 shrink-0" />,
};

// ─────────────────────────────────────────────
// Single Toast item
// ─────────────────────────────────────────────

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 px-4 py-3 rounded-lg border text-sm shadow-lg',
        'animate-in slide-in-from-right-5 fade-in duration-200',
        VARIANT_STYLES[toast.variant],
      )}
    >
      {VARIANT_ICONS[toast.variant]}
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => onRemove(toast.id)}
        aria-label="Bildirimi kapat"
        className="opacity-60 hover:opacity-100 transition-opacity ml-1 shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// Toast container
// ─────────────────────────────────────────────

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);
  const removeToast = useUIStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={removeToast} />
      ))}
    </div>
  );
}
