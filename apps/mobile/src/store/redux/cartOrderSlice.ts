import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';

export interface CustomerRef {
  id: string;
  name: string;
  code?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  creditLimit?: number | null;
  currentBalance?: number;
  riskLevel?: 'safe' | 'warning' | 'exceeded' | 'none';
}

export interface CartOrderItem {
  productId: string;
  code: string;
  name: string;
  barcode?: string | null;
  unitPrice: number;
  taxRate: number;
  discount: number; // satır bazlı iskonto yüzdesi (0-100)
  quantity: number;
  unit?: string;
  stockQuantity?: number;
}

export interface CartOrderState {
  selectedContact: CustomerRef | null;
  items: Record<string, CartOrderItem>; // key: productId
  generalDiscountPercent: number; // genel sepet iskontosu yüzdesi (0-100)
  orderDate: string; // ISO date
  dueDate: string | null; // ISO date
  notes: string;
  deliveryAddress: string;
  lastCreatedOrderNumber: string | null;
}

const initialState: CartOrderState = {
  selectedContact: null,
  items: {},
  generalDiscountPercent: 0,
  orderDate: new Date().toISOString(),
  dueDate: null,
  notes: '',
  deliveryAddress: '',
  lastCreatedOrderNumber: null,
};

export const cartOrderSlice = createSlice({
  name: 'cartOrder',
  initialState,
  reducers: {
    selectContact: (state, action: PayloadAction<CustomerRef>) => {
      state.selectedContact = action.payload;
      if (action.payload.address && !state.deliveryAddress) {
        state.deliveryAddress = action.payload.address;
      }
    },

    clearContact: (state) => {
      state.selectedContact = null;
    },

    addItemToCart: (
      state,
      action: PayloadAction<{
        productId: string;
        code: string;
        name: string;
        barcode?: string | null;
        unitPrice: number;
        taxRate?: number;
        discount?: number;
        quantity?: number;
        unit?: string;
        stockQuantity?: number;
      }>
    ) => {
      const {
        productId,
        code,
        name,
        barcode = null,
        unitPrice,
        taxRate = 20,
        discount = 0,
        quantity = 1,
        unit = 'AD',
        stockQuantity,
      } = action.payload;

      if (state.items[productId]) {
        state.items[productId].quantity += quantity;
      } else {
        state.items[productId] = {
          productId,
          code,
          name,
          barcode,
          unitPrice,
          taxRate,
          discount,
          quantity,
          unit,
          stockQuantity,
        };
      }
    },

    updateItemQuantity: (
      state,
      action: PayloadAction<{ productId: string; quantity: number }>
    ) => {
      const { productId, quantity } = action.payload;
      if (quantity <= 0) {
        delete state.items[productId];
      } else if (state.items[productId]) {
        state.items[productId].quantity = quantity;
      }
    },

    updateItemDiscount: (
      state,
      action: PayloadAction<{ productId: string; discount: number }>
    ) => {
      const { productId, discount } = action.payload;
      if (state.items[productId]) {
        state.items[productId].discount = Math.min(100, Math.max(0, discount));
      }
    },

    updateItemUnitPrice: (
      state,
      action: PayloadAction<{ productId: string; unitPrice: number }>
    ) => {
      const { productId, unitPrice } = action.payload;
      if (state.items[productId]) {
        state.items[productId].unitPrice = Math.max(0, unitPrice);
      }
    },

    removeItemFromCart: (state, action: PayloadAction<string>) => {
      delete state.items[action.payload];
    },

    setGeneralDiscountPercent: (state, action: PayloadAction<number>) => {
      state.generalDiscountPercent = Math.min(100, Math.max(0, action.payload));
    },

    setOrderMetadata: (
      state,
      action: PayloadAction<{
        orderDate?: string;
        dueDate?: string | null;
        notes?: string;
        deliveryAddress?: string;
      }>
    ) => {
      if (action.payload.orderDate !== undefined) {
        state.orderDate = action.payload.orderDate;
      }
      if (action.payload.dueDate !== undefined) {
        state.dueDate = action.payload.dueDate;
      }
      if (action.payload.notes !== undefined) {
        state.notes = action.payload.notes;
      }
      if (action.payload.deliveryAddress !== undefined) {
        state.deliveryAddress = action.payload.deliveryAddress;
      }
    },

    setLastCreatedOrderNumber: (state, action: PayloadAction<string | null>) => {
      state.lastCreatedOrderNumber = action.payload;
    },

    loadItemsIntoCart: (
      state,
      action: PayloadAction<{
        contact?: CustomerRef | null;
        items: CartOrderItem[];
        generalDiscountPercent?: number;
        notes?: string;
      }>
    ) => {
      if (action.payload.contact) {
        state.selectedContact = action.payload.contact;
        if (action.payload.contact.address && !state.deliveryAddress) {
          state.deliveryAddress = action.payload.contact.address;
        }
      }
      state.items = {};
      action.payload.items.forEach((item) => {
        state.items[item.productId] = item;
      });
      state.generalDiscountPercent = action.payload.generalDiscountPercent || 0;
      if (action.payload.notes) {
        state.notes = action.payload.notes;
      }
    },

    clearCartItems: (state) => {
      state.items = {};
      state.generalDiscountPercent = 0;
      state.notes = '';
      state.dueDate = null;
    },

    resetCartOrder: () => initialState,
  },
});

