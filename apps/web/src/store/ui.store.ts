import { create } from 'zustand';

// ─────────────────────────────────────────────
// Toast notification type
// ─────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
  duration?: number;
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
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
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
    const duration = toast.duration ?? 4000;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => get().removeToast(id), duration);
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  toast: {
    success: (message) => get().addToast({ variant: 'success', message }),
    error: (message) => get().addToast({ variant: 'error', message }),
    warning: (message) => get().addToast({ variant: 'warning', message }),
    info: (message) => get().addToast({ variant: 'info', message }),
  },
}));

// Standalone toast helper — usable outside React components
export const toast = {
  success: (message: string) =>
    useUIStore.getState().addToast({ variant: 'success', message }),
  error: (message: string) =>
    useUIStore.getState().addToast({ variant: 'error', message }),
  warning: (message: string) =>
    useUIStore.getState().addToast({ variant: 'warning', message }),
  info: (message: string) =>
    useUIStore.getState().addToast({ variant: 'info', message }),
};
