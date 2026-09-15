import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, View, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthNavigator } from './AuthNavigator';
import { MainTabNavigator } from './MainTabNavigator';
import TenantSelectScreen from '../screens/TenantSelectScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import { BiometricLockView } from '../components/BiometricLockView';
import { RootStackParamList } from '../types/navigation.types';
import { useAuthStore } from '../store/auth.store';
import { useTheme } from '../theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isBiometricEnabled = useAuthStore((state) => state.isBiometricEnabled);
  const isBiometricLocked = useAuthStore((state) => state.isBiometricLocked);
  const setBiometricLocked = useAuthStore((state) => state.setBiometricLocked);

  const appState = useRef(AppState.currentState);
  const { theme, isDark } = useTheme();

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
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>

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
});
