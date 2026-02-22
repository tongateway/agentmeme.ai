import { useCallback, useEffect, useMemo, useState } from 'react';
import { TonConnectButton, useTonAddress, useTonWallet } from '@tonconnect/ui-react';
import { Address } from '@ton/core';
import { Sun, Moon } from 'lucide-react';
import { listContractsFromLeaderboard, listRaceContracts, registerRaceContract, updateRaceContract, type ContractListItem } from './lib/api';
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

const THEME_KEY = 'ai-trader-race:theme';

type Page = 'home' | 'leaderboard' | 'stats' | 'trader' | 'share';

const VALID_PAGES = new Set<Page>(['home', 'leaderboard', 'stats', 'trader']);

function tabFromHashParts(parts: string[]): TabKey {
  const second = parts[1]?.toLowerCase();
  if (second === 'deploy') return { kind: 'deploy' };
  if (second === 'contract' && parts[2]) {
    return { kind: 'contract', contractId: decodeURIComponent(parts[2]) };
  }
  return { kind: 'overview' };
}

function routeFromHash(): { page: Page; tab: TabKey } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  const first = parts[0]?.toLowerCase();
  if (!first) return { page: 'home', tab: { kind: 'overview' } };
  if (first === 'share') return { page: 'share', tab: { kind: 'overview' } };
  if (first === 'trader') return { page: 'trader', tab: tabFromHashParts(parts) };
  if (VALID_PAGES.has(first as Page)) return { page: first as Page, tab: { kind: 'overview' } };
  return { page: 'home', tab: { kind: 'overview' } };
}

function hashFromRoute(page: Page, tab: TabKey): string | null {
  if (page === 'share') return null; // don't touch hash for share pages
  if (page === 'home') return '';
  if (page === 'leaderboard') return 'leaderboard';
  if (page === 'stats') return 'stats';
  if (tab.kind === 'overview') return 'trader/overview';
  if (tab.kind === 'deploy') return 'trader/deploy';
  return `trader/contract/${encodeURIComponent(tab.contractId)}`;
}

const LS_KEY = 'ai-trader-race:v3';
const MY_CONTRACTS_KEY = 'ai-trader-race:my-contracts';
const PENDING_DEPLOY_KEY = 'ai-trader-race:pending-deploy';

/** Stores everything needed to retry a backend registration after the on-chain tx was sent. */
export type PendingDeploy = {
  address: string;
  publicKey: string;
  secretKey: string;
  prompt: string;
  ownerAddress: string; // non-bounceable
  aiModel: string;
  name?: string;
  createdAt: number; // Date.now()
};

