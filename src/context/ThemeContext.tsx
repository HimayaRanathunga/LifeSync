import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, spacing, radius, typography, gradients, type Colors } from '../theme/theme';

export type Scheme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  colors: Colors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  gradients: typeof gradients;
  scheme: Scheme;
  setScheme: (scheme: Scheme) => void;
  isDark: boolean;
}

const STORAGE_KEY = 'lifesync.themeScheme';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  // Defaults to 'system' immediately (no blank-screen flash while AsyncStorage loads); swaps to
  // the stored preference once read, if the user previously chose something other than 'system'.
  const [scheme, setSchemeState] = useState<Scheme>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') setSchemeState(stored);
    });
  }, []);

  const setScheme = (next: Scheme) => {
    setSchemeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  };

  const isDark = scheme === 'system' ? systemScheme === 'dark' : scheme === 'dark';
  const colors = isDark ? darkColors : lightColors;

  const value = useMemo<ThemeContextValue>(
    () => ({ colors, spacing, radius, typography, gradients, scheme, setScheme, isDark }),
    [colors, scheme, isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
