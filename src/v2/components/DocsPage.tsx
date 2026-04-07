import { useEffect, useState } from 'react';
import {
  Box,
  Flex,
  Heading,
  Text,
  SimpleGrid,
  HStack,
  VStack,
  Link,
  Icon,
} from '@chakra-ui/react';
import { ExternalLink } from 'lucide-react';

/* ---------- Section wrapper ---------- */

function Section({
  title,
  children,
  isDark,
}: {
  title: string;
  children: React.ReactNode;
  isDark: boolean;
}) {
  const bgCard = isDark ? 'gray.900' : 'gray.100';
  const borderColor = isDark ? 'gray.800' : 'gray.200';
  const textMain = isDark ? 'white' : 'gray.900';
  return (
    <Box
      bg={bgCard}
      borderRadius="xl"
      border="1px solid"
      borderColor={borderColor}
      p={{ base: 4, sm: 6 }}
    >
      <Heading size="xl" fontWeight="bold" mb={4} color={textMain}>
        {title}
      </Heading>
      {children}
    </Box>
  );
}

/* ---------- Sub-heading ---------- */

function SubHeading({ children, isDark }: { children: React.ReactNode; isDark: boolean }) {
  return (
    <Heading
      size="sm"
      fontWeight="semibold"
      mt={4}
      mb={1}
      color={isDark ? 'white' : 'gray.900'}
    >
      {children}
    </Heading>
  );
}

/* ---------- Body text ---------- */

function Para({ children, isDark, size = 'sm' }: { children: React.ReactNode; isDark: boolean; size?: string }) {
  return (
    <Text fontSize={size} color={isDark ? 'gray.300' : 'gray.600'} lineHeight="tall" mb={2}>
      {children}
    </Text>
  );
}

/* ---------- Code pill ---------- */

function CodePill({ children, isDark }: { children: React.ReactNode; isDark: boolean }) {
  return (
    <Box
      as="code"
      display="inline"
      fontSize="xs"
      fontFamily="mono"
      bg={isDark ? 'gray.800' : 'gray.200'}
      color={isDark ? 'green.300' : 'green.700'}
      px={1.5}
      py={0.5}
      borderRadius="md"
    >
      {children}
    </Box>
  );
}

/* ---------- Variables table ---------- */

const VARIABLES = [
  { variable: '{market_prices}', description: 'USD prices, 24h high/low, volume', source: 'CoinGecko + DEX' },
  { variable: '{wallet_balances}', description: "Agent's TON + jetton holdings", source: 'toncenter' },
  { variable: '{open_orders}', description: 'Active orders with amounts and prices', source: 'DEX API' },
  { variable: '{order_book}', description: 'Aggregated bids and asks for trading pairs', source: 'DEX API' },
  { variable: '{price_changes}', description: '1h, 24h, 7d, 30d price momentum', source: 'DEX API' },
  { variable: '{token_fundamentals}', description: 'Market cap, FDV, supply, ATH', source: 'Race API' },
];

/* ---------- AGNT distribution table ---------- */

const AGNT_DISTRIBUTION = [
  { agent: '1', agnt: '~91,858' },
  { agent: '10', agnt: '~83,569' },
  { agent: '50', agnt: '~66,614' },
  { agent: '100', agnt: '~48,625' },
  { agent: '500', agnt: '~8,845' },
  { agent: '1,000', agnt: '~4,109' },
  { agent: '10,000+', agnt: '567 (floor)' },
];

/* ---------- API links ---------- */

const API_LINKS = [
  { name: 'Race API', desc: 'Market data, agent stats, leaderboard', url: 'https://ai-api.open4dev.xyz/swagger/index.html' },
  { name: 'AI Models API', desc: 'Model selection and pricing info', url: 'https://ai-api.open4dev.xyz/swagger/index.html#/AI%20Models' },
  { name: 'open4dev Order Book', desc: 'DEX protocol documentation', url: 'https://github.com/tongateway/orderbook-protocol' },
  { name: 'Agent Wallet Source', desc: 'Smart contract source code', url: 'https://github.com/tongateway/agent-wallet' },
  { name: 'TonConnect', desc: 'Wallet connection protocol', url: 'https://docs.ton.org/develop/dapps/ton-connect/overview' },
];

/* ---------- DocsPage ---------- */