export const {
  selectContact,
  clearContact,
  addItemToCart,
  updateItemQuantity,
  updateItemDiscount,
  updateItemUnitPrice,
  removeItemFromCart,
  setGeneralDiscountPercent,
  setOrderMetadata,
  setLastCreatedOrderNumber,
  loadItemsIntoCart,
  clearCartItems,
  resetCartOrder,
} = cartOrderSlice.actions;

// ─────────────────────────────────────────────
// Reselect Memoized Selectors
// ─────────────────────────────────────────────

interface StateWithCart {
  cartOrder: CartOrderState;
}

export const selectCartOrder = (state: StateWithCart) => state.cartOrder;

export const selectCartContact = createSelector(
  [selectCartOrder],
  (cart) => cart.selectedContact
);

export const selectCartItemsList = createSelector(
  [selectCartOrder],
  (cart) => Object.values(cart.items)
);

export const selectCartTotals = createSelector(
  [selectCartItemsList, selectCartOrder],
  (items, cart) => {
    let subtotal = 0;
    let lineDiscountTotal = 0;
    let totalTax = 0;
    let totalQuantity = 0;

    items.forEach((item) => {
      const lineGross = item.quantity * item.unitPrice;
      const itemDisc = Math.min(100, Math.max(0, item.discount));
      const lineDiscount = lineGross * (itemDisc / 100);
      const lineNet = lineGross - lineDiscount;

      subtotal += lineGross;
      lineDiscountTotal += lineDiscount;
      totalQuantity += item.quantity;
    });

    const netAfterLineDisc = Math.max(0, subtotal - lineDiscountTotal);
    const genDisc = Math.min(100, Math.max(0, cart.generalDiscountPercent));
    const generalDiscountTotal = netAfterLineDisc * (genDisc / 100);
    const totalDiscount = lineDiscountTotal + generalDiscountTotal;
    const taxableAmount = Math.max(0, netAfterLineDisc - generalDiscountTotal);

    // Calculate tax proportionally on discounted lines
    const discountRatio = netAfterLineDisc > 0 ? taxableAmount / netAfterLineDisc : 1;

    items.forEach((item) => {
      const lineGross = item.quantity * item.unitPrice;
      const itemDisc = Math.min(100, Math.max(0, item.discount));
      const lineNet = lineGross * (1 - itemDisc / 100);
      const effectiveLineNet = lineNet * discountRatio;
      const taxAmount = effectiveLineNet * (item.taxRate / 100);
      totalTax += taxAmount;
    });

    const grandTotal = taxableAmount + totalTax;

    return {
      subtotal,
      lineDiscountTotal,
      generalDiscountTotal,
      totalDiscount,
      taxableAmount,
      totalTax,
      grandTotal,
      totalItems: items.length,
      totalQuantity,
    };
  }
);

export const selectIsRiskLimitExceeded = createSelector(
  [selectCartContact, selectCartTotals],
  (contact, totals) => {
    if (!contact || !contact.creditLimit || contact.creditLimit <= 0) {
      return false;
    }
    const currentBalance = contact.currentBalance ?? 0;
    const projectedBalance = currentBalance + totals.grandTotal;
    return projectedBalance > contact.creditLimit;
  }
);

export default cartOrderSlice.reducer;
