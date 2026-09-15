import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';

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
    },

    tickTimer: (state) => {
      if (state.isRunning && !state.isPaused) {
        state.elapsedSeconds += 1;
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
      state.isRunning = false;
      state.isPaused = false;
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

export default shopFloorTimerSlice.reducer;
