import { useCallback, useEffect, useMemo, useState } from 'react';
import { TonConnectButton, useTonAddress, useTonWallet } from '@tonconnect/ui-react';
import { Address } from '@ton/core';
import { Sun, Moon, ShieldAlert, RefreshCw } from 'lucide-react';
import { listContractsFromLeaderboard, listRaceContracts, updateRaceContract, primeKnownPrices, type ContractListItem } from './lib/api';
import type { PublicApiConfig } from './lib/api';
import { useLocalStorageState } from './lib/storage';
import { useAuth } from './lib/useAuth';
import { generateAgentKeypair } from './lib/crypto';
import { ContractTabBar, type TabKey } from './components/ContractTabBar';
import { ContractDetailPanel } from './components/ContractDetailPanel';
import { OverviewPanel } from './components/OverviewPanel';
import { DeployPanel, type Persisted } from './components/DeployPanel';
import { LeaderboardPage } from './components/LeaderboardPage';
import { HomePage } from './components/HomePage';
import { ShareCardPage, ShareCardLoader, decodeShareData } from './components/ShareCard';
import { StatsPage } from './components/StatsPage';
import { DocsPage } from './components/DocsPage';

const THEME_KEY = 'ai-trader-race:theme';

type Page = 'home' | 'leaderboard' | 'stats' | 'trader' | 'share' | 'docs';

const VALID_PAGES = new Set<Page>(['home', 'leaderboard', 'stats', 'trader', 'docs']);

function tabFromHashParts(parts: string[]): TabKey {
  const second = parts[1]?.toLowerCase();
  if (second === 'deploy') return { kind: 'deploy' };
  if (second === 'contract' && parts[2]) {
    return { kind: 'contract', contractId: decodeURIComponent(parts[2]) };
  }
  return { kind: 'overview' };
}

function routeFromHash(): { page: Page; tab: TabKey; statsPair: string | null } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  const first = parts[0]?.toLowerCase();
  if (!first) return { page: 'home', tab: { kind: 'overview' }, statsPair: null };
  if (first === 'share') return { page: 'share', tab: { kind: 'overview' }, statsPair: null };
  if (first === 'stats') {
    const pairSlug = parts[1]?.toUpperCase() || null;
    return { page: 'stats', tab: { kind: 'overview' }, statsPair: pairSlug };
  }
  if (first === 'trader') return { page: 'trader', tab: tabFromHashParts(parts), statsPair: null };
  if (VALID_PAGES.has(first as Page)) return { page: first as Page, tab: { kind: 'overview' }, statsPair: null };
  return { page: 'home', tab: { kind: 'overview' }, statsPair: null };
}

function hashFromRoute(page: Page, tab: TabKey, statsPair?: string | null): string | null {
  if (page === 'share') return null; // don't touch hash for share pages
  if (page === 'home') return '';
  if (page === 'leaderboard') return 'leaderboard';
  if (page === 'stats') return statsPair ? `stats/${statsPair}` : 'stats';
  if (page === 'docs') return 'docs';
  if (tab.kind === 'overview') return 'trader/overview';
  if (tab.kind === 'deploy') return 'trader/deploy';
  return `trader/contract/${encodeURIComponent(tab.contractId)}`;
}

const LS_KEY = 'ai-trader-race:v3';
const MY_CONTRACTS_KEY = 'ai-trader-race:my-contracts';

function normalizeTonAddress(addr: string): string {
  try {
    return Address.parse(addr).toRawString();
  } catch {
    return addr.toLowerCase();
  }
}


