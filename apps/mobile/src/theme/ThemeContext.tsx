import React, { createContext, useContext, useState, useMemo, useEffect, ReactNode } from 'react';
import { useColorScheme as useDeviceColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, highContrastThemeColors, ThemeColors } from './colors';
import { typography, Typography } from './typography';
import { spacing, Spacing } from './spacing';
import { borderRadius, BorderRadius } from './borderRadius';
import { createShadows } from './shadows';

export type ThemeMode = 'system' | 'light' | 'dark' | 'high-contrast';

export interface AppTheme {
  colors: ThemeColors;
  typography: Typography;
  spacing: Spacing;
  borderRadius: BorderRadius;
  shadows: ReturnType<typeof createShadows>;
  isDark: boolean;
  isHighContrast?: boolean;
}

export interface ThemeContextType {
  theme: AppTheme;
  themeMode: ThemeMode;
  isDark: boolean;
  isHighContrast: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  toggleHighContrast: () => void;
}

const THEME_STORAGE_KEY = 'axon_theme_mode';

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const deviceColorScheme = useDeviceColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((savedMode) => {
        if (
          savedMode === 'light' ||
          savedMode === 'dark' ||
          savedMode === 'system' ||
          savedMode === 'high-contrast'
        ) {
          setThemeModeState(savedMode as ThemeMode);
        }
      })
      .catch(() => {
        // Ignore storage errors on boot
      });
  }, []);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(() => {});
  };

  const toggleTheme = () => {
    if (themeMode === 'light') {
      setThemeMode('dark');
    } else {
      setThemeMode('light');
    }
  };

  const toggleHighContrast = () => {
    if (themeMode === 'high-contrast') {
      setThemeMode('dark');
    } else {
      setThemeMode('high-contrast');
    }
  };

  const isHighContrast = themeMode === 'high-contrast';

  const isDark = useMemo(() => {
    if (themeMode === 'dark' || themeMode === 'high-contrast') return true;
    if (themeMode === 'light') return false;
    return deviceColorScheme === 'dark';
  }, [themeMode, deviceColorScheme]);

  const theme = useMemo<AppTheme>(() => {
    const colors = isHighContrast
      ? highContrastThemeColors
      : isDark
      ? darkColors
      : lightColors;
    const shadows = createShadows(isDark);

    return {
      colors,
      typography,
      spacing,
      borderRadius,
      shadows,
      isDark,
      isHighContrast,
    };
  }, [isDark, isHighContrast]);

  const value = useMemo(
    () => ({
      theme,
      themeMode,
      isDark,
      isHighContrast,
      setThemeMode,
      toggleTheme,
      toggleHighContrast,
    }),
    [theme, themeMode, isDark, isHighContrast]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
