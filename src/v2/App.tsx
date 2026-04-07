import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChakraProvider } from '@chakra-ui/react';
import { Box, Heading, Text } from '@chakra-ui/react';
import { system } from './theme';
import { Layout } from './components/Layout';
import { HomePage } from './components/HomePage';
import { primeKnownPrices, type PublicApiConfig } from '../lib/api';
import { useLocalStorageState } from '../lib/storage';
import { useAuth } from '../lib/useAuth';

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

  // Routing
  const [page, setPageState] = useState<Page>(routeFromHash);

  const setPage = useCallback((p: Page) => {
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
    switch (page) {
      case 'home':
        return (
          <HomePage
            raceCfg={raceCfg}
            onSelectToken={(symbol) => {
              // TODO: navigate to token detail page when implemented
              console.info('select token:', symbol);
            }}
            onDeploy={() => setPage('trader')}
            onViewLeaderboard={() => setPage('leaderboard')}
          />
        );
      case 'agent-hub':
        return <StubPage title="Agent Hub" />;
      case 'stats':
        return <StubPage title="Order Book" />;
      case 'trader':
        return <StubPage title="My Agents" />;
      case 'leaderboard':
        return <StubPage title="Leaderboard" />;
      case 'docs':
        return <StubPage title="Docs" />;
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
