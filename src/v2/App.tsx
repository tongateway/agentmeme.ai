import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { Box, Heading, Text } from '@chakra-ui/react';
import { system } from './theme';
import { Layout } from './components/Layout';
import { HomePage } from './components/HomePage';
import { AgentHubPage } from './components/AgentHubPage';
import { TokenOpinionPage } from './components/TokenOpinionPage';
import { StatsPage } from './components/StatsPage';
import { LeaderboardPage } from './components/LeaderboardPage';
import { DocsPage } from './components/DocsPage';
import { DeployPanel, type Persisted } from './components/DeployPanel';
import { primeKnownPrices, type PublicApiConfig } from '../lib/api';
import { useLocalStorageState } from '../lib/storage';
import { useAuth } from '../lib/useAuth';
import { generateAgentKeypair } from '../lib/crypto';

type Page = 'home' | 'leaderboard' | 'stats' | 'trader' | 'docs' | 'agent-hub';

const VALID_PAGES = new Set<Page>([
  'home',
  'leaderboard',
  'stats',
  'trader',
  'docs',
  'agent-hub',
]);

const THEME_KEY = 'ai-trader-race:theme';
const PERSISTED_KEY = 'ai-trader-race:v2:deploy';

function routeFromHash(): Page {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const first = raw.split('/')[0]?.toLowerCase() as Page | undefined;
  if (first && VALID_PAGES.has(first)) return first;
  return 'home';
}

function StubPage({ title }: { title: string }) {
  return (
    <Box p={8}>
      <Heading size="2xl" mb={4}>
        {title}
      </Heading>
      <Text color="gray.500">Coming soon...</Text>
    </Box>
  );
}

function V2AppInner() {
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

  // Prime known USD prices cache early
  useEffect(() => {
    void primeKnownPrices(raceCfg);
  }, [raceCfg]);

  // Deploy panel persisted state
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

  const [persisted, setPersisted] = useLocalStorageState<Persisted>(PERSISTED_KEY, createInitialPersisted);
  const [, setMyContractIds] = useLocalStorageState<string[]>('ai-trader-race:v2:contracts', []);

  const handleContractRegistered = useCallback((contractId: string) => {
    setMyContractIds((prev) => (prev.includes(contractId) ? prev : [...prev, contractId]));
  }, [setMyContractIds]);

  // Routing
  const [page, setPageState] = useState<Page>(routeFromHash);
  const [selectedToken, setSelectedToken] = useState<string | null>(null);

  const setPage = useCallback((p: Page) => {
    setSelectedToken(null);
    setPageState(p);
  }, []);

  // Sync hash with page state
  useEffect(() => {
    const hash = page === 'home' ? '' : `#${page}`;
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  }, [page]);

  // Handle browser back/forward
  useEffect(() => {
    const onHashChange = () => setPageState(routeFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Theme / color mode — synced with v1 localStorage key
  const [colorMode, setColorMode] = useLocalStorageState<'light' | 'dark'>(THEME_KEY, 'dark');

  const toggleColorMode = useCallback(() => {
    setColorMode((m) => (m === 'dark' ? 'light' : 'dark'));
  }, [setColorMode]);

  // Apply data-theme attribute for the html element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', colorMode);
  }, [colorMode]);

  function renderPage() {
    // Token detail view overlays the current page
    if (selectedToken) {
      return (
        <TokenOpinionPage
          raceCfg={raceCfg}
          symbol={selectedToken}
          onBack={() => setSelectedToken(null)}
        />
      );
    }

    switch (page) {
      case 'home':
        return (
          <HomePage
            raceCfg={raceCfg}
            onSelectToken={(symbol) => setSelectedToken(symbol)}
            onDeploy={() => setPage('trader')}
            onViewLeaderboard={() => setPage('leaderboard')}
          />
        );
      case 'agent-hub':
        return (
          <AgentHubPage
            raceCfg={raceCfg}
            onSelectToken={(symbol) => setSelectedToken(symbol)}
            onDeploy={() => setPage('trader')}
            onViewLeaderboard={() => setPage('leaderboard')}
          />
        );
      case 'stats':
        return <StatsPage raceCfg={raceCfg} isDark={colorMode === 'dark'} />;
      case 'trader':
        return (
          <DeployPanel
            persisted={persisted}
            setPersisted={setPersisted}
            raceCfg={raceCfg}
            onContractRegistered={handleContractRegistered}
          />
        );
      case 'leaderboard':
        return <LeaderboardPage raceCfg={raceCfg} />;
      case 'docs':
        return <DocsPage />;
      default:
        return <StubPage title="Home" />;
    }
  }

  return (
    <Layout
      currentPage={page}
      onNavigate={setPage}
      colorMode={colorMode}
      onToggleColorMode={toggleColorMode}
    >
      {renderPage()}
    </Layout>
  );
}

export default function V2App() {
  return (
    <ChakraProvider value={system}>
      <V2AppInner />
    </ChakraProvider>
  );
}
