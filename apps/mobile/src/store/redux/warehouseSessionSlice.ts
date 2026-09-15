import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';

export type WarehouseSessionMode = 'LOOKUP' | 'COUNT' | 'TRANSFER' | 'DELIVERY' | 'LOT_SERIAL';

export interface ScannedBarcodeEntry {
  id: string;
  barcode: string;
  scannedAt: number;
  productId?: string;
  productCode?: string;
  productName?: string;
  quantity: number;
}

export interface ExpectedItem {
  productId: string;
  productCode: string;
  productName: string;
  barcode?: string | null;
  expectedQty: number;
  countedQty: number;
}

export interface TransferCartItem {
  productId: string;
  productCode: string;
  productName: string;
  barcode?: string | null;
  quantity: number;
  availableStock?: number;
}

export interface WarehouseSessionState {
  activeMode: WarehouseSessionMode;
  selectedWarehouseId: string | null;
  targetWarehouseId: string | null;
  isContinuousScan: boolean;
  isTorchOn: boolean;
  scanBuffer: ScannedBarcodeEntry[];
  lastScannedBarcode: string | null;
  lastScannedTime: number | null;
  duplicateScanWarning: boolean;
  expectedItems: Record<string, ExpectedItem>; // key: productId or barcode
  unmatchedScans: ScannedBarcodeEntry[];
  transferCart: Record<string, TransferCartItem>; // key: productId
  activeDeliveryNoteId: string | null;
}

const initialState: WarehouseSessionState = {
  activeMode: 'LOOKUP',
  selectedWarehouseId: null,
  targetWarehouseId: null,
  isContinuousScan: false,
  isTorchOn: false,
  scanBuffer: [],
  lastScannedBarcode: null,
  lastScannedTime: null,
  duplicateScanWarning: false,
  expectedItems: {},
  unmatchedScans: [],
  transferCart: {},
  activeDeliveryNoteId: null,
};

const DUPLICATE_COOLDOWN_MS = 1500;

export const warehouseSessionSlice = createSlice({
  name: 'warehouseSession',
  initialState,
  reducers: {
    setMode: (state, action: PayloadAction<WarehouseSessionMode>) => {
      state.activeMode = action.payload;
      state.duplicateScanWarning = false;
    },

    setWarehouses: (
      state,
      action: PayloadAction<{ fromWarehouseId?: string | null; toWarehouseId?: string | null }>
    ) => {
      if (action.payload.fromWarehouseId !== undefined) {
        state.selectedWarehouseId = action.payload.fromWarehouseId;
      }
      if (action.payload.toWarehouseId !== undefined) {
        state.targetWarehouseId = action.payload.toWarehouseId;
      }
    },

    toggleContinuousScan: (state) => {
      state.isContinuousScan = !state.isContinuousScan;
    },

    setContinuousScan: (state, action: PayloadAction<boolean>) => {
      state.isContinuousScan = action.payload;
    },

    toggleTorch: (state) => {
      state.isTorchOn = !state.isTorchOn;
    },

    setTorch: (state, action: PayloadAction<boolean>) => {
      state.isTorchOn = action.payload;
    },

    dismissDuplicateWarning: (state) => {
      state.duplicateScanWarning = false;
    },

    /**
     * Record a scan event into the buffer with throttling and reconciliation
     */
    addScan: (
      state,
      action: PayloadAction<{
        barcode: string;
        productId?: string;
        productCode?: string;
        productName?: string;
        quantity?: number;
      }>
    ) => {
      const now = Date.now();
      const { barcode, productId, productCode, productName, quantity = 1 } = action.payload;

      // Throttle check for continuous duplicate scanning
      if (
        state.lastScannedBarcode === barcode &&
        state.lastScannedTime &&
        now - state.lastScannedTime < DUPLICATE_COOLDOWN_MS
      ) {
        state.duplicateScanWarning = true;
        return;
      }

      state.lastScannedBarcode = barcode;
      state.lastScannedTime = now;
      state.duplicateScanWarning = false;

      const scanEntry: ScannedBarcodeEntry = {
        id: `${now}-${Math.random().toString(36).substr(2, 6)}`,
        barcode,
        scannedAt: now,
        productId,
        productCode,
        productName,
        quantity,
      };

      state.scanBuffer.push(scanEntry);

      // Reconcile with expected items (for COUNT and DELIVERY modes)
      let matchedKey: string | null = null;
      if (productId && state.expectedItems[productId]) {
        matchedKey = productId;
      } else if (state.expectedItems[barcode]) {
        matchedKey = barcode;
      } else {
        // Search by barcode attribute in expectedItems
        const found = Object.entries(state.expectedItems).find(
          ([_, item]) => item.barcode === barcode || item.productCode === barcode
        );
        if (found) matchedKey = found[0];
      }

      if (matchedKey) {
        state.expectedItems[matchedKey].countedQty += quantity;
      } else if (state.activeMode === 'COUNT' || state.activeMode === 'DELIVERY') {
        state.unmatchedScans.push(scanEntry);
      }

      // If in TRANSFER mode, also update transferCart
      if (state.activeMode === 'TRANSFER' && productId) {
        if (state.transferCart[productId]) {
          state.transferCart[productId].quantity += quantity;
        } else {
          state.transferCart[productId] = {
            productId,
            productCode: productCode || barcode,
            productName: productName || 'Bilinmeyen Ürün',
            barcode,
            quantity,
          };
        }
      }
    },

    /**
     * Undo the last scan event from the buffer
     */
    undoLastScan: (state) => {
      const last = state.scanBuffer.pop();
      if (!last) return;

      // Rollback expected items
      let matchedKey: string | null = null;
      if (last.productId && state.expectedItems[last.productId]) {
        matchedKey = last.productId;
      } else if (state.expectedItems[last.barcode]) {
        matchedKey = last.barcode;
      } else {
        const found = Object.entries(state.expectedItems).find(
          ([_, item]) => item.barcode === last.barcode || item.productCode === last.barcode
        );
        if (found) matchedKey = found[0];
      }

      if (matchedKey && state.expectedItems[matchedKey]) {
        state.expectedItems[matchedKey].countedQty = Math.max(
          0,
          state.expectedItems[matchedKey].countedQty - last.quantity
        );
      } else {
        state.unmatchedScans = state.unmatchedScans.filter((s) => s.id !== last.id);
      }

      // Rollback transferCart if needed
      if (last.productId && state.transferCart[last.productId]) {
        const newQty = state.transferCart[last.productId].quantity - last.quantity;
        if (newQty <= 0) {
          delete state.transferCart[last.productId];
        } else {
          state.transferCart[last.productId].quantity = newQty;
        }
      }

      state.lastScannedBarcode = null;
      state.lastScannedTime = null;
      state.duplicateScanWarning = false;
    },

    /**
     * Set baseline expected items for stock count or delivery note verification
     */
    setExpectedItems: (state, action: PayloadAction<ExpectedItem[]>) => {
      const map: Record<string, ExpectedItem> = {};
      action.payload.forEach((item) => {
        map[item.productId] = { ...item };
      });
      state.expectedItems = map;
      state.scanBuffer = [];
      state.unmatchedScans = [];
      state.duplicateScanWarning = false;
    },

    updateCountedQty: (
      state,
      action: PayloadAction<{ productId: string; countedQty: number }>
    ) => {
      const { productId, countedQty } = action.payload;
      if (state.expectedItems[productId]) {
        state.expectedItems[productId].countedQty = Math.max(0, countedQty);
      }
    },

    /**
     * Transfer Cart Management
     */
    setTransferCartItemQty: (
      state,
      action: PayloadAction<{ productId: string; quantity: number }>
    ) => {
      const { productId, quantity } = action.payload;
      if (quantity <= 0) {
        delete state.transferCart[productId];
      } else if (state.transferCart[productId]) {
        state.transferCart[productId].quantity = quantity;
      }
    },

    removeTransferCartItem: (state, action: PayloadAction<string>) => {
      delete state.transferCart[action.payload];
    },

    clearTransferCart: (state) => {
      state.transferCart = {};
    },

    setActiveDeliveryNote: (state, action: PayloadAction<string | null>) => {
      state.activeDeliveryNoteId = action.payload;
    },

    /**
     * Clear all session scan states
     */
    resetSession: (state) => {
      state.scanBuffer = [];
      state.lastScannedBarcode = null;
      state.lastScannedTime = null;
      state.duplicateScanWarning = false;
      state.expectedItems = {};
      state.unmatchedScans = [];
      state.transferCart = {};
      state.activeDeliveryNoteId = null;
    },
  },
});

