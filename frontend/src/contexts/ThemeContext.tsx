import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type ThemeMode = 'light' | 'dark';
type ThemePreference = ThemeMode | 'system';

type ThemeContextValue = {
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (next: ThemePreference) => void;
  toggleMode: () => void;
};

const THEME_STORAGE_KEY = 'openplaylist-theme-preference';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored;
  }

  return 'system';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => getStoredPreference());
  const [systemMode, setSystemMode] = useState<ThemeMode>(() => getSystemMode());

  const mode: ThemeMode = preference === 'system' ? systemMode : preference;

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      setSystemMode(event.matches ? 'dark' : 'light');
    };

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }

    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    if (mode === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [mode]);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  };

  const toggleMode = () => {
    const next: ThemeMode = mode === 'dark' ? 'light' : 'dark';
    setPreference(next);
  };

  const contextValue = useMemo(
    () => ({
      mode,
      preference,
      setPreference,
      toggleMode,
    }),
    [mode, preference]
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
