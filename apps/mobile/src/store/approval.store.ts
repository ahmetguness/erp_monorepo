import { create } from 'zustand';
import * as Haptics from 'expo-haptics';
import {
  getApprovalRequests,
  getApprovalRequestById,
  executeApprovalAction,
  executeBatchApproval,
  ApprovalRequest,
  ApprovalStatus,
  ApprovalModule,
} from '../services/approval.service';

interface ApprovalState {
  requests: ApprovalRequest[];
  total: number;
  isLoading: boolean;
  isActing: boolean;
  error: string | null;
  filterStatus: ApprovalStatus | 'ALL';
  selectedModule: ApprovalModule | 'ALL';
  selectedIds: string[];
  isSelectionMode: boolean;
  activeRequest: ApprovalRequest | null;
}

interface ApprovalActions {
  loadRequests: (overrideStatus?: ApprovalStatus | 'ALL') => Promise<void>;
  loadRequestDetails: (id: string) => Promise<ApprovalRequest | null>;
  setActiveRequest: (request: ApprovalRequest | null) => void;
  approveRequest: (id: string, notes?: string) => Promise<boolean>;
  rejectRequest: (id: string, reason: string) => Promise<boolean>;
  batchExecute: (actionType: 'APPROVE' | 'REJECT', notes?: string) => Promise<boolean>;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setSelectionMode: (enabled: boolean) => void;
  setFilterStatus: (status: ApprovalStatus | 'ALL') => void;
  setSelectedModule: (module: ApprovalModule | 'ALL') => void;
}

export type ApprovalStore = ApprovalState & ApprovalActions;

export const useApprovalStore = create<ApprovalStore>((set, get) => ({
  requests: [],
  total: 0,
  isLoading: false,
  isActing: false,
  error: null,
  filterStatus: 'PENDING',
  selectedModule: 'ALL',
  selectedIds: [],
  isSelectionMode: false,
  activeRequest: null,

  setActiveRequest: (request) => {
    set({ activeRequest: request });
  },

  setFilterStatus: (status) => {
    set({ filterStatus: status });
    get().loadRequests(status);
  },

  setSelectedModule: (module) => {
    set({ selectedModule: module });
  },

  setSelectionMode: (enabled) => {
    set({ isSelectionMode: enabled, selectedIds: [] });
  },

  toggleSelection: (id) => {
    const { selectedIds } = get();
    if (selectedIds.includes(id)) {
      set({ selectedIds: selectedIds.filter((item) => item !== id) });
    } else {
      set({ selectedIds: [...selectedIds, id] });
    }
  },

  selectAll: () => {
    const { requests, selectedModule } = get();
    const pendingIds = requests
      .filter((r) => r.status === 'PENDING' && (selectedModule === 'ALL' || r.flow?.module === selectedModule))
      .map((r) => r.id);
    set({ selectedIds: pendingIds });
  },

  clearSelection: () => {
    set({ selectedIds: [], isSelectionMode: false });
  },

  loadRequests: async (overrideStatus) => {
    const status = overrideStatus ?? get().filterStatus;
    set({ isLoading: true, error: null });
    try {
      const response = await getApprovalRequests({
        status: status === 'ALL' ? undefined : status,
        limit: 50,
      });
      set({
        requests: response.requests,
        total: response.total,
        isLoading: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Onay talepleri yüklenemedi';
      set({ error: msg, isLoading: false });
    }
  },

  loadRequestDetails: async (id: string) => {
    try {
      const detail = await getApprovalRequestById(id);
      set({ activeRequest: detail });
      return detail;
    } catch (err) {
      console.warn('[ApprovalStore] Failed to load request details:', err);
      return null;
    }
  },

  approveRequest: async (id: string, notes?: string) => {
    set({ isActing: true });
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const res = await executeApprovalAction(id, 'APPROVE', notes);

      // Optimistic update local list
      set((state) => ({
        requests: state.requests.map((r) =>
          r.id === id ? { ...r, status: res.request.status, currentStep: res.request.currentStep } : r
        ),
        activeRequest: state.activeRequest?.id === id
          ? { ...state.activeRequest, status: res.request.status }
          : state.activeRequest,
        isActing: false,
      }));
      return true;
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      console.warn('[ApprovalStore] Approve failed:', err);
      set({ isActing: false });
      return false;
    }
  },

  rejectRequest: async (id: string, reason: string) => {
    set({ isActing: true });
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      const res = await executeApprovalAction(id, 'REJECT', reason);

      set((state) => ({
        requests: state.requests.map((r) =>
          r.id === id ? { ...r, status: res.request.status } : r
        ),
        activeRequest: state.activeRequest?.id === id
          ? { ...state.activeRequest, status: res.request.status }
          : state.activeRequest,
        isActing: false,
      }));
      return true;
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      console.warn('[ApprovalStore] Reject failed:', err);
      set({ isActing: false });
      return false;
    }
  },

  batchExecute: async (actionType: 'APPROVE' | 'REJECT', notes?: string) => {
    const { selectedIds } = get();
    if (selectedIds.length === 0) return false;

    set({ isActing: true });
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      const res = await executeBatchApproval(selectedIds, actionType, notes);

      // Update matching requests status
      const updatedMap = new Map(res.items.map((i) => [i.id, i.status]));
      set((state) => ({
        requests: state.requests.map((r) =>
          updatedMap.has(r.id) ? { ...r, status: updatedMap.get(r.id)! } : r
        ),
        selectedIds: [],
        isSelectionMode: false,
        isActing: false,
      }));
      return true;
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      console.warn('[ApprovalStore] Batch execute failed:', err);
      set({ isActing: false });
      return false;
    }
  },
}));
