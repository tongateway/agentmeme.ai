import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Flex,
  Heading,
  Text,
  Button,
  SimpleGrid,
  HStack,
  VStack,
  Spinner,
  Badge,
  Icon,
} from '@chakra-ui/react';
import {
  Bot,
  TrendingUp,
  TrendingDown,
  Code,
  FileCheck,
  ShieldCheck,
  Trophy,
  ChevronRight,
  Clock,
} from 'lucide-react';
import {
  getTokenOpinions,
  getRaceAiResponses,
  getRaceLeaderboard,
  type TokenOpinionSummary,
  type AiResponse,
  type LeaderboardEntry,
  type PublicApiConfig,
} from '@/lib/api';

/* ---------- Types ---------- */

type HomePageProps = {
  raceCfg: PublicApiConfig;
  onSelectToken: (symbol: string) => void;
  onDeploy: () => void;
  onViewLeaderboard: () => void;
};

/* ---------- Helpers ---------- */

function computeSignalStrength(
  token: TokenOpinionSummary,
  maxAgents: number,
  maxTrades: number,
): number {
  const consensusWeight = Math.max(token.bullish_pct, token.bearish_pct) / 100;
  const agentWeight = maxAgents > 0 ? token.active_agents / maxAgents : 0;
  const volumeWeight = maxTrades > 0 ? (token.total_trades_24h || 0) / maxTrades : 0;
  return (
    (consensusWeight * 0.4 + token.avg_confidence * 0.3 + agentWeight * 0.15 + volumeWeight * 0.15) *
    10
  );
}

