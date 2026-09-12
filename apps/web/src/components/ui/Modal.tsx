'use client';

import { useEffect, useEffectEvent, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: ModalSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const SIZE_STYLES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function Modal({ isOpen, onClose, title, description, size = 'md', children, footer }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const closeModal = useEffectEvent(onClose);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    queueMicrotask(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(focusableSelector);
      (first ?? panelRef.current)?.focus();
    });
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) { e.preventDefault(); panelRef.current.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm" />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'relative w-full rounded-2xl border border-slate-800/90 bg-slate-950/95 shadow-2xl shadow-black/35',
          'ring-1 ring-white/[0.04]',
          'flex flex-col max-h-[90vh]',
          SIZE_STYLES[size],
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800/80 bg-slate-900/50 px-6 pt-5 pb-4 shrink-0">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-white">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="text-sm text-slate-400 mt-0.5">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800/90 transition-colors ml-4 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="border-t border-slate-800/80 bg-slate-900/45 px-6 py-4 flex items-center justify-end gap-3 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
