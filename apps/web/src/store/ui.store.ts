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
// UI Store
// ─────────────────────────────────────────────

interface UIState {
  sidebarOpen: boolean;
  toasts: Toast[];
}

interface UIActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
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

export const useUIStore = create<UIStore>()((set, get) => ({
  sidebarOpen: true,
  toasts: [],

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  addToast: (toast) => {
    const id = `toast-${++toastCounter}`;
    const duration = toast.duration ?? (toast.action ? 8000 : 4000);
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => get().removeToast(id), duration);
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  toast: {
    success: (message, action, duration) => get().addToast({ variant: 'success', message, action, duration }),
    error: (message, action, duration) => get().addToast({ variant: 'error', message, action, duration }),
    warning: (message, action, duration) => get().addToast({ variant: 'warning', message, action, duration }),
    info: (message, action, duration) => get().addToast({ variant: 'info', message, action, duration }),
  },
}));

// Standalone toast helper — usable outside React components
export const toast = {
  success: (message: string, action?: ToastAction, duration?: number) =>
    useUIStore.getState().addToast({ variant: 'success', message, action, duration }),
  error: (message: string, action?: ToastAction, duration?: number) =>
    useUIStore.getState().addToast({ variant: 'error', message, action, duration }),
  warning: (message: string, action?: ToastAction, duration?: number) =>
    useUIStore.getState().addToast({ variant: 'warning', message, action, duration }),
  info: (message: string, action?: ToastAction, duration?: number) =>
    useUIStore.getState().addToast({ variant: 'info', message, action, duration }),
};
