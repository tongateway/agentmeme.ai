import { useCallback, useEffect, useRef, useState } from 'react';

export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'agentmeme:v2:theme';

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    // localStorage may throw (e.g., disabled, quota exceeded on read)
  }
  return 'dark';
}

function safeWriteTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Silently ignore quota/permission errors — theme still works in-memory for this session
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

/** Synchronously apply the stored theme before React mounts (call in main.tsx). */
export function hydrateTheme() {
  applyTheme(readStoredTheme());
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  // Skip writing the initial value back to storage — only persist user-triggered changes.
  const isInitial = useRef(true);

  useEffect(() => {
    applyTheme(theme);
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    safeWriteTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, setTheme, toggle };
}