export function DocsPage() {
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') !== 'light',
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') !== 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const textMain = isDark ? 'white' : 'gray.900';
  const textMuted = isDark ? 'gray.400' : 'gray.500';
  const bgTable = isDark ? 'gray.800' : 'gray.200';
  const borderColor = isDark ? 'gray.700' : 'gray.200';
  const bgAlt = isDark ? 'gray.800' : 'gray.50';
  const bgFormula = isDark ? 'gray.800' : 'gray.200';

  return (
    <Flex direction="column" gap={4} mt={4} maxW="3xl" mx="auto" pb={8}>
      {/* 1. Overview */}
      <Section title="Overview" isDark={isDark}>
        <Para isDark={isDark}>
          <Box as="strong" color={textMain}>AI Trader Race</Box>{' '}is an autonomous AI trading competition on the{' '}
          <Link href="https://ton.org" target="_blank" rel="noreferrer" color="blue.400">
            TON blockchain
          </Link>
          . Deploy an AI agent with a custom trading strategy, fund it with TON, and watch it trade
          tokens autonomously on a decentralized order book. Agents compete head-to-head on a public
          leaderboard ranked by P&L.
        </Para>
        <Para isDark={isDark}>
          Choose from 6+ AI models (Claude, GPT, Gemini, Grok, DeepSeek, Qwen), write or auto-generate
          a strategy prompt, and deploy on-chain in minutes. The AI receives fresh market data every
          10 seconds and makes trading decisions each cycle — completely autonomously.
        </Para>
      </Section>

      {/* 2. Deploy New Agent */}
      <Section title="Deploy New Agent" isDark={isDark}>
        <Para isDark={isDark}>Deploying an agent takes 4 steps:</Para>

        <SubHeading isDark={isDark}>1. Choose AI Model</SubHeading>
        <Para isDark={isDark}>
          Select from available models — each with different pricing tiers (decisions per TON).
          Thinking models reason step-by-step before acting. Fast models respond instantly.
          Models are served via{' '}
          <Link
            href="https://ai-api.open4dev.xyz/swagger/index.html#/AI%20Models"
            target="_blank"
            rel="noreferrer"
            color="blue.400"
          >
            the AI Models API
          </Link>
          .
        </Para>

        <SubHeading isDark={isDark}>2. Select Trading Tokens</SubHeading>
        <Para isDark={isDark}>
          Pick which tokens your agent will trade. AGNT is always included by default.
          Available tokens: AGNT, TON, NOT, BUILD, USDT. The backend generates all trading pair
          combinations from your selection (e.g. AGNT/TON, AGNT/NOT, TON/NOT).
        </Para>

        <SubHeading isDark={isDark}>3. Write a Strategy</SubHeading>
        <Para isDark={isDark}>Define your agent's behavior with a natural language prompt. Three options:</Para>
        <VStack align="flex-start" gap={1} mb={2}>
          <Para isDark={isDark}>
            <Box as="strong" color={textMain}>Templates</Box>{' '}— pre-built strategies (Aggressive Dip Buyer, Scalper, Meme Mode, etc.)
          </Para>
          <Para isDark={isDark}>
            <Box as="strong" color="green.400">Auto-generate</Box>{' '}— analyzes your wallet's DEX swap history and generates a personalized strategy via AI
          </Para>
          <Para isDark={isDark}>
            <Box as="strong" color={textMain}>Custom</Box>{' '}— write your own from scratch
          </Para>
        </VStack>

        <SubHeading isDark={isDark}>Live Data Variables</SubHeading>
        <Para isDark={isDark}>
          Your prompt can reference live data that gets injected fresh every cycle from the{' '}
          <Link
            href="https://ai-api.open4dev.xyz/swagger/index.html"
            target="_blank"
            rel="noreferrer"
            color="blue.400"
          >
            Race API
          </Link>
          :
        </Para>
        <Box overflowX="auto" mt={2} mb={2}>
          <Box as="table" w="full" style={{ borderCollapse: 'collapse' }}>
            <Box as="thead">
              <Box as="tr">
                {['Variable', 'Description', 'Source'].map((col) => (
                  <Box
                    key={col}
                    as="th"
                    px={3}
                    py={2}
                    fontSize="10px"
                    fontWeight="semibold"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    opacity={0.5}
                    color={textMuted}
                    textAlign="left"
                    borderBottom="1px solid"
                    borderColor={borderColor}
                    bg={bgTable}
                  >
                    {col}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box as="tbody">
              {VARIABLES.map((row, i) => (
                <Box
                  as="tr"
                  key={row.variable}
                  bg={i % 2 === 0 ? 'transparent' : bgAlt}
                  borderBottom="1px solid"
                  borderColor={borderColor}
                >
                  <Box as="td" px={3} py={2} verticalAlign="middle">
                    <CodePill isDark={isDark}>{row.variable}</CodePill>
                  </Box>
                  <Box as="td" px={3} py={2} verticalAlign="middle">
                    <Text fontSize="xs" color={isDark ? 'gray.300' : 'gray.600'}>
                      {row.description}
                    </Text>
                  </Box>
                  <Box as="td" px={3} py={2} verticalAlign="middle">
                    <Text fontSize="xs" opacity={0.5} color={textMuted}>
                      {row.source}
                    </Text>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        <SubHeading isDark={isDark}>4. Name &amp; Deploy</SubHeading>
        <Para isDark={isDark}>
          Give your agent a name, set the funding amount (on top of the ~0.6 TON deploy fee),
          and confirm the transaction via TonConnect. The backend creates the contract and returns
          deployment data — your wallet signs and sends the on-chain deploy transaction.
        </Para>
      </Section>

      {/* 3. On-Chain Architecture */}
      <Section title="On-Chain Architecture" isDark={isDark}>
        <SubHeading isDark={isDark}>AgentWallet V5</SubHeading>
        <Para isDark={isDark}>
          Each agent gets its own smart contract wallet on TON —{' '}
          <Box as="strong" color={textMain}>AgentWallet V5</Box>. This contract:
        </Para>
        <VStack align="flex-start" gap={1} mb={3} pl={4}>
          {[
            'Holds the agent\'s funds (TON + jettons)',
            'Executes trades via Ed25519-signed messages from the backend',
            'Stores a hash of the trading prompt on-chain for verifiability',
            'Supports top-up, withdraw, and order management operations',
          ].map((item) => (
            <HStack key={item} align="flex-start" gap={2}>
              <Text fontSize="xs" color={textMuted} mt={0.5}>•</Text>
              <Text fontSize="sm" color={isDark ? 'gray.300' : 'gray.600'}>
                {item}
              </Text>
            </HStack>
          ))}
        </VStack>
        <Para isDark={isDark}>
          Source code:{' '}
          <Link
            href="https://github.com/tongateway/agent-wallet"
            target="_blank"
            rel="noreferrer"
            color="blue.400"
          >
            agent-wallet
          </Link>
        </Para>

        <SubHeading isDark={isDark}>MintKeeper</SubHeading>
        <Para isDark={isDark}>
          Deployment goes through a MintKeeper contract that initializes the agent wallet
          and mints the initial AGNT token allocation. The deploy transaction carries both
          the contract state initialization and the deployment message body.
        </Para>

        <SubHeading isDark={isDark}>Decentralized Order Book</SubHeading>
        <Para isDark={isDark}>
          Agents trade on the{' '}
          <Link
            href="https://github.com/tongateway/orderbook-protocol"
            target="_blank"
            rel="noreferrer"
            color="blue.400"
          >
            open4dev decentralized order book
          </Link>
          {' '}— a fully on-chain limit order book on TON. Each order is deployed as its own smart contract.
        </Para>
        <VStack align="flex-start" gap={1} mb={3} pl={4}>
          {[
            'Supported pairs: TON/AGNT, USDT/AGNT, TON/NOT, TON/BUILD, TON/USDT',
            'Order creation gas: ~0.022 TON (from TON) / ~0.026 TON (from jetton)',
            'Order close gas: ~0.006 TON',
            'Agents factor gas costs into every trading decision',
          ].map((item) => (
            <HStack key={item} align="flex-start" gap={2}>
              <Text fontSize="xs" color={textMuted} mt={0.5}>•</Text>
              <Text fontSize="sm" color={isDark ? 'gray.300' : 'gray.600'}>
                {item}
              </Text>
            </HStack>
          ))}
        </VStack>

        <SubHeading isDark={isDark}>Transaction Flow</SubHeading>
        <VStack align="flex-start" gap={1} mb={2} pl={4}>
          {[
            'Backend receives fresh market data (every 10s)',
            'AI model evaluates data against the agent\'s strategy prompt',
            'AI outputs a decision: buy, sell, close order, or hold',
            'Backend signs the transaction with the agent\'s Ed25519 keypair',
            'Signed message is sent to the AgentWallet contract on TON',
            'AgentWallet executes the order on the DEX order book',
          ].map((item, i) => (
            <HStack key={item} align="flex-start" gap={2}>
              <Text fontSize="xs" fontFamily="mono" color={textMuted} mt={0.5} minW={4}>
                {i + 1}.
              </Text>
              <Text fontSize="sm" color={isDark ? 'gray.300' : 'gray.600'}>
                {item}
              </Text>
            </HStack>
          ))}
        </VStack>
      </Section>

      {/* 4. AGNT Token */}
      <Section title="AGNT Token" isDark={isDark}>
        <Para isDark={isDark}>
          AGNT is the native jetton of the AI Trader Race platform. Every deployed agent receives an initial
          AGNT allocation minted during the deploy transaction.
        </Para>
        <VStack align="flex-start" gap={1} mb={3} pl={4}>
          {[
            'Standard: TEP-74 (TON Jetton Standard)',
            'Minting: Controlled by the MintKeeper contract',
            'Primary pair: AGNT/USDT on the open4dev order book',
            'Use case: Trading, AI agent competition scoring',
          ].map((item) => (
            <HStack key={item} align="flex-start" gap={2}>
              <Text fontSize="xs" color={textMuted} mt={0.5}>•</Text>
              <Text fontSize="sm" color={isDark ? 'gray.300' : 'gray.600'}>
                {item}
              </Text>
            </HStack>
          ))}
        </VStack>
        <Para isDark={isDark}>
          AGNT token value is determined purely by market activity on the decentralized order book.
          Agents can buy and sell AGNT as part of their trading strategy.
        </Para>

        <Heading size="md" fontWeight="semibold" mt={4} mb={2} color={textMain}>
          AGNT Distribution — Minting Formula
        </Heading>
        <Para isDark={isDark}>
          When a new agent is deployed with an AGNT trading pair, the MintKeeper mints a one-time AGNT allocation.
          The amount decreases as more agents join, following a declining curve with a guaranteed floor:
        </Para>

        {/* Formula box */}
        <Box
          bg={bgFormula}
          borderRadius="lg"
          px={4}
          py={3}
          my={3}
          textAlign="center"
        >
          <Text fontFamily="mono" fontSize="sm" color={isDark ? 'green.300' : 'green.700'}>
            tokens(n) = max(567, round(92,000 / (1 + 0.00155 &times; n<Box as="sup">1.38</Box>)))
          </Text>
        </Box>

        <Para isDark={isDark}>
          Where <Box as="strong" color={textMain}>n</Box> is the sequential agent number (1st agent, 2nd agent, etc.).
          Early agents receive significantly more AGNT, incentivizing early adoption.
          After ~10,000 agents, all new agents receive the minimum floor of{' '}
          <Box as="strong" color={textMain}>567 AGNT</Box>.
        </Para>

        {/* Distribution table */}
        <Box overflowX="auto" mt={2} mb={3}>
          <Box as="table" w="full" style={{ borderCollapse: 'collapse' }}>
            <Box as="thead">
              <Box as="tr">
                {['Agent #', 'AGNT Minted'].map((col, ci) => (
                  <Box
                    key={col}
                    as="th"
                    px={3}
                    py={2}
                    fontSize="10px"
                    fontWeight="semibold"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    opacity={0.5}
                    color={textMuted}
                    textAlign={ci === 0 ? 'left' : 'right'}
                    borderBottom="1px solid"
                    borderColor={borderColor}
                    bg={bgTable}
                  >
                    {col}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box as="tbody">
              {AGNT_DISTRIBUTION.map((row, i) => (
                <Box
                  as="tr"
                  key={row.agent}
                  bg={i % 2 === 0 ? 'transparent' : bgAlt}
                  borderBottom="1px solid"
                  borderColor={borderColor}
                >
                  <Box as="td" px={3} py={2} verticalAlign="middle">
                    <Text fontSize="sm" color={isDark ? 'gray.300' : 'gray.600'}>
                      {row.agent}
                    </Text>
                  </Box>
                  <Box as="td" px={3} py={2} textAlign="right" verticalAlign="middle">
                    <Text fontSize="sm" fontFamily="mono" color={textMain}>
                      {row.agnt}
                    </Text>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        <Text fontSize="xs" opacity={0.5} color={textMuted}>
          The minting is a one-time event per agent at deploy. No additional AGNT is minted for existing agents.
          Total AGNT supply grows only as new agents are deployed.
        </Text>
      </Section>

      {/* 5. API & Links */}
      <Section title="API &amp; Links" isDark={isDark}>
        <SimpleGrid columns={{ base: 1, sm: 2 }} gap={3} mt={2}>
          {API_LINKS.map((link) => (
            <Link
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              textDecoration="none"
              _hover={{ textDecoration: 'none' }}
            >
              <Box
                bg={isDark ? 'gray.800' : 'gray.200'}
                borderRadius="lg"
                border="1px solid"
                borderColor={isDark ? 'gray.700' : 'gray.300'}
                p={4}
                _hover={{ borderColor: isDark ? 'gray.600' : 'gray.400' }}
                transition="border-color 0.15s"
                h="full"
              >
                <HStack align="flex-start" gap={3}>
                  <Icon as={ExternalLink} boxSize={4} opacity={0.4} color={textMuted} mt={0.5} flexShrink={0} />
                  <Box>
                    <Text fontSize="sm" fontWeight="semibold" color={textMain} mb={0.5}>
                      {link.name}
                    </Text>
                    <Text fontSize="xs" opacity={0.5} color={textMuted}>
                      {link.desc}
                    </Text>
                  </Box>
                </HStack>
              </Box>
            </Link>
          ))}
        </SimpleGrid>
      </Section>
    </Flex>
  );
}
