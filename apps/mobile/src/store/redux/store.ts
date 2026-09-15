import { configureStore } from '@reduxjs/toolkit';
import warehouseSessionReducer from './warehouseSessionSlice';
import cartOrderReducer from './cartOrderSlice';
import shopFloorTimerReducer from './shopFloorTimerSlice';

export const store = configureStore({
  reducer: {
    warehouseSession: warehouseSessionReducer,
    cartOrder: cartOrderReducer,
    shopFloorTimer: shopFloorTimerReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
