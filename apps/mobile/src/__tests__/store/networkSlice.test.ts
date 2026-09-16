import { describe, it, expect } from 'vitest';
import { networkSlice, setNetworkState, selectIsOnline, NetworkState } from '../../store/redux/networkSlice';
import type { RootState } from '../../store/redux/store';

describe('networkSlice Reducer and Selectors', () => {
  const initialNetworkState: NetworkState = {
    isConnected: true,
    isInternetReachable: true,
    connectionType: 'unknown',
  };

  it('should update network state on setNetworkState action', () => {
    const nextState = networkSlice.reducer(
      initialNetworkState,
      setNetworkState({
        isConnected: false,
        isInternetReachable: false,
        connectionType: 'none',
      })
    );

    expect(nextState.isConnected).toBe(false);
    expect(nextState.isInternetReachable).toBe(false);
    expect(nextState.connectionType).toBe('none');
  });

  it('selectIsOnline should return true only when connected and internet is reachable', () => {
    const mockRootState = (network: NetworkState): RootState =>
      ({ network } as unknown as RootState);

    // Fully online
    expect(
      selectIsOnline(
        mockRootState({ isConnected: true, isInternetReachable: true, connectionType: 'wifi' })
      )
    ).toBe(true);

    // Disconnected
    expect(
      selectIsOnline(
        mockRootState({ isConnected: false, isInternetReachable: false, connectionType: 'none' })
      )
    ).toBe(false);

    // Connected to Wi-Fi but captive portal / no internet
    expect(
      selectIsOnline(
        mockRootState({ isConnected: true, isInternetReachable: false, connectionType: 'wifi' })
      )
    ).toBe(false);
  });
});