export default function App() {
  const raceApiUrl = ((import.meta.env.VITE_RACE_API_URL as string | undefined) ?? 'https://ai-api.open4dev.xyz').trim().replace(/\/$/, '');
  const baseCfg = useMemo<PublicApiConfig>(() => ({ baseUrl: raceApiUrl }), [raceApiUrl]);

  // TonConnect proof → JWT auth for higher RPS
  const { jwtToken } = useAuth(baseCfg);
  const raceCfg = useMemo<PublicApiConfig>(
    () => ({ baseUrl: raceApiUrl, jwtToken }),
    [raceApiUrl, jwtToken],
  );

  const wallet = useTonWallet();
  const tonAddress = useTonAddress();
  const isConnected = !!wallet;

  const initialRoute = routeFromHash();
  const [page, setPageState] = useState<Page>(initialRoute.page);

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
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Sync hash with in-app navigation state
  useEffect(() => {
    const nextHashValue = hashFromRoute(page, tab);
    if (nextHashValue === null) return; // share page — don't touch hash
    const nextHash = nextHashValue ? `#${nextHashValue}` : '';
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  }, [page, tab]);

  // Theme switcher
  const [theme, setTheme] = useLocalStorageState<'light' | 'dark'>(THEME_KEY, 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, [setTheme]);

  const initialPersisted = useMemo((): Persisted => {
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

  const [persisted, setPersisted] = useLocalStorageState<Persisted>(LS_KEY, initialPersisted);
  const [myContractIds, setMyContractIds] = useLocalStorageState<string[]>(MY_CONTRACTS_KEY, []);
  const [pendingDeploy, setPendingDeploy] = useLocalStorageState<PendingDeploy | null>(PENDING_DEPLOY_KEY, null);
  const [allContracts, setAllContracts] = useState<ContractListItem[] | null>(null);
  const [contractsBusy, setContractsBusy] = useState(false);

  // Normalize a TON address to raw form for reliable comparison
  const normalizeAddr = useCallback((addr: string): string => {
    try {
      return Address.parse(addr).toRawString();
    } catch {
      return addr.toLowerCase();
    }
  }, []);

  // Filter to user's contracts: match by wallet owner_address OR localStorage IDs
  const contracts = useMemo(() => {
    if (!allContracts) return null;
    const idSet = new Set(myContractIds);
    const walletRaw = tonAddress ? normalizeAddr(tonAddress) : null;
    const matched = allContracts.filter((c) => {
      if (idSet.has(c.id)) return true;
      if (walletRaw && c.owner_address) {
        return normalizeAddr(c.owner_address) === walletRaw;
      }
      return false;
    });
    return matched;
  }, [allContracts, myContractIds, tonAddress, normalizeAddr]);
  const activeContract = useMemo(
    () => (tab.kind === 'contract' ? allContracts?.find((c) => c.id === tab.contractId) : null),
    [allContracts, tab],
  );

  const refreshContracts = useCallback(async () => {
    try {
      setContractsBusy(true);
      // Try /api/contracts first; fall back to leaderboard if empty
      let all = await listRaceContracts(raceCfg);
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

  // Auto-retry pending deployment registration on mount
  useEffect(() => {
    if (!pendingDeploy) return;
    // Expire pending deploys older than 1 hour
    if (Date.now() - pendingDeploy.createdAt > 3_600_000) {
      setPendingDeploy(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const created = await registerRaceContract(raceCfg, {
          address: pendingDeploy.address,
          public_key: pendingDeploy.publicKey,
          secret_key: pendingDeploy.secretKey,
          wallet_id: 0,
          prompt: pendingDeploy.prompt,
          owner_address: pendingDeploy.ownerAddress,
          ai_model: pendingDeploy.aiModel,
          ...(pendingDeploy.name?.trim() ? { name: pendingDeploy.name.trim() } : {}),
        });
        if (cancelled) return;
        // Success — clear pending and record the contract
        setPendingDeploy(null);
        setPersisted((p) => ({ ...p, contractAddress: pendingDeploy.address, raceContractId: created.id }));
        setMyContractIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
        await refreshContracts();
        setTab({ kind: 'contract', contractId: created.id });
      } catch {
        // Registration failed — keep pending so user can retry manually or it retries next visit
        if (!cancelled) {
          // If the contract already exists on the backend, clear the pending
          // (the user might have re-deployed or it was already registered)
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <header className="navbar mx-auto max-w-6xl px-6 pt-6 flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setPage('home')}>
            <h1 className="text-2xl font-semibold tracking-tight">AI Trader Race</h1>
            <span className="badge badge-neutral badge-sm uppercase tracking-wider">TON dApp</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            className={`btn btn-sm ${page === 'home' ? 'btn-active' : 'btn-ghost'}`}
            onClick={() => setPage('home')}
            type="button"
          >
            Home
          </button>
          <button
            className={`btn btn-sm ${page === 'leaderboard' ? 'btn-active' : 'btn-ghost'}`}
            onClick={() => setPage('leaderboard')}
            type="button"
          >
            Leaderboard
          </button>
          <button
            className={`btn btn-sm ${page === 'stats' ? 'btn-active' : 'btn-ghost'}`}
            onClick={() => setPage('stats')}
            type="button"
          >
            Stats
          </button>
          <button
            className={`btn btn-sm ${page === 'trader' ? 'btn-active' : 'btn-ghost'}`}
            onClick={openTraderFromNav}
            type="button"
          >
            {isConnected ? 'My Agents' : 'Deploy agent'}
          </button>
          <label className="swap swap-rotate btn btn-ghost btn-sm btn-circle" aria-label="Toggle theme">
            <input type="checkbox" checked={theme === 'dark'} onChange={toggleTheme} />
            <Sun className="swap-off h-4 w-4" />
            <Moon className="swap-on h-4 w-4" />
          </label>
          <TonConnectButton />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-10 pt-6">
        {page === 'home' ? (
          <HomePage onNavigate={setPage} />
        ) : page === 'leaderboard' ? (
          <LeaderboardPage raceCfg={raceCfg} onOpenContract={openContractFromLeaderboard} />
        ) : page === 'stats' ? (
          <StatsPage raceCfg={raceCfg} />
        ) : (
          <>
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
                setPendingDeploy={setPendingDeploy}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
