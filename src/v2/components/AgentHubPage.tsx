import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Flex,
  Heading,
  Text,
  Button,
  HStack,
  VStack,
  Spinner,
  Badge,
  Icon,
  SimpleGrid,
} from '@chakra-ui/react';
import { TrendingUp, TrendingDown, Trophy, ChevronRight, Rocket, Star } from 'lucide-react';
import {
  getTokenOpinions,
  getRaceLeaderboard,
  type TokenOpinionSummary,
  type LeaderboardEntry,
  type PublicApiConfig,
} from '@/lib/api';

/* ---------- Types ---------- */

type AgentHubPageProps = {
  raceCfg: PublicApiConfig;
  onSelectToken: (symbol: string) => void;
  onDeploy?: () => void;
  onViewLeaderboard?: () => void;
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/* ---------- TrendingTokens sub-component ---------- */

function TrendingTokensRow({
  tokens,
  onSelectToken,
  isDark,
}: {
  tokens: TokenOpinionSummary[];
  onSelectToken: (symbol: string) => void;
  isDark: boolean;
}) {
  const trades = tokens.map((t) => t.total_trades_24h || 0);
  const med = median(trades);
  const threshold = Math.max(med * 2, 10);

  const trending = tokens
    .filter((t) => (t.total_trades_24h || 0) > threshold)
    .map((t) => ({ ...t, ratio: med > 0 ? (t.total_trades_24h || 0) / med : 0 }))
    .sort((a, b) => b.ratio - a.ratio);

  if (trending.length === 0) return null;

  return (
    <HStack gap={2} overflowX="auto" py={1} flexWrap="nowrap">
      <Icon as={TrendingUp} boxSize={3.5} opacity={0.4} flexShrink={0} color={isDark ? 'white' : 'gray.700'} />
      <Text
        fontSize="10px"
        textTransform="uppercase"
        letterSpacing="wider"
        opacity={0.4}
        flexShrink={0}
        color={isDark ? 'white' : 'gray.700'}
      >
        Trending
      </Text>
      {trending.map((t) => (
        <Badge
          key={t.token_symbol}
          size="sm"
          colorPalette={t.ratio > 3 ? 'green' : 'yellow'}
          variant="solid"
          cursor="pointer"
          flexShrink={0}
          onClick={() => onSelectToken(t.token_symbol)}
          _hover={{ opacity: 0.8 }}
        >
          {t.token_symbol} {t.ratio.toFixed(1)}x
        </Badge>
      ))}
    </HStack>
  );
}

/* ---------- AgentSpotlight sub-component ---------- */

function AgentSpotlightCard({
  leaderboard,
  isDark,
}: {
  leaderboard: LeaderboardEntry[];
  isDark: boolean;
}) {
  const [mode, setMode] = useState<'day' | 'week'>('day');

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const eligible =
    mode === 'week'
      ? leaderboard.filter((e) => new Date(e.created_at).getTime() < sevenDaysAgo)
      : leaderboard;

  const sorted = [...eligible].sort(
    (a, b) => (b.profit_pct ?? -Infinity) - (a.profit_pct ?? -Infinity),
  );
  const top = sorted[0];

  const bgCard = isDark ? 'gray.900' : 'gray.100';
  const borderColor = isDark ? 'yellow.800' : 'yellow.300';
  const textMain = isDark ? 'white' : 'gray.900';
  const textMuted = isDark ? 'gray.400' : 'gray.500';

  if (!top) return null;

  const profitPct = top.profit_pct ?? 0;
  const shortModel = top.ai_model.includes('/')
    ? top.ai_model.split('/').pop() ?? top.ai_model
    : top.ai_model;

  return (
    <Box
      bg={bgCard}
      borderRadius="xl"
      border="1px solid"
      borderColor={borderColor}
      p={4}
      h="full"
    >
      <VStack align="stretch" gap={3} h="full">
        <Flex align="center" justify="space-between" gap={2}>
          <HStack gap={1.5}>
            <Icon as={Trophy} boxSize={4} color="yellow.400" />
            <Text
              fontSize="11px"
              textTransform="uppercase"
              letterSpacing="wider"
              fontWeight="bold"
              color="yellow.400"
            >
              Agent of the {mode === 'day' ? 'Day' : 'Week'}
            </Text>
          </HStack>
          <HStack gap={0.5}>
            <Button
              size="xs"
              variant={mode === 'day' ? 'solid' : 'ghost'}
              colorPalette={mode === 'day' ? 'gray' : undefined}
              onClick={() => setMode('day')}
            >
              Day
            </Button>
            <Button
              size="xs"
              variant={mode === 'week' ? 'solid' : 'ghost'}
              colorPalette={mode === 'week' ? 'gray' : undefined}
              onClick={() => setMode('week')}
            >
              Week
            </Button>
          </HStack>
        </Flex>

        <HStack gap={3}>
          <Flex
            align="center"
            justify="center"
            borderRadius="full"
            w={10}
            h={10}
            bg={isDark ? 'yellow.900' : 'yellow.100'}
            flexShrink={0}
          >
            <Icon as={Star} boxSize={5} color="yellow.400" />
          </Flex>
          <Box minW={0}>
            <Text fontSize="base" fontWeight="bold" fontFamily="mono" truncate color={textMain}>
              {top.name || fmtAddr(top.address)}
            </Text>
            <Text fontSize="xs" opacity={0.5} color={textMuted}>
              {shortModel}
            </Text>
          </Box>
        </HStack>

        <Box>
          <Text
            fontSize="3xl"
            fontWeight="bold"
            fontFamily="mono"
            color={profitPct >= 0 ? 'green.400' : 'red.400'}
          >
            {profitPct >= 0 ? '+' : ''}
            {profitPct.toFixed(1)}%
          </Text>
          <Text fontSize="xs" opacity={0.4} mt={0.5} color={textMuted}>
            P&L {mode === 'day' ? 'today' : 'this week'}
          </Text>
        </Box>
      </VStack>
    </Box>
  );
}

/* ---------- Main AgentHubPage ---------- */

export function AgentHubPage({
  raceCfg,
  onSelectToken,
  onDeploy,
  onViewLeaderboard,
}: AgentHubPageProps) {
  const [tokens, setTokens] = useState<TokenOpinionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Detect color mode from data-theme attribute
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') !== 'light',
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') !== 'light');
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, lb] = await Promise.all([
        getTokenOpinions(raceCfg),
        getRaceLeaderboard(raceCfg).catch(() => [] as LeaderboardEntry[]),
      ]);
      const sorted = (Array.isArray(data) ? data : []).sort(
        (a, b) => (b.total_trades_24h || 0) - (a.total_trades_24h || 0),
      );
      setTokens(sorted);
      setLeaderboard(lb);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [raceCfg]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------- Computed values ---------- */
  const maxAgents = Math.max(0, ...tokens.map((x) => x.active_agents));
  const maxTrades = Math.max(0, ...tokens.map((x) => x.total_trades_24h || 0));

  // Top 3 leaderboard entries
  const top3 = [...leaderboard]
    .sort((a, b) => (b.profit_pct ?? -Infinity) - (a.profit_pct ?? -Infinity))
    .slice(0, 3);

  /* ---------- Theme values ---------- */
  const bgCard = isDark ? 'gray.900' : 'gray.100';
  const borderColor = isDark ? 'gray.800' : 'gray.200';
  const textMain = isDark ? 'white' : 'gray.900';
  const textMuted = isDark ? 'gray.400' : 'gray.500';

  /* ---------- Medal colors for rank badges ---------- */
  function rankBadgeColors(rank: number): { bg: string; color: string } {
    if (rank === 0) return { bg: isDark ? 'yellow.800' : 'yellow.200', color: 'yellow.400' };
    if (rank === 1) return { bg: isDark ? 'gray.700' : 'gray.300', color: isDark ? 'gray.300' : 'gray.600' };
    return { bg: isDark ? 'gray.800' : 'gray.200', color: isDark ? 'gray.500' : 'gray.500' };
  }

  return (
    <Flex direction="column" gap={4} mt={4}>

      {/* 1. Trending Tokens Row */}
      {!loading && tokens.length > 0 && (
        <Box
          bg={bgCard}
          borderRadius="xl"
          border="1px solid"
          borderColor={borderColor}
          px={4}
          py={3}
        >
          <TrendingTokensRow tokens={tokens} onSelectToken={onSelectToken} isDark={isDark} />
        </Box>
      )}

      {/* 2. Agent Spotlight Row */}
      {!loading && (leaderboard.length > 0 || tokens.length > 0) && (
        <SimpleGrid columns={{ base: 1, lg: 5 }} gap={3}>
          {/* Agent of the Day — 2 cols */}
          <Box gridColumn={{ lg: 'span 2' }}>
            <AgentSpotlightCard leaderboard={leaderboard} isDark={isDark} />
          </Box>

          {/* Top Performing Agents — 3 cols */}
          {top3.length > 0 && (
            <Box
              gridColumn={{ lg: 'span 3' }}
              bg={bgCard}
              borderRadius="xl"
              border="1px solid"
              borderColor={borderColor}
              p={4}
            >
              <VStack align="stretch" gap={3}>
                <Flex align="center" justify="space-between">
                  <HStack gap={1.5}>
                    <Icon as={Trophy} boxSize={4} color="yellow.400" />
                    <Text fontSize="sm" fontWeight="bold" color={textMain}>
                      Top Performing Agents
                    </Text>
                  </HStack>
                  <Button
                    variant="ghost"
                    size="xs"
                    opacity={0.4}
                    color={textMuted}
                    _hover={{ opacity: 0.8 }}
                    onClick={onViewLeaderboard}
                  >
                    View all
                    <Icon as={ChevronRight} boxSize={3.5} ml={0.5} />
                  </Button>
                </Flex>

                <SimpleGrid columns={{ base: 1, sm: 3 }} gap={2}>
                  {top3.map((entry, idx) => {
                    const profitPct = entry.profit_pct ?? 0;
                    const badgeColors = rankBadgeColors(idx);
                    const shortModel = entry.ai_model.includes('/')
                      ? entry.ai_model.split('/').pop() ?? entry.ai_model
                      : entry.ai_model;

                    return (
                      <Box
                        key={entry.address}
                        bg={isDark ? 'gray.800' : 'gray.50'}
                        borderRadius="lg"
                        border="1px solid"
                        borderColor={isDark ? 'gray.700' : 'gray.200'}
                        p={3}
                      >
                        <VStack align="stretch" gap={2}>
                          <HStack gap={2}>
                            <Flex
                              align="center"
                              justify="center"
                              borderRadius="full"
                              w={6}
                              h={6}
                              bg={badgeColors.bg}
                              flexShrink={0}
                            >
                              <Text
                                fontSize="10px"
                                fontWeight="bold"
                                color={badgeColors.color}
                              >
                                #{idx + 1}
                              </Text>
                            </Flex>
                            <Box minW={0}>
                              <Text
                                fontSize="sm"
                                fontWeight="bold"
                                fontFamily="mono"
                                truncate
                                color={textMain}
                              >
                                {entry.name || fmtAddr(entry.address)}
                              </Text>
                              <Text fontSize="11px" opacity={0.4} truncate color={textMuted}>
                                {shortModel}
                              </Text>
                            </Box>
                          </HStack>

                          <Text
                            fontSize="lg"
                            fontWeight="bold"
                            fontFamily="mono"
                            color={profitPct >= 0 ? 'green.400' : 'red.400'}
                          >
                            {profitPct >= 0 ? '+' : ''}
                            {profitPct.toFixed(1)}%
                          </Text>

                          <Text fontSize="11px" opacity={0.4} color={textMuted}>
                            {entry.completed_orders ?? 0} trades
                          </Text>
                        </VStack>
                      </Box>
                    );
                  })}
                </SimpleGrid>
              </VStack>
            </Box>
          )}
        </SimpleGrid>
      )}

      {/* 3. "Agent Coin Hub" heading + Deploy Agent button */}
      <Flex align="center" justify="space-between" gap={3}>
        <Heading as="h2" size="xl" fontWeight="bold" color={textMain}>
          Agent Coin Hub
        </Heading>
        {onDeploy && (
          <Button
            colorPalette="green"
            variant="solid"
            size="lg"
            fontWeight="semibold"
            flexShrink={0}
            onClick={onDeploy}
          >
            <Icon as={Rocket} boxSize={4} mr={2} />
            Deploy Agent
          </Button>
        )}
      </Flex>

      {/* 4. Token Table */}
      <Box
        bg={bgCard}
        borderRadius="xl"
        border="1px solid"
        borderColor={borderColor}
        overflowX="auto"
      >
        {error ? (
          <Box p={5}>
            <Text fontSize="sm" color="red.400">
              {error}
            </Text>
          </Box>
        ) : loading ? (
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
                {['#', 'Token', 'Price', '24h', 'AI Consensus', 'Signal', 'Trades 24h'].map(
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
                      textAlign={ci === 0 || ci === 1 ? 'left' : 'right'}
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
                        <Text
                          fontSize="xs"
                          fontWeight="bold"
                          fontFamily="mono"
                          color={textMain}
                        >
                          {t.token_symbol}
                        </Text>
                        <Text
                          fontSize="10px"
                          opacity={0.35}
                          color={textMuted}
                          truncate
                          maxW="8rem"
                        >
                          {t.token_name}
                        </Text>
                      </HStack>
                    </Box>

                    {/* Price */}
                    <Box as="td" px={4} py={3} textAlign="right">
                      <Text
                        fontSize="xs"
                        fontFamily="mono"
                        fontWeight="medium"
                        color={textMain}
                      >
                        {fmtPrice(priceUsd)}
                      </Text>
                    </Box>

                    {/* 24h */}
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
    </Flex>
  );
}
