// ⚠️ suppress-expo-go-warnings MUST be the very first import so that
// console patches are applied before expo-notifications module init runs.
import './src/lib/suppress-expo-go-warnings';

import React from 'react';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as ReduxProvider } from 'react-redux';
import { store } from './src/store/redux';
import { ThemeProvider } from './src/theme';
import { RootNavigator } from './src/navigation';
import { ErrorBoundary } from './src/components/common';

// Belt-and-suspenders: also remove from the in-app LogBox overlay UI
LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications',
  '`expo-notifications` functionality is not fully supported in Expo Go',
]);

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <ReduxProvider store={store}>
          <ThemeProvider>
            <RootNavigator />
          </ThemeProvider>
        </ReduxProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
