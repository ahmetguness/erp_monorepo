import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OutboxMutationType } from '../../services/offline-sync.service';
import type { AppDispatch, RootState } from './store';

const OUTBOX_STORAGE_KEY = '@axon_offline_outbox_queue_v1';

export type OutboxMutationStatus =
  | 'QUEUED'
  | 'SYNCING'
  | 'FAILED'
  | 'RESOLVED_CONFLICT';

export interface OutboxConflictData {
  clientPayload: Record<string, unknown>;
  serverError?: string;
  conflictReason: string;
}

export interface OutboxMutation {
  id: string;
  idempotencyKey: string;
  type: OutboxMutationType;
  title: string;
  payload: Record<string, unknown>;
  status: OutboxMutationStatus;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  conflictData?: OutboxConflictData;
}

export interface OfflineOutboxState {
  mutations: OutboxMutation[];
  isSyncingQueue: boolean;
  lastSyncCompletedAt: string | null;
  activeConflictMutationId: string | null;
}

const initialState: OfflineOutboxState = {
  mutations: [],
  isSyncingQueue: false,
  lastSyncCompletedAt: null,
  activeConflictMutationId: null,
};

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getMutationTitle(type: OutboxMutationType, payload: Record<string, unknown>): string {
  switch (type) {
    case 'CREATE_SALES_ORDER':
      return `Satış Siparişi (${Array.isArray(payload.items) ? payload.items.length : 1} Kalem)`;
    case 'SUBMIT_STOCK_COUNT':
      return `Depo Stok Sayımı (${payload.warehouseId ?? 'Depo'})`;
    case 'CREATE_STOCK_MOVEMENT':
      return `Stok Hareketi (${payload.type ?? 'Transfer'})`;
    case 'SUBMIT_FIELD_SERVICE_CHECKPOINT':
      return `Saha Servis Notu / Formu`;
    case 'CREATE_LEAVE_REQUEST':
      return `İzin Talebi (${payload.type ?? 'Yıllık İzin'})`;
    default:
      return 'Çevrimdışı İşlem';
  }
}

async function persistQueueToStorage(mutations: OutboxMutation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(mutations));
  } catch (err) {
    console.warn('[OfflineOutbox] Failed to persist queue to storage:', err);
  }
}

