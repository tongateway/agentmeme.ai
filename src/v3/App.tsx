import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, BarChart3, ExternalLink, ShieldAlert, RefreshCw } from 'lucide-react';
import { useTonAddress, useTonWallet, TonConnectButton } from '@tonconnect/ui-react';
import { Address } from '@ton/core';
import { HomePage } from './HomePage';
import { AgentHubPage } from './components/AgentHubPage';
import { TokenOpinionPage } from './components/TokenOpinionPage';
import { StatsPage } from './components/StatsPage';
import { LeaderboardPage } from './components/LeaderboardPage';
import { DocsPage } from './components/DocsPage';
import { ContractTabBar, type TabKey } from './components/ContractTabBar';
import { ContractDetailPanel } from './components/ContractDetailPanel';
import { DeployPanel, type Persisted } from './components/DeployPanel';
import {
  listRaceContracts,
  listContractsFromLeaderboard,
  getRaceContractDetail,
  updateRaceContract,
  primeKnownPrices,
  type ContractListItem,
  type PublicApiConfig,
} from '../lib/api';
import { useLocalStorageState } from '../lib/storage';
import { useAuth } from '../lib/useAuth';
import { generateAgentKeypair } from '../lib/crypto';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const LS_KEY = 'ai-trader-race:v3';
const MY_CONTRACTS_KEY = 'ai-trader-race:my-contracts';

function normalizeTonAddress(addr: string): string {
  try {
    return Address.parse(addr).toRawString();
  } catch {
    return addr.toLowerCase();
  }
}

type Page = 'home' | 'agent-hub' | 'token' | 'stats' | 'leaderboard' | 'docs' | 'trader';

function getInitialPage(): { page: Page; token: string | null; tab: TabKey } {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash === 'agent-hub') return { page: 'agent-hub', token: null, tab: { kind: 'deploy' } };
  if (hash === 'stats') return { page: 'stats', token: null, tab: { kind: 'deploy' } };
  if (hash === 'leaderboard') return { page: 'leaderboard', token: null, tab: { kind: 'deploy' } };
  if (hash === 'docs') return { page: 'docs', token: null, tab: { kind: 'deploy' } };
  const tokenMatch = hash.match(/^token\/(.+)$/);
  if (tokenMatch) return { page: 'token', token: decodeURIComponent(tokenMatch[1]), tab: { kind: 'deploy' } };
  // Trader routes
  if (hash === 'trader' || hash === 'trader/deploy') return { page: 'trader', token: null, tab: { kind: 'deploy' } };
  const contractMatch = hash.match(/^trader\/contract\/(.+)$/);
  if (contractMatch) return { page: 'trader', token: null, tab: { kind: 'contract', contractId: decodeURIComponent(contractMatch[1]) } };
  return { page: 'home', token: null, tab: { kind: 'deploy' } };
}

type NavLinkProps = { href: string; children: ReactNode; active?: boolean; onClick?: (e: React.MouseEvent) => void };

function NavLink({ href, children, active, onClick }: NavLinkProps) {
  return (
    <a
      href={href}
      onClick={onClick}
      className={`text-sm transition-colors ${active ? 'text-white' : 'text-gray-400 hover:text-white'}`}
    >
      {children}
    </a>
  );
}

