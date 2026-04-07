import { useCallback, useEffect, useMemo, useState } from 'react';
import { TonConnectButton, useTonAddress, useTonWallet } from '@tonconnect/ui-react';
import { Address } from '@ton/core';
import { Sun, Moon, Bot } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  listContractsFromLeaderboard,
  listRaceContracts,
  primeKnownPrices,
  getRaceContractDetail,
  updateRaceContract,
  type ContractListItem,
  type PublicApiConfig,
} from '../lib/api';
import { useLocalStorageState } from '../lib/storage';
import { useAuth } from '../lib/useAuth';
import { generateAgentKeypair } from '../lib/crypto';
import { HomePage } from './components/HomePage';
import { AgentHubPage } from './components/AgentHubPage';
import { cn } from './utils/cn';
import { TokenOpinionPage } from '../v5/components/TokenOpinionPage';
import { StatsPage } from '../v5/components/StatsPage';
import { LeaderboardPage } from '../v5/components/LeaderboardPage';
import { DocsPage } from '../v5/components/DocsPage';
import { ContractTabBar, type TabKey } from '../v5/components/ContractTabBar';
import { ContractDetailPanel } from '../v5/components/ContractDetailPanel';
import { DeployPanel, type Persisted } from '../v5/components/DeployPanel';

const THEME_KEY = 'ai-trader-race:theme';
const LS_KEY = 'ai-trader-race:v5';
const MY_CONTRACTS_KEY = 'ai-trader-race:v5:my-contracts';

function normalizeTonAddress(addr: string): string {
  try {
    return Address.parse(addr).toRawString();
  } catch {
    return addr.toLowerCase();
  }
}

type Page = 'home' | 'leaderboard' | 'stats' | 'trader' | 'docs' | 'agent-hub';

function pageFromHash(): { page: Page; sub?: string } {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (!hash) return { page: 'home' };
  const [first, ...rest] = hash.split('/');
  const p = first as Page;
  const validPages: Page[] = ['home', 'leaderboard', 'stats', 'trader', 'docs', 'agent-hub'];
  if (validPages.includes(p)) return { page: p, sub: rest.join('/') || undefined };
  return { page: 'home' };
}

