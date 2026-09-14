import { create } from 'zustand';

// ─────────────────────────────────────────────
// Toast notification type
// ─────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
  duration?: number;
  action?: ToastAction;
}

// ─────────────────────────────────────────────
// Sidebar mode
// ─────────────────────────────────────────────

/**
 * expanded  → full sidebar (w-56), icon + label
 * collapsed → icon-only (w-14), label appears as tooltip on hover
 * hidden    → completely hidden (w-0)
 */
export type SidebarMode = 'expanded' | 'collapsed' | 'hidden';

// ─────────────────────────────────────────────
// UI Store
// ─────────────────────────────────────────────

interface UIState {
  /** @deprecated Use `sidebarMode` instead. Kept for backward-compat read access. */
  sidebarOpen: boolean;
  sidebarMode: SidebarMode;
  toasts: Toast[];
  commandPaletteOpen: boolean;
}

interface UIActions {
  setSidebarMode: (mode: SidebarMode) => void;
  /** Cycles: expanded → collapsed → expanded. Hidden is only set explicitly. */
  cycleSidebarMode: () => void;
  /** @deprecated Use `setSidebarMode`. */
  toggleSidebar: () => void;
  /** @deprecated Use `setSidebarMode`. */
  setSidebarOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  // Convenience helpers
  toast: {
    success: (message: string, action?: ToastAction, duration?: number) => void;
    error: (message: string, action?: ToastAction, duration?: number) => void;
    warning: (message: string, action?: ToastAction, duration?: number) => void;
    info: (message: string, action?: ToastAction, duration?: number) => void;
  };
}

type UIStore = UIState & UIActions;

let toastCounter = 0;
const TOAST_DEDUPE_WINDOW_MS = 500;
const recentToastMessages = new Map<string, number>();

export const useUIStore = create<UIStore>()((set, get) => ({
  sidebarMode: 'expanded',
  sidebarOpen: true, // derived from sidebarMode — stays true for expanded/collapsed
  toasts: [],
  commandPaletteOpen: false,

  setSidebarMode: (mode) =>
    set({ sidebarMode: mode, sidebarOpen: mode !== 'hidden' }),

  cycleSidebarMode: () =>
    set((s) => {
      const next: SidebarMode =
        s.sidebarMode === 'expanded' ? 'collapsed' :
        s.sidebarMode === 'collapsed' ? 'expanded' :
        'expanded'; // hidden → expand
      return { sidebarMode: next, sidebarOpen: true };
    }),

  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () => set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

  // ── Backward-compat shims ──
  toggleSidebar: () => get().cycleSidebarMode(),
  setSidebarOpen: (open) => get().setSidebarMode(open ? 'expanded' : 'hidden'),

  addToast: (toast) => {
    const now = Date.now();
    const lastShownAt = recentToastMessages.get(toast.message);
    if (lastShownAt !== undefined && now - lastShownAt < TOAST_DEDUPE_WINDOW_MS) return;
    recentToastMessages.set(toast.message, now);
    setTimeout(() => {
      if (recentToastMessages.get(toast.message) === now) recentToastMessages.delete(toast.message);
    }, TOAST_DEDUPE_WINDOW_MS);

    const id = `toast-${++toastCounter}`;
    const duration = toast.duration ?? (toast.action ? 8000 : 4000);
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => get().removeToast(id), duration);
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  toast: {
    success: (message, action, duration) => get().addToast({ variant: 'success', message, action, duration }),
    error:   (message, action, duration) => get().addToast({ variant: 'error',   message, action, duration }),
    warning: (message, action, duration) => get().addToast({ variant: 'warning', message, action, duration }),
    info:    (message, action, duration) => get().addToast({ variant: 'info',    message, action, duration }),
  },
}));

// Standalone toast helper — usable outside React components
export const toast = {
  success: (message: string, action?: ToastAction, duration?: number) =>
    useUIStore.getState().addToast({ variant: 'success', message, action, duration }),
  error:   (message: string, action?: ToastAction, duration?: number) =>
    useUIStore.getState().addToast({ variant: 'error',   message, action, duration }),
  warning: (message: string, action?: ToastAction, duration?: number) =>
    useUIStore.getState().addToast({ variant: 'warning', message, action, duration }),
  info:    (message: string, action?: ToastAction, duration?: number) =>
    useUIStore.getState().addToast({ variant: 'info',    message, action, duration }),
};