export default function V3App() {
  const baseCfg = useMemo<PublicApiConfig>(() => ({ baseUrl: BASE_URL }), []);

  // Auth
  const { jwtToken, authError, reconnect } = useAuth(baseCfg);
  const raceCfg = useMemo<PublicApiConfig>(
    () => ({ baseUrl: BASE_URL, jwtToken }),
    [jwtToken],
  );

  useEffect(() => { primeKnownPrices(raceCfg); }, [raceCfg]);

  const wallet = useTonWallet();
  const tonAddress = useTonAddress();
  const isConnected = !!wallet;
  const walletStorageScope = tonAddress ? normalizeTonAddress(tonAddress) : 'disconnected';
  const persistedStorageKey = `${LS_KEY}:${walletStorageScope}`;
  const myContractsStorageKey = `${MY_CONTRACTS_KEY}:${walletStorageScope}`;

  const initial = getInitialPage();
  const [page, setPage] = useState<Page>(initial.page);
  const [selectedToken, setSelectedToken] = useState<string | null>(initial.token);
  const [tab, setTab] = useState<TabKey>(initial.tab);

  // Contract list state
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

  // If contract not in local list, fetch it directly
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
      } catch { /* contract not found */ }
    })();
    return () => { cancelled = true; };
  }, [tab, activeContract, allContracts, raceCfg]);

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
      // silently fail
    } finally {
      setContractsBusy(false);
    }
  }, [raceCfg]);

  useEffect(() => { void refreshContracts(); }, [refreshContracts]);

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
    (contractId: string, isActive: boolean) => {
      setAllContracts((prev) =>
        prev?.map((c) => (c.id === contractId ? { ...c, is_active: isActive, status: isActive ? 'active' : 'paused' } : c)) ?? null,
      );
    },
    [],
  );

  const handleRenameContract = useCallback(
    async (contractId: string, newName: string) => {
      await updateRaceContract(raceCfg, contractId, { name: newName });
      setAllContracts((prev) =>
        prev?.map((c) => (c.id === contractId ? { ...c, name: newName } : c)) ?? null,
      );
    },
    [raceCfg],
  );

  // Sync hash <-> state
  useEffect(() => {
    const onHashChange = () => {
      const r = getInitialPage();
      setPage(r.page);
      setSelectedToken(r.token);
      if (r.page === 'trader') setTab(r.tab);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Update hash on navigation
  useEffect(() => {
    let nextHash = '';
    if (page === 'home') nextHash = '';
    else if (page === 'agent-hub') nextHash = 'agent-hub';
    else if (page === 'stats') nextHash = 'stats';
    else if (page === 'leaderboard') nextHash = 'leaderboard';
    else if (page === 'docs') nextHash = 'docs';
    else if (page === 'token' && selectedToken) nextHash = `token/${encodeURIComponent(selectedToken)}`;
    else if (page === 'trader') {
      if (tab.kind === 'deploy') nextHash = 'trader/deploy';
      else nextHash = `trader/contract/${encodeURIComponent(tab.contractId)}`;
    }
    const target = nextHash ? `#${nextHash}` : '#';
    if (window.location.hash !== target && !(target === '#' && window.location.hash === '')) {
      window.location.hash = target;
    }
  }, [page, selectedToken, tab]);

  const navigate = (newPage: Page, token?: string) => {
    setPage(newPage);
    setSelectedToken(token ?? null);
  };

  const handleDeploy = () => {
    setPage('trader');
    setTab({ kind: 'deploy' });
  };

  const handleViewLeaderboard = () => {
    navigate('leaderboard');
  };

  const handleSelectToken = (symbol: string) => {
    navigate('token', symbol);
  };

  const handleBackToHub = () => {
    navigate('agent-hub');
  };

  const openTrader = useCallback(() => {
    setPage('trader');
    if (contracts && contracts.length > 0 && tab.kind === 'deploy') {
      setTab({ kind: 'contract', contractId: contracts[0].id });
    }
  }, [contracts, tab.kind]);

  const openContractFromLeaderboard = useCallback((contractId: string) => {
    setPage('trader');
    setTab({ kind: 'contract', contractId });
  }, []);

  return (
    <div id="v3-root" className="min-h-screen bg-black text-white">
      {/* Navbar */}
      <motion.nav
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed top-0 z-50 w-full border-b border-white/5 bg-black/80 backdrop-blur-md"
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          {/* Logo */}
          <button
            type="button"
            onClick={() => navigate('home')}
            className="flex items-center gap-2 font-mono text-sm font-bold text-white"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#00C389]/20 text-[#00C389]">
              <Bot size={14} />
            </div>
            <span className="text-[#00C389]">AI</span>
            <span className="text-gray-300">Trader</span>
            <span className="ml-0.5 rounded bg-[#00C389]/15 px-1 py-0.5 text-[10px] font-semibold text-[#00C389]">
              RACE
            </span>
          </button>

          {/* Nav links */}
          <div className="hidden items-center gap-6 md:flex">
            <NavLink href="#agent-hub" active={page === 'agent-hub'} onClick={(e) => { e?.preventDefault?.(); navigate('agent-hub'); }}>
              Agent Hub
            </NavLink>
            <button
              type="button"
              onClick={openTrader}
              className={`text-sm transition-colors ${page === 'trader' ? 'text-white' : 'text-gray-400 hover:text-white'}`}
            >
              My Agents
            </button>
            <NavLink href="#leaderboard" active={page === 'leaderboard'}>Leaderboard</NavLink>
            <NavLink href="#stats" active={page === 'stats'}>Stats</NavLink>
            <NavLink href="#docs" active={page === 'docs'}>Docs</NavLink>
          </div>

          {/* CTA */}
          <div className="flex items-center gap-3">
            {page === 'trader' && (
              <TonConnectButton />
            )}
            <a
              href="/v2"
              className="hidden items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-300 md:flex"
            >
              <ExternalLink size={12} />
              Classic UI
            </a>
            <button
              onClick={handleDeploy}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#00C389] px-4 text-xs font-semibold text-black transition-opacity hover:opacity-90"
            >
              <BarChart3 size={13} />
              Deploy Agent
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Page content */}
      <div className="pt-14">
        {page === 'home' && (
          <div className="mx-auto max-w-6xl px-4">
            <HomePage
              raceCfg={raceCfg}
              onSelectToken={handleSelectToken}
              onDeploy={handleDeploy}
              onViewLeaderboard={handleViewLeaderboard}
            />
          </div>
        )}

        {page === 'agent-hub' && (
          <div className="mx-auto max-w-6xl px-4">
            <AgentHubPage
              raceCfg={raceCfg}
              onSelectToken={handleSelectToken}
              onDeploy={handleDeploy}
              onViewLeaderboard={handleViewLeaderboard}
            />
          </div>
        )}

        {page === 'token' && selectedToken && (
          <div className="mx-auto max-w-6xl px-4">
            <TokenOpinionPage
              raceCfg={raceCfg}
              symbol={selectedToken}
              onBack={handleBackToHub}
            />
          </div>
        )}

        {page === 'stats' && <StatsPage raceCfg={raceCfg} />}

        {page === 'leaderboard' && (
          <LeaderboardPage
            raceCfg={raceCfg}
            onOpenContract={openContractFromLeaderboard}
          />
        )}

        {page === 'docs' && <DocsPage />}

        {page === 'trader' && (
          <div className="mx-auto max-w-6xl px-4 pt-6 pb-10">
            {/* Auth warning */}
            {isConnected && !jwtToken && authError && (
              <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
                <ShieldAlert className="h-5 w-5 shrink-0 text-red-400" />
                <div className="flex-1 text-sm text-red-300">
                  <span className="font-semibold">Not authenticated:</span>{' '}
                  {authError}
                  <span className="text-red-400/70"> — owner actions won&apos;t work.</span>
                </div>
                <button
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1 text-xs text-gray-300 transition-colors hover:bg-white/5"
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

            {tab.kind === 'contract' && activeContract ? (
              <ContractDetailPanel
                key={tab.contractId}
                contract={activeContract}
                raceCfg={raceCfg}
                onDeleted={(id) => void handleContractDeleted(id)}
                onStatusChanged={handleContractStatusChanged}
              />
            ) : tab.kind === 'contract' && allContracts == null ? (
              <div className="mt-4 flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-[#00C389]" />
              </div>
            ) : (
              <DeployPanel
                persisted={persisted}
                setPersisted={setPersisted}
                raceCfg={raceCfg}
                onContractRegistered={(id) => void handleContractRegistered(id)}
              />
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-black px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2 font-mono text-sm text-gray-500">
            <Bot size={14} className="text-[#00C389]" />
            AgntM — built on TON
          </div>
          <div className="flex gap-6 text-xs text-gray-600">
            <a href="#docs" className="hover:text-gray-400">Docs</a>
            <a href="https://github.com" className="hover:text-gray-400" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="/v2" className="hover:text-gray-400">Classic UI (v2)</a>
          </div>
          <p className="text-xs text-gray-700">Not financial advice. Trade responsibly.</p>
        </div>
      </footer>
    </div>
  );
}