export const offlineOutboxSlice = createSlice({
  name: 'offlineOutbox',
  initialState,
  reducers: {
    queueMutation: (
      state,
      action: PayloadAction<{
        type: OutboxMutationType;
        payload: Record<string, unknown>;
        title?: string;
      }>
    ) => {
      const now = new Date().toISOString();
      const newMutation: OutboxMutation = {
        id: generateUUID(),
        idempotencyKey: generateUUID(),
        type: action.payload.type,
        title: action.payload.title || getMutationTitle(action.payload.type, action.payload.payload),
        payload: action.payload.payload,
        status: 'QUEUED',
        retryCount: 0,
        maxRetries: 5,
        createdAt: now,
        updatedAt: now,
      };

      state.mutations.push(newMutation);
      persistQueueToStorage(state.mutations);
    },

    setMutationStatus: (
      state,
      action: PayloadAction<{
        id: string;
        status: OutboxMutationStatus;
        lastError?: string;
        incrementRetry?: boolean;
        conflictData?: OutboxConflictData;
      }>
    ) => {
      const mutation = state.mutations.find((m) => m.id === action.payload.id);
      if (mutation) {
        mutation.status = action.payload.status;
        mutation.updatedAt = new Date().toISOString();
        if (action.payload.lastError !== undefined) {
          mutation.lastError = action.payload.lastError;
        }
        if (action.payload.incrementRetry) {
          mutation.retryCount += 1;
        }
        if (action.payload.conflictData) {
          mutation.conflictData = action.payload.conflictData;
          state.activeConflictMutationId = mutation.id;
        }
        persistQueueToStorage(state.mutations);
      }
    },

    removeMutation: (state, action: PayloadAction<string>) => {
      state.mutations = state.mutations.filter((m) => m.id !== action.payload);
      if (state.activeConflictMutationId === action.payload) {
        state.activeConflictMutationId = null;
      }
      persistQueueToStorage(state.mutations);
    },

    resolveConflict: (
      state,
      action: PayloadAction<{
        id: string;
        action: 'retry' | 'discard' | 'update';
        updatedPayload?: Record<string, unknown>;
      }>
    ) => {
      const mutation = state.mutations.find((m) => m.id === action.payload.id);
      if (!mutation) return;

      if (action.payload.action === 'discard') {
        state.mutations = state.mutations.filter((m) => m.id !== action.payload.id);
      } else if (action.payload.action === 'retry') {
        mutation.status = 'QUEUED';
        mutation.idempotencyKey = generateUUID(); // fresh key for retry
        mutation.retryCount = 0;
        mutation.conflictData = undefined;
        mutation.lastError = undefined;
        mutation.updatedAt = new Date().toISOString();
      } else if (action.payload.action === 'update' && action.payload.updatedPayload) {
        mutation.payload = action.payload.updatedPayload;
        mutation.status = 'QUEUED';
        mutation.idempotencyKey = generateUUID();
        mutation.retryCount = 0;
        mutation.conflictData = undefined;
        mutation.lastError = undefined;
        mutation.updatedAt = new Date().toISOString();
      }

      if (state.activeConflictMutationId === action.payload.id) {
        state.activeConflictMutationId = null;
      }
      persistQueueToStorage(state.mutations);
    },

    setActiveConflictMutationId: (state, action: PayloadAction<string | null>) => {
      state.activeConflictMutationId = action.payload;
    },

    setSyncingQueue: (state, action: PayloadAction<boolean>) => {
      state.isSyncingQueue = action.payload;
      if (!action.payload) {
        state.lastSyncCompletedAt = new Date().toISOString();
      }
    },

    loadPersistedMutations: (state, action: PayloadAction<OutboxMutation[]>) => {
      state.mutations = action.payload;
      // Reset any stuck 'SYNCING' statuses from previous session to 'QUEUED'
      state.mutations.forEach((m) => {
        if (m.status === 'SYNCING') {
          m.status = 'QUEUED';
        }
      });
    },

    clearAllMutations: (state) => {
      state.mutations = [];
      state.activeConflictMutationId = null;
      persistQueueToStorage([]);
    },
  },
});

export const {
  queueMutation,
  setMutationStatus,
  removeMutation,
  resolveConflict,
  setActiveConflictMutationId,
  setSyncingQueue,
  loadPersistedMutations,
  clearAllMutations,
} = offlineOutboxSlice.actions;

// ─────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────

export const selectOutboxMutations = (state: RootState): OutboxMutation[] =>
  state.offlineOutbox.mutations;

export const selectPendingMutationsCount = (state: RootState): number =>
  state.offlineOutbox.mutations.filter((m) => m.status === 'QUEUED' || m.status === 'SYNCING').length;

export const selectFailedMutationsCount = (state: RootState): number =>
  state.offlineOutbox.mutations.filter((m) => m.status === 'FAILED').length;

export const selectConflictMutationsCount = (state: RootState): number =>
  state.offlineOutbox.mutations.filter((m) => m.status === 'RESOLVED_CONFLICT').length;

export const selectIsSyncingQueue = (state: RootState): boolean =>
  state.offlineOutbox.isSyncingQueue;

export const selectActiveConflictMutation = (state: RootState): OutboxMutation | null => {
  const activeId = state.offlineOutbox.activeConflictMutationId;
  if (!activeId) return null;
  return state.offlineOutbox.mutations.find((m) => m.id === activeId) ?? null;
};

// ─────────────────────────────────────────────
// Persistence Loader
// ─────────────────────────────────────────────

export async function loadPersistedOutbox(dispatch: AppDispatch): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_STORAGE_KEY);
    if (raw) {
      const parsed: OutboxMutation[] = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        dispatch(loadPersistedMutations(parsed));
      }
    }
  } catch (err) {
    console.warn('[OfflineOutbox] Failed to load persisted outbox:', err);
  }
}

export default offlineOutboxSlice.reducer;