export default function App() {
  const raceApiUrl = ((import.meta.env.VITE_RACE_API_URL as string | undefined) ?? 'https://ai-api.open4dev.xyz').trim().replace(/\/$/, '');
  const baseCfg = useMemo<PublicApiConfig>(() => ({ baseUrl: raceApiUrl }), [raceApiUrl]);

  // TonConnect proof → JWT auth for higher RPS
  const { jwtToken, authError, reconnect } = useAuth(baseCfg);
  const raceCfg = useMemo<PublicApiConfig>(
    () => ({ baseUrl: raceApiUrl, jwtToken }),
    [raceApiUrl, jwtToken],
  );

  // Prime known USD prices cache early for DEX price calculations
  useEffect(() => { primeKnownPrices(raceCfg); }, [raceCfg]);

  const wallet = useTonWallet();
  const tonAddress = useTonAddress();
  const isConnected = !!wallet;
  const walletStorageScope = tonAddress ? normalizeTonAddress(tonAddress) : 'disconnected';
  const persistedStorageKey = `${LS_KEY}:${walletStorageScope}`;
  const myContractsStorageKey = `${MY_CONTRACTS_KEY}:${walletStorageScope}`;


  const initialRoute = routeFromHash();
  const [page, setPageState] = useState<Page>(initialRoute.page);
  const [statsPairSlug, setStatsPairSlug] = useState<string | null>(initialRoute.statsPair);

  const setPage = useCallback((p: Page) => {
    setPageState(p);
  }, []);

  const [tab, setTab] = useState<TabKey>(initialRoute.tab);

  // Sync page state when user presses browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const next = routeFromHash();
      setPageState(next.page);
      setTab(next.tab);
      if (next.page === 'stats') setStatsPairSlug(next.statsPair);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Sync hash with in-app navigation state
  useEffect(() => {
    const nextHashValue = hashFromRoute(page, tab, statsPairSlug);
    if (nextHashValue === null) return; // share page — don't touch hash
    const nextHash = nextHashValue ? `#${nextHashValue}` : '';
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  }, [page, tab, statsPairSlug]);

  // Theme switcher
  const [theme, setTheme] = useLocalStorageState<'light' | 'dark'>(THEME_KEY, 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, [setTheme]);

  const createInitialPersisted = useCallback((): Persisted => {
    const kp = generateAgentKeypair();
    return {
      prompt: '',
      deployAmountTon: '1',
      topupAmountTon: '5',
      walletId: 0,
      agentPublicKeyHex: kp.publicKeyHex,
      agentSecretKeyHex: kp.secretKeyHex,
      contractAddress: null,
      raceContractId: null,
    };
  }, []);

  const [persisted, setPersisted] = useLocalStorageState<Persisted>(persistedStorageKey, createInitialPersisted);
  const [myContractIds, setMyContractIds] = useLocalStorageState<string[]>(myContractsStorageKey, []);
  const [allContracts, setAllContracts] = useState<ContractListItem[] | null>(null);
  const [contractsBusy, setContractsBusy] = useState(false);
  const walletRawAddress = useMemo(
    () => (tonAddress ? normalizeTonAddress(tonAddress) : null),
    [tonAddress],
  );

  // Filter to user's contracts: match by wallet owner_address OR localStorage IDs
  const contracts = useMemo(() => {
    if (!allContracts) return null;
    const idSet = new Set(myContractIds);
    const matched = allContracts.filter((c) => {
      if (idSet.has(c.id)) return true;
      if (walletRawAddress && c.owner_address) {
        return normalizeTonAddress(c.owner_address) === walletRawAddress;
      }
      return false;
    });
    return matched;
  }, [allContracts, myContractIds, walletRawAddress]);
  const activeContract = useMemo(
    () => (tab.kind === 'contract' ? allContracts?.find((c) => c.id === tab.contractId) : null),
    [allContracts, tab],
  );

  const refreshContracts = useCallback(async () => {
    try {
      setContractsBusy(true);
      let all = await listRaceContracts(raceCfg, 'active,paused,deploying');
      if (all.length === 0) {
        all = await listContractsFromLeaderboard(raceCfg);
      }
      all.sort((a, b) => {
        const byCreated = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (byCreated !== 0) return byCreated;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
      setAllContracts(all);
    } catch {
      // silently fail — tab bar will just show "+"
    } finally {
      setContractsBusy(false);
    }
  }, [raceCfg]);

  // Auto-fetch contracts on mount
  useEffect(() => {
    void refreshContracts();
  }, [refreshContracts]);

  // When switching to deploy tab, reset keys if a contract was FULLY deployed (registered)
  const handleTabChange = useCallback(
    (newTab: TabKey) => {
      if (newTab.kind === 'deploy') {
        setPersisted((prev) => {
          // Only reset if contract was fully registered. If contractAddress is set but
          // raceContractId is null, the user has a pending deploy — keep the keys!
          if (prev.raceContractId) {
            const kp = generateAgentKeypair();
            return {
              ...prev,
              agentPublicKeyHex: kp.publicKeyHex,
              agentSecretKeyHex: kp.secretKeyHex,
              contractAddress: null,
              raceContractId: null,
              pendingDeploy: null,
              agentName: '',
            };
          }
          return prev;
        });
      }
      setTab(newTab);
    },
    [setPersisted],
  );

  const handleContractRegistered = useCallback(
    async (contractId: string) => {
      setMyContractIds((prev) => (prev.includes(contractId) ? prev : [...prev, contractId]));
      await refreshContracts();
      setTab({ kind: 'contract', contractId });
    },
    [refreshContracts, setMyContractIds],
  );

  const handleContractDeleted = useCallback(
    async (contractId: string) => {
      setMyContractIds((prev) => prev.filter((id) => id !== contractId));
      await refreshContracts();
      setTab({ kind: 'overview' });
    },
    [refreshContracts, setMyContractIds],
  );

  const handleContractStatusChanged = useCallback(
    (contractId: string, isActive: boolean) => {
      setAllContracts((prev) =>
        prev?.map((c) => (c.id === contractId ? { ...c, is_active: isActive } : c)) ?? null,
      );
    },
    [],
  );

  const handleRenameContract = useCallback(
    async (contractId: string, newName: string) => {
      await updateRaceContract(raceCfg, contractId, { name: newName });
      // Update local list so the tab label refreshes immediately
      setAllContracts((prev) =>
        prev
          ? prev.map((c) => (c.id === contractId ? { ...c, name: newName } : c))
          : prev,
      );
    },
    [raceCfg],
  );

  const openContractFromLeaderboard = useCallback((contractId: string) => {
    setPageState('trader');
    setTab({ kind: 'contract', contractId });
  }, []);

  const openTraderFromNav = useCallback(() => {
    setPageState('trader');
    if (!isConnected) {
      setTab({ kind: 'deploy' });
    }
  }, [isConnected]);

  const openDeploy = useCallback(() => {
    setPageState('trader');
    setTab({ kind: 'deploy' });
  }, []);

  // Share page — standalone, no header/nav
  if (page === 'share') {
    const hash = window.location.hash;
    // New short format: #share/r/{responseId}
    const shortMatch = hash.match(/^#share\/r\/([a-f0-9-]+)$/i);
    if (shortMatch) {
      return <ShareCardLoader responseId={shortMatch[1]} raceCfg={raceCfg} />;
    }
    // Legacy long format: #share/{base64}
    const shareMatch = hash.match(/^#share\/(.+)$/);
    const shareData = shareMatch ? decodeShareData(shareMatch[1]) : null;
    if (shareData) return <ShareCardPage data={shareData} raceCfg={raceCfg} />;
  }

  return (
    <div className="min-h-dvh">
      <div className="w-full bg-warning/10 border-b border-warning/20 py-1.5 px-4 text-center text-xs sm:text-sm text-warning-content">
        <span className="font-semibold">Beta Notice:</span>{' '}
        We are currently in Beta. Please use with caution and remember — trade at your own risk, even with AI.
      </div>

      <header className="navbar mx-auto max-w-6xl px-4 sm:px-6 pt-6 flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setPage('home')}>
            <h1 className="text-2xl font-semibold tracking-tight">AI Trader Race</h1>
            <span className="badge badge-neutral badge-sm uppercase tracking-wider">TON dApp</span>
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none max-w-full">
          <button
            className={`btn btn-sm shrink-0 ${page === 'home' ? 'btn-active' : 'btn-ghost'}`}
            onClick={() => setPage('home')}
            type="button"
          >
            Home
          </button>
          <button
            className={`btn btn-sm shrink-0 ${page === 'leaderboard' ? 'btn-active' : 'btn-ghost'}`}
            onClick={() => setPage('leaderboard')}
            type="button"
          >
            Leaderboard
          </button>
          <button
            className={`btn btn-sm shrink-0 ${page === 'stats' ? 'btn-active' : 'btn-ghost'}`}
            onClick={() => setPage('stats')}
            type="button"
          >
            Order Book
          </button>
          <button
            className={`btn btn-sm shrink-0 ${page === 'trader' ? 'btn-active' : 'btn-ghost'}`}
            onClick={openTraderFromNav}
            type="button"
          >
            {isConnected ? 'My Agents' : 'Deploy agent'}
          </button>
          <label className="swap swap-rotate btn btn-ghost btn-sm btn-circle shrink-0" aria-label="Toggle theme">
            <input type="checkbox" checked={theme === 'dark'} onChange={toggleTheme} />
            <Sun className="swap-off h-4 w-4" />
            <Moon className="swap-on h-4 w-4" />
          </label>
          <div className="shrink-0">
            <TonConnectButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6 pb-10 pt-6">
        {page === 'home' ? (
          <HomePage onNavigate={setPage} onDeploy={openDeploy} onOpenContract={openContractFromLeaderboard} raceCfg={raceCfg} />
        ) : page === 'leaderboard' ? (
          <LeaderboardPage raceCfg={raceCfg} onOpenContract={openContractFromLeaderboard} />
        ) : page === 'docs' ? (
          <DocsPage />
        ) : page === 'stats' ? (
          <StatsPage raceCfg={raceCfg} pairSlug={statsPairSlug} onPairChange={setStatsPairSlug} />
        ) : (
          <>
            {/* Auth warning — wallet connected but no JWT */}
            {isConnected && !jwtToken && authError && (
              <div role="alert" className="alert alert-error text-sm mb-4">
                <ShieldAlert className="h-5 w-5 shrink-0" />
                <div className="flex-1">
                  <span className="font-semibold">Not authenticated:</span>{' '}
                  {authError}
                  <span className="opacity-70"> — owner actions (delete, edit prompt, pause) won&apos;t work.</span>
                </div>
                <button
                  className="btn btn-sm btn-ghost gap-1"
                  onClick={() => void reconnect()}
                  type="button"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reconnect
                </button>
              </div>
            )}

            <ContractTabBar
              contracts={contracts}
              activeTab={tab}
              onTabChange={handleTabChange}
              loading={contractsBusy}
              onRename={handleRenameContract}
            />

            {tab.kind === 'overview' ? (
              <OverviewPanel contracts={contracts ?? []} raceCfg={raceCfg} theme={theme} />
            ) : tab.kind === 'contract' && activeContract ? (
              <ContractDetailPanel
                key={tab.contractId}
                contract={activeContract}
                raceCfg={raceCfg}
                theme={theme}
                onDeleted={(id) => void handleContractDeleted(id)}
                onStatusChanged={handleContractStatusChanged}
              />
            ) : tab.kind === 'contract' && allContracts == null ? (
              <div className="mt-4 flex justify-center py-8">
                <span className="loading loading-spinner loading-md" />
              </div>
            ) : tab.kind === 'contract' ? (
              <OverviewPanel contracts={contracts ?? []} raceCfg={raceCfg} theme={theme} />
            ) : (
              <DeployPanel
                persisted={persisted}
                setPersisted={setPersisted}
                raceCfg={raceCfg}
                onContractRegistered={(id) => void handleContractRegistered(id)}
              />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-base-content/5 py-6 mt-auto">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs opacity-40">
          <span>AI Trader Race on TON</span>
          <div className="flex items-center gap-4">
            <button type="button" className="hover:opacity-100 underline-offset-4 hover:underline" onClick={() => setPage('docs')}>
              Docs
            </button>
            <a href="https://github.com/nickspaargaren/orderbook-protocol" target="_blank" rel="noreferrer" className="hover:opacity-100 underline-offset-4 hover:underline">
              Orderbook Protocol
            </a>
            <a href="https://github.com/tongateway/agentmeme.ai" target="_blank" rel="noreferrer" className="hover:opacity-100 underline-offset-4 hover:underline">
              App
            </a>
            <a href="https://github.com/tongateway/agentmeme-go" target="_blank" rel="noreferrer" className="hover:opacity-100 underline-offset-4 hover:underline">
              Backend
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
