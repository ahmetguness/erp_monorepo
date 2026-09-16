import React, { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, View, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import TenantSelectScreen from '../screens/TenantSelectScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import FieldServiceScreen from '../screens/FieldServiceScreen';
import ProductionScreen from '../screens/ProductionScreen';
import FinanceScreen from '../screens/FinanceScreen';
import EmployeePortalScreen from '../screens/EmployeePortalScreen';
import ProcurementScreen from '../screens/ProcurementScreen';
import CopilotScreen from '../screens/CopilotScreen';
import { BiometricLockView } from '../components/BiometricLockView';
import {
  OfflineStatusBar,
  OutboxQueueModal,
  ConflictResolutionModal,
} from '../components/offline';
import { RootStackParamList } from '../types/navigation.types';
import { useAuthStore } from '../store/auth.store';
import { useAppDispatch } from '../store/redux';
import {
  initNetworkListener,
  loadPersistedOutbox,
} from '../store/redux';
import { checkDeviceIntegrity } from '../services/security.service';
import { useTheme } from '../theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isBiometricEnabled = useAuthStore((state) => state.isBiometricEnabled);
  const isBiometricLocked = useAuthStore((state) => state.isBiometricLocked);
  const setBiometricLocked = useAuthStore((state) => state.setBiometricLocked);

  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);

  const appState = useRef(AppState.currentState);
  const { theme, isDark } = useTheme();

  // 10.2 & 10.3: Initialize network listener and load persisted offline outbox
  useEffect(() => {
    loadPersistedOutbox(dispatch);
    const unsubscribeNet = initNetworkListener(dispatch);
    return () => {
      unsubscribeNet();
    };
  }, [dispatch]);

  // 11.2: Security Device Integrity Audit on Cold Start
  useEffect(() => {
    checkDeviceIntegrity().then((report) => {
      if (report.isCompromised) {
        console.warn('[SecurityAudit] High/Critical device risk detected:', report.detectedThreats);
      }
    }).catch(() => {});
  }, []);

  // Cold-start: Lock immediately on initial mount if authenticated with biometrics enabled
  useEffect(() => {
    if (isAuthenticated && isBiometricEnabled) {
      setBiometricLocked(true);
    }
  }, []);

  // AppState listener for locking when returning from background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        if (isAuthenticated && isBiometricEnabled) {
          setBiometricLocked(true);
        }
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, isBiometricEnabled, setBiometricLocked]);

  const navigationTheme = isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: theme.colors.primary,
          background: theme.colors.background,
          card: theme.colors.surface,
          text: theme.colors.text,
          border: theme.colors.border,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: theme.colors.primary,
          background: theme.colors.background,
          card: theme.colors.surface,
          text: theme.colors.text,
          border: theme.colors.border,
        },
      };

  return (
    <View style={styles.container}>
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
          {!isAuthenticated ? (
            <Stack.Screen name="Auth" component={AuthNavigator} />
          ) : (
            <>
              <Stack.Screen name="Main" component={MainTabNavigator} />
              <Stack.Screen
                name="TenantSelect"
                component={TenantSelectScreen}
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="Notifications"
                component={NotificationsScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <Stack.Screen
                name="FieldService"
                component={FieldServiceScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <Stack.Screen
                name="ProductionShopFloor"
                component={ProductionScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <Stack.Screen
                name="Finance"
                component={FinanceScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <Stack.Screen
                name="EmployeePortal"
                component={EmployeePortalScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <Stack.Screen
                name="Procurement"
                component={ProcurementScreen}
                options={{ presentation: 'card', animation: 'slide_from_right' }}
              />
              <Stack.Screen
                name="Copilot"
                component={CopilotScreen}
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>

      {/* 10.3: Global Top Offline Status Bar (Floating top overlay when authenticated) */}
      {isAuthenticated && (
        <View style={styles.statusBarWrap} pointerEvents="box-none">
          <OfflineStatusBar
            onPressQueue={() => setIsQueueModalOpen(true)}
            onPressConflict={() => setIsConflictModalOpen(true)}
          />
        </View>
      )}

      {/* 10.2: Outbox Queue Drawer/Modal */}
      <OutboxQueueModal
        visible={isQueueModalOpen}
        onClose={() => setIsQueueModalOpen(false)}
        onOpenConflict={() => {
          setIsQueueModalOpen(false);
          setIsConflictModalOpen(true);
        }}
      />

      {/* 10.4: Conflict Resolution Modal */}
      <ConflictResolutionModal
        visible={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
      />

      {/* Biometric Security Lock Overlay */}
      {isAuthenticated && isBiometricEnabled && isBiometricLocked && (
        <BiometricLockView />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statusBarWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
  },
});
