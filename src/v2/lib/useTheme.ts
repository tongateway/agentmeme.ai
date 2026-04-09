import { useCallback, useEffect, useRef, useState } from 'react';

export type Theme = 'light' | 'dark';
const COOKIE_KEY = 'agentmeme_v2_theme';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// Use cookies for theme persistence — localStorage quotas can be exceeded by
// other app data (chart caches, form drafts) which would silently break writes.
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)};max-age=${COOKIE_MAX_AGE};path=/;SameSite=Lax`;
}

function readStoredTheme(): Theme {
  const raw = readCookie(COOKIE_KEY);
  if (raw === 'light' || raw === 'dark') return raw;
  return 'dark';
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
    writeCookie(COOKIE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, setTheme, toggle };
}
