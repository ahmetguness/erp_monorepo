import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import IntroScreen from './src/screens/IntroScreen';
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import { useAuthStore } from './src/store/auth.store';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'intro' | 'login'>('intro');
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (isAuthenticated) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <DashboardScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {currentScreen === 'intro' ? (
        <IntroScreen onNext={() => setCurrentScreen('login')} />
      ) : (
        <LoginScreen onBack={() => setCurrentScreen('intro')} />
      )}
    </SafeAreaProvider>
  );
}
