import { useCallback, useEffect, useMemo, useState } from 'react';
import { TonConnectButton } from '@tonconnect/ui-react';
import { Sun, Moon } from 'lucide-react';
import { type PublicApiConfig, primeKnownPrices } from '../lib/api';
import { useAuth } from '../lib/useAuth';
import { useLocalStorageState } from '../lib/storage';
import { HomePage } from './HomePage';
import { cn } from './lib/utils';
import { Button } from './components/ui/button';

const THEME_KEY = 'ai-trader-race:theme';

type Page = 'home' | 'leaderboard' | 'deploy';

export default function V4App() {
  const raceApiUrl = (
    (import.meta.env.VITE_RACE_API_URL as string | undefined) ??
    'https://ai-api.open4dev.xyz'
  )
    .trim()
    .replace(/\/$/, '');

  const baseCfg = useMemo<PublicApiConfig>(() => ({ baseUrl: raceApiUrl }), [raceApiUrl]);
  const { jwtToken } = useAuth(baseCfg);
  const raceCfg = useMemo<PublicApiConfig>(
    () => ({ baseUrl: raceApiUrl, jwtToken }),
    [raceApiUrl, jwtToken],
  );

  useEffect(() => {
    primeKnownPrices(raceCfg);
  }, [raceCfg]);

  const [theme, setTheme] = useLocalStorageState<'light' | 'dark'>(THEME_KEY, 'light');
  const [page, setPage] = useState<Page>('home');

  // Sync html class for Tailwind dark mode
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    // Also keep existing DaisyUI data-theme in sync
    root.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, [setTheme]);

  const handleSelectToken = useCallback((symbol: string) => {
    // Navigate to v1 agent hub for token detail
    window.location.href = `/#agent-hub/${encodeURIComponent(symbol)}`;
  }, []);

  const handleDeploy = useCallback(() => {
    window.location.href = '/#trader/deploy';
  }, []);

  const handleViewLeaderboard = useCallback(() => {
    window.location.href = '/#leaderboard';
  }, []);

  return (
    <div className={cn('min-h-screen bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50')}>
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          {/* Logo */}
          <button
            type="button"
            className="flex items-center gap-2 font-bold text-lg tracking-tight focus-visible:outline-none"
            onClick={() => setPage('home')}
          >
            <span className="text-emerald-600 dark:text-emerald-400">agentmeme</span>
            <span className="text-neutral-400 dark:text-neutral-500 font-light">.ai</span>
            <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
              v4
            </span>
          </button>

          {/* Nav links */}
          <nav className="hidden items-center gap-1 sm:flex">
            <Button
              variant="ghost"
              size="sm"
              className={cn(page === 'home' && 'bg-neutral-100 dark:bg-neutral-800')}
              onClick={() => setPage('home')}
            >
              Home
            </Button>
            <Button variant="ghost" size="sm" onClick={handleViewLeaderboard}>
              Leaderboard
            </Button>
            <Button variant="ghost" size="sm" onClick={handleDeploy}>
              Deploy
            </Button>
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Toggle theme"
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <TonConnectButton />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main>
        <HomePage
          raceCfg={raceCfg}
          onSelectToken={handleSelectToken}
          onDeploy={handleDeploy}
          onViewLeaderboard={handleViewLeaderboard}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 dark:border-neutral-800 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-neutral-400 dark:text-neutral-500">
          <span>Build on TON</span>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/tongateway/orderbook-protocol"
              target="_blank"
              rel="noreferrer"
              className="hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
            >
              Protocol
            </a>
            <a
              href="https://github.com/tongateway/agentmeme.ai"
              target="_blank"
              rel="noreferrer"
              className="hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
            >
              GitHub
            </a>
            <a
              href="/#docs"
              className="hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
            >
              Docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
