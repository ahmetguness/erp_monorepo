import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthUser, TenantInfo, AvailableTenant } from '../services/auth.service';
import { removeAuthToken } from '../lib/token-storage';

interface AuthState {
  user: AuthUser | null;
  tenant: TenantInfo | null;
  availableTenants: AvailableTenant[];
  isAuthenticated: boolean;
  isBiometricEnabled: boolean;
  isBiometricLocked: boolean;
  lastEmail: string | null;
}

interface AuthActions {
  login: (user: AuthUser, tenant: TenantInfo, availableTenants?: AvailableTenant[]) => void;
  switchTenant: (tenant: TenantInfo, user: AuthUser, availableTenants?: AvailableTenant[]) => void;
  logout: () => void;
  syncFromServer: (user: AuthUser, tenant: TenantInfo) => void;
  setBiometricEnabled: (enabled: boolean) => void;
  setBiometricLocked: (locked: boolean) => void;
  setAvailableTenants: (tenants: AvailableTenant[]) => void;
}

export type AuthStore = AuthState & AuthActions;

const initialState: AuthState = {
  user: null,
  tenant: null,
  availableTenants: [],
  isAuthenticated: false,
  isBiometricEnabled: false,
  isBiometricLocked: false,
  lastEmail: null,
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      ...initialState,

      login: (user, tenant, availableTenants = []) => {
        set({
          user,
          tenant,
          availableTenants,
          isAuthenticated: true,
          isBiometricLocked: false,
          lastEmail: user.email,
        });
      },

      switchTenant: (tenant, user, availableTenants) => {
        set((state) => ({
          tenant,
          user,
          availableTenants: availableTenants ?? state.availableTenants,
          isAuthenticated: true,
          isBiometricLocked: false,
          lastEmail: user.email,
        }));
      },

      logout: () => {
        removeAuthToken().catch(() => {});
        set((state) => ({
          ...initialState,
          // Biyometrik tercihini ve son e-postayı hatırla
          isBiometricEnabled: state.isBiometricEnabled,
          lastEmail: state.user?.email ?? state.lastEmail,
        }));
      },

      syncFromServer: (user, tenant) => {
        set({ user, tenant });
      },

      setBiometricEnabled: (isBiometricEnabled) => {
        set({ isBiometricEnabled });
      },

      setBiometricLocked: (isBiometricLocked) => {
        set({ isBiometricLocked });
      },

      setAvailableTenants: (availableTenants) => {
        set({ availableTenants });
      },
    }),
    {
      name: 'axon-mobile-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        availableTenants: state.availableTenants,
        isAuthenticated: state.isAuthenticated,
        isBiometricEnabled: state.isBiometricEnabled,
        lastEmail: state.lastEmail,
      }),
    }
  )
);

// Selectors
export const selectUser = (state: AuthStore) => state.user;
export const selectTenant = (state: AuthStore) => state.tenant;
export const selectAvailableTenants = (state: AuthStore) => state.availableTenants;
export const selectIsAuthenticated = (state: AuthStore) => state.isAuthenticated;
export const selectIsBiometricEnabled = (state: AuthStore) => state.isBiometricEnabled;
export const selectIsBiometricLocked = (state: AuthStore) => state.isBiometricLocked;
