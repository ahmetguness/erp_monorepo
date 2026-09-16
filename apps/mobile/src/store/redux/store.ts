import { configureStore } from '@reduxjs/toolkit';
import warehouseSessionReducer from './warehouseSessionSlice';
import cartOrderReducer from './cartOrderSlice';
import shopFloorTimerReducer from './shopFloorTimerSlice';
import networkReducer from './networkSlice';
import offlineOutboxReducer from './offlineOutboxSlice';
import { offlineListenerMiddleware } from './offlineListenerMiddleware';

export const store = configureStore({
  reducer: {
    warehouseSession: warehouseSessionReducer,
    cartOrder: cartOrderReducer,
    shopFloorTimer: shopFloorTimerReducer,
    network: networkReducer,
    offlineOutbox: offlineOutboxReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).prepend(offlineListenerMiddleware.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
