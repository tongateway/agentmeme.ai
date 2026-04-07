import { useCallback, useEffect, useMemo, useState } from 'react';
import { TonConnectButton, useTonWallet } from '@tonconnect/ui-react';
import { Sun, Moon, Bot } from 'lucide-react';
import { listContractsFromLeaderboard, listRaceContracts, primeKnownPrices, type ContractListItem } from '../lib/api';
import type { PublicApiConfig } from '../lib/api';
import { useLocalStorageState } from '../lib/storage';
import { useAuth } from '../lib/useAuth';
// generateAgentKeypair imported when DeployPanel is ready
import { Button } from './components/ui/button';
import { HomePage } from './components/HomePage';
import { AgentHubPage } from './components/AgentHubPage';
import { cn } from './lib/utils';
import { TokenOpinionPage } from './components/TokenOpinionPage';

// Lazy stubs — will be replaced by real components
function StubPage({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <h2 className="text-2xl font-bold">{name}</h2>
        <p className="mt-2 text-neutral-500">Coming soon...</p>
      </div>
    </div>
  );
}

const THEME_KEY = 'ai-trader-race:theme';

type Page = 'home' | 'leaderboard' | 'stats' | 'trader' | 'docs' | 'agent-hub';

// TabKey will be used when ContractTabBar is added
// type TabKey = { kind: 'contract'; contractId: string } | { kind: 'deploy' };

function pageFromHash(): { page: Page; sub?: string } {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash) return { page: 'home' };
  const [first, ...rest] = hash.split('/');
  const p = first as Page;
  const validPages: Page[] = ['home', 'leaderboard', 'stats', 'trader', 'docs', 'agent-hub'];
  if (validPages.includes(p)) return { page: p, sub: rest.join('/') || undefined };
  return { page: 'home' };
}

export default function V5App() {
  const raceApiUrl = (
    (import.meta.env.VITE_RACE_API_URL as string | undefined) ??
    'https://ai-api.open4dev.xyz'
  ).trim().replace(/\/$/, '');

  const baseCfg = useMemo<PublicApiConfig>(() => ({ baseUrl: raceApiUrl }), [raceApiUrl]);
  const { jwtToken } = useAuth(baseCfg);
  const raceCfg = useMemo<PublicApiConfig>(() => ({ baseUrl: raceApiUrl, jwtToken }), [raceApiUrl, jwtToken]);

  useTonWallet(); // keep provider active

  const [theme, setTheme] = useLocalStorageState<'light' | 'dark'>(THEME_KEY, 'dark');
  const [page, setPageState] = useState<Page>(pageFromHash().page);
  const [tokenDetail, setTokenDetail] = useState<string | null>(null);

  // Contracts — used by My Agents page (will be wired up)
  const [, setAllContracts] = useState<ContractListItem[] | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  useEffect(() => {
    void primeKnownPrices(raceCfg);
  }, []);

  const setPage = useCallback((p: Page) => {
    setPageState(p);
    setTokenDetail(null);
    if (p === 'home') window.location.hash = '';
    else window.location.hash = p;
  }, []);

  const openToken = useCallback((symbol: string) => {
    setTokenDetail(symbol);
    setPageState('agent-hub');
    window.location.hash = `agent-hub/token/${symbol}`;
  }, []);

  useEffect(() => {
    const onHash = () => {
      const { page: p } = pageFromHash();
      setPageState(p);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Fetch contracts
  useEffect(() => {
    (async () => {
      try {
        let all = await listRaceContracts(raceCfg, 'active,paused,deploying');
        if (all.length === 0) all = await listContractsFromLeaderboard(raceCfg);
        all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setAllContracts(all);
      } catch { /* ignore */ }
    })();
  }, [raceCfg]);

  return (
    <div id="v5-root" className={cn('min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50')}>
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            className="flex items-center gap-2 font-bold text-lg tracking-tight"
            onClick={() => setPage('home')}
          >
            <span className="text-violet-600 dark:text-violet-400">AgntM</span>
          </button>

          <nav className="hidden items-center gap-1 md:flex">
            {([
              ['home', 'Home'],
              ['agent-hub', 'Agent Hub'],
              ['stats', 'Order Book'],
              ['trader', 'My Agents'],
              ['leaderboard', 'Leaderboard'],
              ['docs', 'Docs'],
            ] as [Page, string][]).map(([p, label]) => (
              <Button
                key={p}
                variant={page === p ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setPage(p)}
              >
                {label}
              </Button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <TonConnectButton />
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        {page === 'home' && (
          <HomePage
            raceCfg={raceCfg}
            onSelectToken={openToken}
            onDeploy={() => setPage('trader')}
            onViewLeaderboard={() => setPage('leaderboard')}
          />
        )}
        {page === 'agent-hub' && (
          tokenDetail
            ? (
              <TokenOpinionPage
                raceCfg={raceCfg}
                symbol={tokenDetail}
                onBack={() => { setTokenDetail(null); window.location.hash = 'agent-hub'; }}
              />
            )
            : (
              <AgentHubPage
                raceCfg={raceCfg}
                onSelectToken={openToken}
                onDeploy={() => setPage('trader')}
                onViewLeaderboard={() => setPage('leaderboard')}
              />
            )
        )}
        {page === 'stats' && <StubPage name="Order Book" />}
        {page === 'trader' && <StubPage name="My Agents" />}
        {page === 'leaderboard' && <StubPage name="Leaderboard" />}
        {page === 'docs' && <StubPage name="Docs" />}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 dark:border-neutral-800 py-8 mt-auto">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col items-center gap-3 text-sm text-neutral-500">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-violet-500" />
            <span>AgntM — built on TON</span>
          </div>
          <div className="flex gap-4 text-xs">
            <button type="button" onClick={() => setPage('docs')} className="hover:text-neutral-700 dark:hover:text-neutral-300">Docs</button>
            <a href="https://github.com/tongateway/orderbook-protocol" target="_blank" rel="noreferrer" className="hover:text-neutral-700 dark:hover:text-neutral-300">Protocol</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
