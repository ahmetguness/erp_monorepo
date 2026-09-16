import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import type { AppDispatch, RootState } from './store';

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  connectionType: string;
}

const initialState: NetworkState = {
  isConnected: true,
  isInternetReachable: true,
  connectionType: 'unknown',
};

export const networkSlice = createSlice({
  name: 'network',
  initialState,
  reducers: {
    setNetworkState: (
      state,
      action: PayloadAction<{
        isConnected: boolean;
        isInternetReachable: boolean | null;
        connectionType: string;
      }>
    ) => {
      state.isConnected = action.payload.isConnected;
      state.isInternetReachable = action.payload.isInternetReachable;
      state.connectionType = action.payload.connectionType;
    },
  },
});

export const { setNetworkState } = networkSlice.actions;

export const selectIsOnline = (state: RootState): boolean => {
  const { isConnected, isInternetReachable } = state.network;
  // If isConnected is false, definitely offline. If isInternetReachable is false, also offline.
  return Boolean(isConnected && isInternetReachable !== false);
};

export const selectConnectionType = (state: RootState): string => state.network.connectionType;

/**
 * Initializes the NetInfo event subscription and returns an unsubscribe function.
 */
export function initNetworkListener(dispatch: AppDispatch): () => void {
  // Fetch initial network state
  NetInfo.fetch().then((state: NetInfoState) => {
    dispatch(
      setNetworkState({
        isConnected: Boolean(state.isConnected),
        isInternetReachable: state.isInternetReachable,
        connectionType: state.type,
      })
    );
  }).catch(() => {});

  // Subscribe to connectivity changes
  const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    dispatch(
      setNetworkState({
        isConnected: Boolean(state.isConnected),
        isInternetReachable: state.isInternetReachable,
        connectionType: state.type,
      })
    );
  });

  return unsubscribe;
}

export default networkSlice.reducer;