export default function V3App() {
  const raceApiUrl = (
    (import.meta.env.VITE_RACE_API_URL as string | undefined) ??
    'https://ai-api.open4dev.xyz'
  ).trim().replace(/\/$/, '');

  const baseCfg = useMemo<PublicApiConfig>(() => ({ baseUrl: raceApiUrl }), [raceApiUrl]);
  const { jwtToken } = useAuth(baseCfg);
  const raceCfg = useMemo<PublicApiConfig>(() => ({ baseUrl: raceApiUrl, jwtToken }), [raceApiUrl, jwtToken]);

  useTonWallet(); // keep provider active
  const tonAddress = useTonAddress();
  const walletStorageScope = tonAddress ? normalizeTonAddress(tonAddress) : 'disconnected';
  const persistedStorageKey = `${LS_KEY}:${walletStorageScope}`;
  const myContractsStorageKey = `${MY_CONTRACTS_KEY}:${walletStorageScope}`;

  const [theme, setTheme] = useLocalStorageState<'light' | 'dark'>(THEME_KEY, 'dark');
  const [page, setPageState] = useState<Page>(pageFromHash().page);
  const [tokenDetail, setTokenDetail] = useState<string | null>(null);

  // Contract management state
  const [tab, setTab] = useState<TabKey>({ kind: 'deploy' });

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

  // Filter to user's contracts
  const contracts = useMemo(() => {
    if (!allContracts) return null;
    const idSet = new Set(myContractIds);
    return allContracts.filter((c) => {
      if (idSet.has(c.id)) return true;
      if (walletRawAddress && c.owner_address) {
        return normalizeTonAddress(c.owner_address) === walletRawAddress;
      }
      return false;
    });
  }, [allContracts, myContractIds, walletRawAddress]);

  const activeContract = useMemo(
    () => (tab.kind === 'contract' ? allContracts?.find((c) => c.id === tab.contractId) : null),
    [allContracts, tab],
  );

  // If contract not in local list, fetch it
  useEffect(() => {
    if (tab.kind !== 'contract') return;
    if (activeContract) return;
    if (allContracts == null) return;
    let cancelled = false;
    (async () => {
      try {
        const detail = await getRaceContractDetail(raceCfg, tab.contractId);
        if (cancelled) return;
        const item: ContractListItem = {
          id: detail.id,
          address: detail.address,
          name: detail.name,
          owner_address: detail.owner_address,
          is_active: detail.is_active,
          status: detail.status,
          ai_model: detail.ai_model,
          ai_provider: detail.ai_provider,
          created_at: detail.created_at,
          updated_at: detail.updated_at,
        };
        setAllContracts((prev) => (prev ? [...prev, item] : [item]));
      } catch { /* not found */ }
    })();
    return () => { cancelled = true; };
  }, [tab, activeContract, allContracts, raceCfg]);

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
  const refreshContracts = useCallback(async () => {
    try {
      setContractsBusy(true);
      let all = await listRaceContracts(raceCfg, 'active,paused,deploying');
      if (all.length === 0) all = await listContractsFromLeaderboard(raceCfg);
      all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAllContracts(all);
    } catch { /* ignore */ }
    finally { setContractsBusy(false); }
  }, [raceCfg]);

  useEffect(() => {
    void refreshContracts();
  }, [refreshContracts]);

  // Tab change: reset persisted when switching to deploy
  const handleTabChange = useCallback(
    (newTab: TabKey) => {
      if (newTab.kind === 'deploy') {
        setPersisted((prev) => {
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
      setTab({ kind: 'deploy' });
    },
    [refreshContracts, setMyContractIds],
  );

  const handleContractStatusChanged = useCallback(
    (contractId: string, newIsActive: boolean) => {
      setAllContracts((prev) =>
        prev?.map((c) => (c.id === contractId ? { ...c, is_active: newIsActive, status: newIsActive ? 'active' : 'paused' } : c)) ?? null,
      );
    },
    [],
  );

  const handleRenameContract = useCallback(
    async (contractId: string, newName: string) => {
      await updateRaceContract(raceCfg, contractId, { name: newName });
      setAllContracts((prev) =>
        prev ? prev.map((c) => (c.id === contractId ? { ...c, name: newName } : c)) : prev,
      );
    },
    [raceCfg],
  );

  const navLinks: [Page, string][] = [
    ['home', 'Home'],
    ['agent-hub', 'Agent Hub'],
    ['stats', 'Order Book'],
    ['trader', 'My Agents'],
    ['leaderboard', 'Leaderboard'],
    ['docs', 'Docs'],
  ];

  return (
    <div id="v3-root" className="min-h-screen bg-black text-white">
      {/* Navbar */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="sticky top-0 z-50 border-b border-white/5 bg-black/90 backdrop-blur"
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <button
            type="button"
            className="flex items-center gap-2 font-bold text-lg tracking-tight"
            onClick={() => setPage('home')}
          >
            <span className="text-white">AgntM</span>
          </button>

          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map(([p, label]) => (
              <button
                key={p}
                type="button"
                onClick={() => setPage(p)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                  page === p
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/5',
                )}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <TonConnectButton />
          </div>
        </div>
      </motion.header>

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
        {page === 'stats' && <StatsPage raceCfg={raceCfg} />}
        {page === 'trader' && (
          <div className="flex flex-col gap-4">
            <ContractTabBar
              contracts={contracts}
              activeTab={tab}
              onTabChange={handleTabChange}
              loading={contractsBusy}
              onRename={handleRenameContract}
            />
            {tab.kind === 'deploy' && (
              <DeployPanel
                persisted={persisted}
                setPersisted={setPersisted}
                raceCfg={raceCfg}
                onContractRegistered={(id) => void handleContractRegistered(id)}
              />
            )}
            {tab.kind === 'contract' && activeContract && (
              <ContractDetailPanel
                contract={activeContract}
                raceCfg={raceCfg}
                onDeleted={(id) => void handleContractDeleted(id)}
                onStatusChanged={handleContractStatusChanged}
              />
            )}
          </div>
        )}
        {page === 'leaderboard' && (
          <LeaderboardPage
            raceCfg={raceCfg}
            onSelectAgent={(contractId) => {
              setPageState('trader');
              setTab({ kind: 'contract', contractId });
              window.location.hash = 'trader';
            }}
          />
        )}
        {page === 'docs' && <DocsPage />}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 mt-auto">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col items-center gap-3 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-neutral-500" />
            <span>AgntM — built on TON</span>
          </div>
          <div className="flex gap-4 text-xs">
            <button
              type="button"
              onClick={() => setPage('docs')}
              className="hover:text-gray-300 transition-colors"
            >
              Docs
            </button>
            <a
              href="https://github.com/tongateway/orderbook-protocol"
              target="_blank"
              rel="noreferrer"
              className="hover:text-gray-300 transition-colors"
            >
              Protocol
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