export const {
  setMode,
  setWarehouses,
  toggleContinuousScan,
  setContinuousScan,
  toggleTorch,
  setTorch,
  dismissDuplicateWarning,
  addScan,
  undoLastScan,
  setExpectedItems,
  updateCountedQty,
  setTransferCartItemQty,
  removeTransferCartItem,
  clearTransferCart,
  setActiveDeliveryNote,
  resetSession,
} = warehouseSessionSlice.actions;

// ─────────────────────────────────────────────
// Reselect Memoized Selectors
// ─────────────────────────────────────────────

interface StateWithSession {
  warehouseSession: WarehouseSessionState;
}

export const selectWarehouseSession = (state: StateWithSession) => state.warehouseSession;

export const selectScanBuffer = createSelector(
  [selectWarehouseSession],
  (session) => session.scanBuffer
);

export const selectExpectedItemsList = createSelector(
  [selectWarehouseSession],
  (session) => Object.values(session.expectedItems)
);

export const selectTransferCartList = createSelector(
  [selectWarehouseSession],
  (session) => Object.values(session.transferCart)
);

export const selectMatchedSummary = createSelector(
  [selectExpectedItemsList, selectWarehouseSession],
  (items, session) => {
    let exactMatches = 0;
    let underCount = 0;
    let overCount = 0;
    let notStarted = 0;
    let totalExpected = 0;
    let totalCounted = 0;

    items.forEach((item) => {
      totalExpected += item.expectedQty;
      totalCounted += item.countedQty;

      if (item.countedQty === 0 && item.expectedQty > 0) {
        notStarted++;
      } else if (item.countedQty === item.expectedQty) {
        exactMatches++;
      } else if (item.countedQty < item.expectedQty) {
        underCount++;
      } else {
        overCount++;
      }
    });

    const isFullyVerified = items.length > 0 && exactMatches === items.length;

    return {
      totalExpected,
      totalCounted,
      totalItems: items.length,
      exactMatches,
      underCount,
      overCount,
      notStarted,
      unmatchedCount: session.unmatchedScans.length,
      isFullyVerified,
    };
  }
);

export default warehouseSessionSlice.reducer;
