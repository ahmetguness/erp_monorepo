import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';

export interface DowntimeLogEntry {
  reason: string;
  durationSeconds: number;
  note?: string;
}

export interface ShopFloorTimerState {
  activeWorkOrderId: string | null;
  activeOperationId: string | null;
  workOrderNumber: string | null;
  productName: string | null;
  operationName: string | null;
  startTime: number | null; // epoch timestamp ms
  elapsedSeconds: number;
  isRunning: boolean;
  isPaused: boolean;

  // 16.2: Downtime / Duruş Tracking
  isDowntime: boolean;
  downtimeReason: string | null;
  downtimeNote: string | null;
  downtimeStartTime: number | null;
  downtimeSeconds: number;
  totalDowntimeSeconds: number;
  downtimeLogs: DowntimeLogEntry[];
}

const initialState: ShopFloorTimerState = {
  activeWorkOrderId: null,
  activeOperationId: null,
  workOrderNumber: null,
  productName: null,
  operationName: null,
  startTime: null,
  elapsedSeconds: 0,
  isRunning: false,
  isPaused: false,

  isDowntime: false,
  downtimeReason: null,
  downtimeNote: null,
  downtimeStartTime: null,
  downtimeSeconds: 0,
  totalDowntimeSeconds: 0,
  downtimeLogs: [],
};

export const shopFloorTimerSlice = createSlice({
  name: 'shopFloorTimer',
  initialState,
  reducers: {
    startTimer: (
      state,
      action: PayloadAction<{
        workOrderId: string;
        operationId?: string | null;
        workOrderNumber: string;
        productName?: string | null;
        operationName?: string | null;
      }>
    ) => {
      state.activeWorkOrderId = action.payload.workOrderId;
      state.activeOperationId = action.payload.operationId || null;
      state.workOrderNumber = action.payload.workOrderNumber;
      state.productName = action.payload.productName || null;
      state.operationName = action.payload.operationName || null;
      state.startTime = Date.now();
      state.elapsedSeconds = 0;
      state.isRunning = true;
      state.isPaused = false;

      state.isDowntime = false;
      state.downtimeReason = null;
      state.downtimeNote = null;
      state.downtimeStartTime = null;
      state.downtimeSeconds = 0;
      state.totalDowntimeSeconds = 0;
      state.downtimeLogs = [];
    },

    tickTimer: (state) => {
      if (state.isRunning && !state.isPaused) {
        if (state.isDowntime) {
          state.downtimeSeconds += 1;
          state.totalDowntimeSeconds += 1;
        } else {
          state.elapsedSeconds += 1;
        }
      }
    },

    pauseTimer: (state) => {
      if (state.isRunning) {
        state.isPaused = true;
      }
    },

    resumeTimer: (state) => {
      if (state.isRunning) {
        state.isPaused = false;
      }
    },

    stopTimer: (state) => {
      if (state.isDowntime) {
        state.downtimeLogs.push({
          reason: state.downtimeReason || 'Duruş',
          durationSeconds: state.downtimeSeconds,
          note: state.downtimeNote || undefined,
        });
      }
      state.isRunning = false;
      state.isPaused = false;
      state.isDowntime = false;
      state.downtimeReason = null;
      state.downtimeNote = null;
      state.downtimeSeconds = 0;
    },

    startDowntime: (
      state,
      action: PayloadAction<{
        reason: string;
        note?: string;
      }>
    ) => {
      if (!state.isRunning) return;
      state.isDowntime = true;
      state.downtimeReason = action.payload.reason;
      state.downtimeNote = action.payload.note || null;
      state.downtimeStartTime = Date.now();
      state.downtimeSeconds = 0;
    },

    endDowntime: (state) => {
      if (state.isDowntime) {
        state.downtimeLogs.push({
          reason: state.downtimeReason || 'Duruş',
          durationSeconds: state.downtimeSeconds,
          note: state.downtimeNote || undefined,
        });
      }
      state.isDowntime = false;
      state.downtimeReason = null;
      state.downtimeNote = null;
      state.downtimeStartTime = null;
      state.downtimeSeconds = 0;
    },

    resetTimer: () => initialState,
  },
});

export const {
  startTimer,
  tickTimer,
  pauseTimer,
  resumeTimer,
  stopTimer,
  startDowntime,
  endDowntime,
  resetTimer,
} = shopFloorTimerSlice.actions;

// ─────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────

interface StateWithTimer {
  shopFloorTimer: ShopFloorTimerState;
}

export const selectShopFloorTimer = (state: StateWithTimer) => state.shopFloorTimer;

export const selectIsTimerRunning = createSelector(
  [selectShopFloorTimer],
  (timer) => timer.isRunning
);

export const selectIsDowntime = createSelector(
  [selectShopFloorTimer],
  (timer) => timer.isDowntime
);

export const selectDowntimeReason = createSelector(
  [selectShopFloorTimer],
  (timer) => timer.downtimeReason
);

export const selectTotalDowntimeSeconds = createSelector(
  [selectShopFloorTimer],
  (timer) => timer.totalDowntimeSeconds
);

export const selectDowntimeLogs = createSelector(
  [selectShopFloorTimer],
  (timer) => timer.downtimeLogs
);

export const selectFormattedElapsedTime = createSelector(
  [selectShopFloorTimer],
  (timer) => {
    const totalSec = timer.elapsedSeconds;
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
);

export const selectFormattedDowntime = createSelector(
  [selectShopFloorTimer],
  (timer) => {
    const totalSec = timer.downtimeSeconds;
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(minutes)}:${pad(seconds)}`;
  }
);

export default shopFloorTimerSlice.reducer;