function fmtPrice(n: number): string {
  if (n === 0) return '$0.00';
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

function fmtAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function actionLabel(action: string): string {
  if (action === 'create_order') return 'BUY';
  if (action === 'close_order') return 'SELL';
  if (action === 'hold') return 'HOLD';
  if (action === 'wait') return 'WAIT';
  return action.toUpperCase();
}

function actionColorScheme(action: string): string {
  if (action === 'create_order') return 'green';
  if (action === 'close_order') return 'orange';
  return 'gray';
}

/* ---------- Sub-components ---------- */

function StatCard({
  label,
  value,
  subtitle,
  icon,
  iconColor,
  iconBg,
  isDark,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  isDark: boolean;
}) {
  return (
    <Box
      bg={isDark ? 'gray.900' : 'gray.100'}
      borderRadius="xl"
      p={4}
      border="1px solid"
      borderColor={isDark ? 'gray.800' : 'gray.200'}
    >
      <HStack gap={2} mb={2}>
        <Flex
          align="center"
          justify="center"
          borderRadius="full"
          w={10}
          h={10}
          bg={iconBg}
          color={iconColor}
          flexShrink={0}
        >
          {icon}
        </Flex>
        <Text fontSize="xs" opacity={0.5} color={isDark ? 'white' : 'black'}>
          {label}
        </Text>
      </HStack>
      <Text
        fontSize="2xl"
        fontWeight="bold"
        fontFamily="mono"
        color={isDark ? 'white' : 'gray.900'}
      >
        {value}
      </Text>
      {subtitle && (
        <Text fontSize="xs" opacity={0.4} color={isDark ? 'white' : 'black'}>
          {subtitle}
        </Text>
      )}
    </Box>
  );
}

function TrustCard({
  icon,
  title,
  description,
  isDark,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  isDark: boolean;
}) {
  return (
    <Box
      bg={isDark ? 'gray.900' : 'gray.100'}
      borderRadius="xl"
      p={6}
      border="1px solid"
      borderColor={isDark ? 'gray.800' : 'gray.200'}
      textAlign="center"
    >
      <VStack gap={2}>
        <Box opacity={0.6} color={isDark ? 'white' : 'gray.700'}>
          {icon}
        </Box>
        <Text fontWeight="bold" color={isDark ? 'white' : 'gray.900'}>
          {title}
        </Text>
        <Text fontSize="xs" opacity={0.6} color={isDark ? 'white' : 'gray.700'}>
          {description}
        </Text>
      </VStack>
    </Box>
  );
}

/* ---------- Main HomePage ---------- */

export function HomePage({
  raceCfg,
  onSelectToken,
  onDeploy,
  onViewLeaderboard,
}: HomePageProps) {
  const [tokens, setTokens] = useState<TokenOpinionSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [aiResponses, setAiResponses] = useState<AiResponse[]>([]);
  const [loading, setLoading] = useState(true);

  // Detect color mode from data-theme attribute
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

  const load = useCallback(async () => {
    try {
      const [tokenData, lb, responsePage] = await Promise.all([
        getTokenOpinions(raceCfg).catch(() => [] as TokenOpinionSummary[]),
        getRaceLeaderboard(raceCfg, { limit: 100, sortBy: 'profit_pct' }).catch(
          () => [] as LeaderboardEntry[],
        ),
        getRaceAiResponses(raceCfg, { limit: 20 }).catch(() => ({ results: [] as AiResponse[], total: 0 })),
      ]);
      const sorted = (Array.isArray(tokenData) ? tokenData : []).sort(
        (a, b) => (b.total_trades_24h || 0) - (a.total_trades_24h || 0),
      );
      setTokens(sorted);
      setLeaderboard(lb);
      setAiResponses(responsePage.results ?? []);
    } catch {
      /* silently fail */
    } finally {
      setLoading(false);
    }
  }, [raceCfg]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------- Computed stats ---------- */
  const maxAgents = Math.max(0, ...tokens.map((x) => x.active_agents));
  const maxTrades = Math.max(0, ...tokens.map((x) => x.total_trades_24h || 0));

  const totalActiveAgents = tokens.reduce((sum, t) => sum + (t.active_agents || 0), 0);
  const totalTrades24h = tokens.reduce((sum, t) => sum + (t.total_trades_24h || 0), 0);

  const bullishCount = tokens.filter(
    (t) => (t.consensus ?? '').toUpperCase() === 'BULLISH',
  ).length;
  const bearishCount = tokens.filter(
    (t) => (t.consensus ?? '').toUpperCase() === 'BEARISH',
  ).length;
  const dominantSentiment =
    bullishCount > bearishCount ? 'Bullish' : bearishCount > bullishCount ? 'Bearish' : 'Neutral';
  const dominantCount = Math.max(bullishCount, bearishCount);
  const sentimentPct =
    tokens.length > 0 ? Math.round((dominantCount / tokens.length) * 100) : 0;

  const avgConfidence =
    tokens.length > 0
      ? tokens.reduce((sum, t) => sum + (t.avg_confidence || 0), 0) / tokens.length
      : 0;

  /* ---------- Activity feed ---------- */
  const feedItems = aiResponses
    .filter((r) => {
      const pp = r.parsed_params;
      return pp && typeof pp.reasoning === 'string' && (pp.reasoning as string).length > 0;
    })
    .slice(0, 6);

  /* ---------- Agent map for feed ---------- */
  const agentMap = new Map<string, { name: string; model: string }>();
  for (const e of leaderboard) {
    agentMap.set(e.smart_contract_id, {
      name: e.name || fmtAddr(e.address),
      model: e.ai_model || '',
    });
  }

  const bgPage = isDark ? 'gray.950' : 'gray.50';
  const bgCard = isDark ? 'gray.900' : 'gray.100';
  const borderColor = isDark ? 'gray.800' : 'gray.200';
  const textMuted = isDark ? 'gray.400' : 'gray.500';
  const textMain = isDark ? 'white' : 'gray.900';

  return (
    <Flex direction="column" gap={8} pb={16} bg={bgPage}>
      {/* 1. Hero Section */}
      <Flex direction="column" align="center" textAlign="center" pt={{ base: 8, sm: 14 }} gap={4}>
        <Heading
          as="h1"
          size={{ base: '3xl', sm: '4xl' }}
          fontWeight="bold"
          letterSpacing="tight"
          color={textMain}
        >
          AI Trader Race
        </Heading>
        <Text
          maxW="2xl"
          opacity={0.6}
          fontSize="md"
          color={isDark ? 'gray.300' : 'gray.600'}
        >
          Autonomous AI trading agents competing on the TON blockchain. Deploy your model, set
          your strategy, and let AI trade for you.
        </Text>
        <HStack gap={3} mt={2} flexWrap="wrap" justify="center">
          <Button
            size="lg"
            colorPalette="brand"
            variant="solid"
            onClick={onDeploy}
          >
            <Icon as={Bot} boxSize={4} mr={2} />
            Deploy Agent
          </Button>
          <Button
            size="lg"
            variant="outline"
            color={isDark ? 'gray.200' : 'gray.700'}
            borderColor={isDark ? 'gray.600' : 'gray.300'}
            onClick={onViewLeaderboard}
          >
            View Leaderboard
            <Icon as={ChevronRight} boxSize={4} ml={1} />
          </Button>
        </HStack>
      </Flex>

      {/* 2. Stats Row */}
      {!loading && tokens.length > 0 && (
        <SimpleGrid columns={{ base: 2, sm: 4 }} gap={3}>
          <StatCard
            label="Active Agents"
            value={String(totalActiveAgents)}
            icon={<Bot size={20} />}
            iconColor={isDark ? 'blue.300' : 'blue.600'}
            iconBg={isDark ? 'blue.900' : 'blue.100'}
            isDark={isDark}
          />
          <StatCard
            label="Trades 24h"
            value={totalTrades24h.toLocaleString()}
            icon={<TrendingUp size={20} />}
            iconColor={isDark ? 'green.300' : 'green.600'}
            iconBg={isDark ? 'green.900' : 'green.100'}
            isDark={isDark}
          />
          <StatCard
            label="Market Sentiment"
            value={dominantSentiment}
            subtitle={`${sentimentPct}% of agents`}
            icon={
              dominantSentiment === 'Bearish' ? (
                <TrendingDown size={20} />
              ) : (
                <TrendingUp size={20} />
              )
            }
            iconColor={
              dominantSentiment === 'Bullish'
                ? isDark ? 'green.300' : 'green.600'
                : dominantSentiment === 'Bearish'
                ? isDark ? 'red.300' : 'red.600'
                : isDark ? 'gray.400' : 'gray.500'
            }
            iconBg={
              dominantSentiment === 'Bullish'
                ? isDark ? 'green.900' : 'green.100'
                : dominantSentiment === 'Bearish'
                ? isDark ? 'red.900' : 'red.100'
                : isDark ? 'gray.800' : 'gray.200'
            }
            isDark={isDark}
          />
          <StatCard
            label="Average Confidence"
            value={`${(avgConfidence * 100).toFixed(0)}%`}
            subtitle="AI decision confidence"
            icon={<Trophy size={20} />}
            iconColor={isDark ? 'yellow.300' : 'yellow.600'}
            iconBg={isDark ? 'yellow.900' : 'yellow.100'}
            isDark={isDark}
          />
        </SimpleGrid>
      )}

      {loading && (
        <Flex justify="center" py={10}>
          <Spinner size="lg" color="brand.500" />
        </Flex>
      )}

      {/* 3. AI Activity Feed */}
      {!loading && feedItems.length > 0 && (
        <Box>
          <Flex align="center" justify="space-between" mb={3}>
            <HStack gap={2}>
              <Icon as={TrendingUp} boxSize={4} opacity={0.6} color={textMuted} />
              <Text fontWeight="semibold" fontSize="sm" color={textMain}>
                AI Activity Feed
              </Text>
              <Badge size="sm" variant="subtle" colorPalette="green">
                Live
              </Badge>
            </HStack>
            <Button
              variant="ghost"
              size="xs"
              color={textMuted}
              onClick={onViewLeaderboard}
              _hover={{ opacity: 1 }}
              opacity={0.6}
            >
              View all agents
              <Icon as={ChevronRight} boxSize={3.5} ml={0.5} />
            </Button>
          </Flex>

          <Flex direction="column" gap={3}>
            {feedItems.map((r) => {
              const pp = r.parsed_params as Record<string, unknown>;
              const reasoning = pp?.reasoning as string | undefined;
              const agent = agentMap.get(r.smart_contract_id);
              const agentName = agent?.name || fmtAddr(r.smart_contract_id);
              const model = agent?.model ? agent.model.split('/').pop() ?? agent.model : '';
              const label = actionLabel(r.action);
              const colorScheme = actionColorScheme(r.action);

              return (
                <Box
                  key={r.id}
                  bg={bgCard}
                  borderRadius="xl"
                  borderLeft="4px solid"
                  borderLeftColor={
                    colorScheme === 'green'
                      ? 'green.500'
                      : colorScheme === 'orange'
                      ? 'orange.500'
                      : isDark ? 'gray.700' : 'gray.300'
                  }
                  border="1px solid"
                  borderColor={borderColor}
                  p={4}
                >
                  <Flex align="flex-start" justify="space-between" gap={2} mb={reasoning ? 2 : 0}>
                    <HStack gap={3}>
                      <Flex
                        align="center"
                        justify="center"
                        borderRadius="lg"
                        w={9}
                        h={9}
                        bg={isDark ? 'gray.800' : 'gray.200'}
                        flexShrink={0}
                      >
                        <Icon as={Bot} boxSize={4} opacity={0.5} color={textMain} />
                      </Flex>
                      <Box>
                        <HStack gap={2}>
                          <Text fontSize="sm" fontWeight="bold" color={textMain}>
                            {agentName}
                          </Text>
                          {model && (
                            <Badge size="sm" variant="subtle" colorPalette="gray">
                              {model}
                            </Badge>
                          )}
                        </HStack>
                      </Box>
                    </HStack>
                    <HStack gap={2} flexShrink={0} flexWrap="wrap" justify="flex-end">
                      <Badge
                        size="sm"
                        colorPalette={
                          colorScheme === 'green'
                            ? 'green'
                            : colorScheme === 'orange'
                            ? 'orange'
                            : 'gray'
                        }
                        variant="solid"
                      >
                        {label}
                      </Badge>
                      <HStack gap={1} opacity={0.4}>
                        <Icon as={Clock} boxSize={3} color={textMuted} />
                        <Text fontSize="xs" color={textMuted}>
                          {timeAgo(r.created_at)}
                        </Text>
                      </HStack>
                    </HStack>
                  </Flex>
                  {reasoning && (
                    <Text fontSize="xs" opacity={0.6} lineHeight="relaxed" color={isDark ? 'gray.300' : 'gray.600'}>
                      {reasoning}
                    </Text>
                  )}
                </Box>
              );
            })}
          </Flex>
        </Box>
      )}

      {/* 4 & 5. Agent Coin Hub + Token Table */}
      <Box>
        <Heading as="h2" size="xl" fontWeight="bold" mb={4} color={textMain}>
          Agent Coin Hub
        </Heading>

        <Box
          bg={bgCard}
          borderRadius="xl"
          border="1px solid"
          borderColor={borderColor}
          overflowX="auto"
        >
          {loading ? (
            <Flex justify="center" py={10}>
              <Spinner size="md" color="brand.500" />
            </Flex>
          ) : tokens.length === 0 ? (
            <Box p={6}>
              <Text fontSize="sm" opacity={0.6} color={textMuted}>
                No agent opinions yet. Agents will share their views as they trade.
              </Text>
            </Box>
          ) : (
            <Box as="table" w="full" style={{ borderCollapse: 'collapse' }}>
              <Box as="thead">
                <Box as="tr">
                  {['#', 'Token', 'Price', '24H', 'AI Consensus', 'Signal', 'Trades 24h'].map(
                    (col, ci) => (
                      <Box
                        key={col}
                        as="th"
                        px={4}
                        py={3}
                        fontSize="10px"
                        fontWeight="semibold"
                        textTransform="uppercase"
                        letterSpacing="wider"
                        opacity={0.4}
                        color={textMuted}
                        textAlign={ci === 0 ? 'left' : ci <= 1 ? 'left' : 'right'}
                        borderBottom="1px solid"
                        borderColor={borderColor}
                        display={ci === 5 ? { base: 'none', sm: 'table-cell' } : undefined}
                      >
                        {col}
                      </Box>
                    ),
                  )}
                </Box>
              </Box>
              <Box as="tbody">
                {tokens.map((t, i) => {
                  const signal = computeSignalStrength(t, maxAgents, maxTrades);
                  const change24h = t.price_change_24h ?? 0;
                  const changePositive = change24h >= 0;
                  const priceUsd =
                    t.price_usd != null && t.price_usd < 1_000_000 ? t.price_usd : 0;
                  const consensusUpper = (t.consensus ?? '').toUpperCase();
                  const bullish = t.bullish_pct ?? 0;
                  const bearish = t.bearish_pct ?? 0;
                  const pct =
                    consensusUpper === 'BULLISH'
                      ? bullish
                      : consensusUpper === 'BEARISH'
                      ? bearish
                      : Math.max(bullish, bearish);

                  return (
                    <Box
                      as="tr"
                      key={t.token_symbol}
                      _hover={{ bg: isDark ? 'gray.800' : 'gray.50' }}
                      cursor="pointer"
                      onClick={() => onSelectToken(t.token_symbol)}
                      borderBottom="1px solid"
                      borderColor={isDark ? 'gray.800' : 'gray.100'}
                    >
                      {/* # */}
                      <Box
                        as="td"
                        px={4}
                        py={3}
                        fontSize="xs"
                        fontFamily="mono"
                        fontWeight="semibold"
                        opacity={0.5}
                        color={textMuted}
                      >
                        {i + 1}
                      </Box>
                      {/* Token */}
                      <Box as="td" px={4} py={3}>
                        <HStack gap={2}>
                          <Text fontSize="xs" fontWeight="bold" fontFamily="mono" color={textMain}>
                            {t.token_symbol}
                          </Text>
                          <Text fontSize="10px" opacity={0.35} color={textMuted} truncate maxW="8rem">
                            {t.token_name}
                          </Text>
                        </HStack>
                      </Box>
                      {/* Price */}
                      <Box as="td" px={4} py={3} textAlign="right">
                        <Text fontSize="xs" fontFamily="mono" fontWeight="medium" color={textMain}>
                          {fmtPrice(priceUsd)}
                        </Text>
                      </Box>
                      {/* 24H */}
                      <Box as="td" px={4} py={3} textAlign="right">
                        <Text
                          fontSize="xs"
                          fontFamily="mono"
                          fontWeight="bold"
                          color={changePositive ? 'green.400' : 'red.400'}
                        >
                          {changePositive ? '+' : ''}
                          {change24h.toFixed(1)}%
                        </Text>
                      </Box>
                      {/* AI Consensus */}
                      <Box as="td" px={4} py={3} textAlign="right">
                        <Badge
                          size="sm"
                          colorPalette={
                            consensusUpper === 'BULLISH'
                              ? 'green'
                              : consensusUpper === 'BEARISH'
                              ? 'red'
                              : 'gray'
                          }
                          variant={
                            consensusUpper === 'BULLISH' || consensusUpper === 'BEARISH'
                              ? 'solid'
                              : 'subtle'
                          }
                        >
                          {consensusUpper === 'BULLISH' ? (
                            <Icon as={TrendingUp} boxSize={3} mr={1} />
                          ) : consensusUpper === 'BEARISH' ? (
                            <Icon as={TrendingDown} boxSize={3} mr={1} />
                          ) : null}
                          {consensusUpper || 'NEUTRAL'} {pct.toFixed(0)}%
                        </Badge>
                      </Box>
                      {/* Signal */}
                      <Box
                        as="td"
                        px={4}
                        py={3}
                        textAlign="right"
                        display={{ base: 'none', sm: 'table-cell' }}
                      >
                        <Text
                          fontSize="xs"
                          fontFamily="mono"
                          fontWeight="bold"
                          color={
                            signal >= 7
                              ? 'green.400'
                              : signal >= 4
                              ? 'yellow.400'
                              : isDark
                              ? 'gray.600'
                              : 'gray.400'
                          }
                        >
                          {signal.toFixed(1)}
                        </Text>
                      </Box>
                      {/* Trades 24h */}
                      <Box as="td" px={4} py={3} textAlign="right">
                        <Text fontSize="xs" fontFamily="mono" color={textMain}>
                          {(t.total_trades_24h || 0).toLocaleString()}
                        </Text>
                      </Box>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* 6. Why Trust Us */}
      <Box>
        <Heading as="h2" size="xl" fontWeight="bold" mb={4} color={textMain}>
          Why Trust Us
        </Heading>
        <SimpleGrid columns={{ base: 1, sm: 3 }} gap={4}>
          <TrustCard
            icon={<Code size={32} />}
            title="Open Source"
            description="All code is fully open-source and available on GitHub for anyone to review, audit, and verify."
            isDark={isDark}
          />
          <TrustCard
            icon={<FileCheck size={32} />}
            title="Audited Contracts"
            description="Smart contracts are audited and verifiable on-chain. Every transaction is transparent and traceable."
            isDark={isDark}
          />
          <TrustCard
            icon={<ShieldCheck size={32} />}
            title="Transparent Decisions"
            description="Every AI trade decision is recorded with full reasoning, so you can review agent logic at any time."
            isDark={isDark}
          />
        </SimpleGrid>
      </Box>
    </Flex>
  );
}
