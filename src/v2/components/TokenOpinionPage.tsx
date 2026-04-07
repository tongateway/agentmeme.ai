import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Flex,
  Text,
  Button,
  Badge,
  HStack,
  VStack,
  SimpleGrid,
  Spinner,
  Icon,
} from '@chakra-ui/react';
import {
  Bot,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  Clock,
} from 'lucide-react';
import {
  getTokenOpinionDetail,
  getRaceAiResponses,
  type AiResponse,
  type TokenOpinionSummary,
  type PublicApiConfig,
} from '@/lib/api';
import { PredictionMarket } from './PredictionMarket';
import { CandlestickChart } from './CandlestickChart';

type TokenOpinionPageProps = {
  raceCfg: PublicApiConfig;
  symbol: string;
  onBack: () => void;
};

/* ---------- Helpers ---------- */

function fmtPrice(n: number): string {
  if (n === 0) return '$0.00';
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

const TOKEN_DECIMALS: Record<string, number> = { USDT: 6, USDC: 6 };

function fmtNano(nano: string, token?: string): string {
  const decimals = TOKEN_DECIMALS[(token ?? '').toUpperCase()] ?? 9;
  const n = Number(nano) / 10 ** decimals;
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function fmtAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const TOKEN_COLOR_PALETTES: Record<string, string> = {
  TON: 'blue',
  AGNT: 'purple',
  NOT: 'cyan',
  BUILD: 'yellow',
  USDT: 'green',
};

const PAGE_SIZE = 20;

/* ---------- Main Component ---------- */

export function TokenOpinionPage({ raceCfg, symbol, onBack }: TokenOpinionPageProps) {
  const [stats, setStats] = useState<TokenOpinionSummary | null>(null);
  const [responses, setResponses] = useState<AiResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect dark mode
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

  const load = useCallback(
    async (off: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const [statsData, feedData] = await Promise.all([
          off === 0 ? getTokenOpinionDetail(raceCfg, symbol, { limit: 0 }) : null,
          getRaceAiResponses(raceCfg, {
            limit: PAGE_SIZE,
            offset: off,
            actions: ['create_order'],
            tokenSymbol: symbol,
          }),
        ]);
        if (statsData) setStats(statsData.stats);
        const sym = symbol.toUpperCase();
        const relevant = feedData.results.filter((r) => {
          const pp = r.parsed_params ?? {};
          return (
            (pp.to_token as string)?.toUpperCase() === sym ||
            (pp.from_token as string)?.toUpperCase() === sym
          );
        });
        setTotal(feedData.total);
        setResponses((prev) => (append ? [...prev, ...relevant] : relevant));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [raceCfg, symbol],
  );

  useEffect(() => {
    setOffset(0);
    void load(0, false);
  }, [load]);

  const handleLoadMore = () => {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    void load(next, true);
  };

  /* ---------- Theme values ---------- */
  const bgCard = isDark ? 'gray.900' : 'gray.100';
  const borderColor = isDark ? 'gray.800' : 'gray.200';
  const textMuted = isDark ? 'gray.400' : 'gray.500';
  const textMain = isDark ? 'white' : 'gray.900';

  /* ---------- Loading / Error states ---------- */
  if (loading) {
    return (
      <Flex justify="center" py={8} mt={4}>
        <Spinner size="lg" color="brand.500" />
      </Flex>
    );
  }

  if (error) {
    return (
      <Box mt={4}>
        <Box bg={bgCard} borderRadius="xl" border="1px solid" borderColor={borderColor} p={5}>
          <Flex direction="column" gap={3}>
            <Text fontSize="sm" color="red.400">
              {error}
            </Text>
            <Button
              size="sm"
              variant="ghost"
              onClick={onBack}
              alignSelf="flex-start"
              color={textMuted}
            >
              <Icon as={ArrowLeft} boxSize={4} mr={1} />
              Back
            </Button>
          </Flex>
        </Box>
      </Box>
    );
  }

  /* ---------- Derived values ---------- */
  const changePositive = (stats?.price_change_24h ?? 0) >= 0;
  const bullPct = stats?.bullish_pct ?? 0;
  const bearPct = stats?.bearish_pct ?? 0;
  const consensusUpper = (stats?.consensus ?? '').toUpperCase();
  const tokenPalette = TOKEN_COLOR_PALETTES[symbol] ?? 'brand';

  const chartFrom = 'TON';
  const chartTo = symbol === 'TON' ? 'USDT' : symbol;

  return (
    <Flex
      mt={4}
      direction={{ base: 'column', lg: 'row' }}
      gap={6}
      align={{ base: 'stretch', lg: 'flex-start' }}
    >
      {/* ==================== Left Sidebar ==================== */}
      <Box
        w={{ base: 'full', lg: '320px' }}
        flexShrink={0}
        position={{ base: 'static', lg: 'sticky' }}
        top={4}
        alignSelf={{ base: 'auto', lg: 'flex-start' }}
      >
        <VStack align="stretch" gap={4}>
          {/* Token header */}
          <HStack gap={3}>
            <Flex
              align="center"
              justify="center"
              borderRadius="full"
              w={10}
              h={10}
              bg={`${tokenPalette}.500`}
              color="white"
              fontSize="xs"
              fontWeight="bold"
              flexShrink={0}
            >
              {symbol.slice(0, 3)}
            </Flex>
            <Flex direction="column">
              <Text fontSize="lg" fontWeight="bold" lineHeight="tight" color={textMain}>
                {stats?.token_symbol}
              </Text>
              <Text fontSize="xs" opacity={0.5} color={textMuted}>
                {stats?.token_name}
              </Text>
            </Flex>
          </HStack>

          {/* Price */}
          <HStack gap={2} align="baseline">
            <Text
              fontSize="2xl"
              fontWeight="bold"
              fontFamily="mono"
              color={textMain}
            >
              {fmtPrice(stats?.price_usd ?? 0)}
            </Text>
            <HStack gap={1}>
              <Icon
                as={changePositive ? TrendingUp : TrendingDown}
                boxSize={3.5}
                color={changePositive ? 'green.400' : 'red.400'}
              />
              <Text
                fontSize="sm"
                fontWeight="bold"
                fontFamily="mono"
                color={changePositive ? 'green.400' : 'red.400'}
              >
                {changePositive ? '+' : ''}
                {(stats?.price_change_24h ?? 0).toFixed(1)}%
              </Text>
            </HStack>
          </HStack>

          {/* Sentiment bar */}
          <Flex direction="column" gap={2}>
            <Flex align="center" justify="space-between">
              <Text
                fontSize="11px"
                textTransform="uppercase"
                letterSpacing="wider"
                fontWeight="semibold"
                opacity={0.5}
                color={textMain}
              >
                Sentiment
              </Text>
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
                {consensusUpper || 'NEUTRAL'}
              </Badge>
            </Flex>
            <Box
              h={2.5}
              borderRadius="full"
              overflow="hidden"
              bg={isDark ? 'gray.700' : 'gray.300'}
            >
              <Flex h="full">
                {bullPct > 0 && (
                  <Box bg="green.500" style={{ width: `${bullPct}%` }} />
                )}
                {bearPct > 0 && (
                  <Box bg="red.500" style={{ width: `${bearPct}%` }} />
                )}
              </Flex>
            </Box>
            <Flex justify="space-between">
              <HStack gap={1} opacity={0.5}>
                <Icon as={TrendingUp} boxSize={3} color="green.400" />
                <Text fontSize="10px" color={textMuted}>
                  {bullPct.toFixed(0)}% Bullish
                </Text>
              </HStack>
              <HStack gap={1} opacity={0.5}>
                <Text fontSize="10px" color={textMuted}>
                  {bearPct.toFixed(0)}% Bearish
                </Text>
                <Icon as={TrendingDown} boxSize={3} color="red.400" />
              </HStack>
            </Flex>
          </Flex>

          {/* Active Agents stats */}
          <Flex direction="column" gap={2}>
            <Text
              fontSize="11px"
              textTransform="uppercase"
              letterSpacing="wider"
              fontWeight="semibold"
              opacity={0.5}
              color={textMain}
            >
              Active Agents
            </Text>
            <SimpleGrid columns={3} gap={2}>
              {/* Agents */}
              <Box
                bg={bgCard}
                borderRadius="xl"
                border="1px solid"
                borderColor={borderColor}
                p={3}
                textAlign="center"
              >
                <VStack gap={1}>
                  <Icon as={Users} boxSize={4} opacity={0.4} color={textMuted} />
                  <Text
                    fontFamily="mono"
                    fontSize="md"
                    fontWeight="bold"
                    color={textMain}
                  >
                    {stats?.active_agents ?? 0}
                  </Text>
                  <Text fontSize="10px" opacity={0.4} color={textMuted}>
                    Agents
                  </Text>
                </VStack>
              </Box>
              {/* Trades */}
              <Box
                bg={bgCard}
                borderRadius="xl"
                border="1px solid"
                borderColor={borderColor}
                p={3}
                textAlign="center"
              >
                <VStack gap={1}>
                  <Icon as={TrendingUp} boxSize={4} opacity={0.4} color={textMuted} />
                  <Text
                    fontFamily="mono"
                    fontSize="md"
                    fontWeight="bold"
                    color={textMain}
                  >
                    {(stats?.total_trades_24h ?? 0).toLocaleString()}
                  </Text>
                  <Text fontSize="10px" opacity={0.4} color={textMuted}>
                    Trades
                  </Text>
                </VStack>
              </Box>
              {/* Confidence */}
              <Box
                bg={bgCard}
                borderRadius="xl"
                border="1px solid"
                borderColor={borderColor}
                p={3}
                textAlign="center"
              >
                <VStack gap={1}>
                  <Icon as={Target} boxSize={4} opacity={0.4} color={textMuted} />
                  <Text
                    fontFamily="mono"
                    fontSize="md"
                    fontWeight="bold"
                    color={textMain}
                  >
                    {((stats?.avg_confidence ?? 0) * 100).toFixed(0)}%
                  </Text>
                  <Text fontSize="10px" opacity={0.4} color={textMuted}>
                    Confidence
                  </Text>
                </VStack>
              </Box>
            </SimpleGrid>
          </Flex>

          {/* Prediction Market */}
          {stats && <PredictionMarket raceCfg={raceCfg} stats={stats} />}

          {/* Back button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={onBack}
            alignSelf="flex-start"
            mt={2}
            color={textMuted}
          >
            <Icon as={ArrowLeft} boxSize={4} mr={1} />
            Back to Hub
          </Button>
        </VStack>
      </Box>

      {/* ==================== Right Column ==================== */}
      <Flex direction="column" gap={4} flex={1} minW={0}>
        {/* Candlestick Chart */}
        {stats && (
          <Box
            bg={bgCard}
            borderRadius="xl"
            border="1px solid"
            borderColor={borderColor}
            p={4}
            overflow="hidden"
          >
            <CandlestickChart raceCfg={raceCfg} fromSymbol={chartFrom} toSymbol={chartTo} />
          </Box>
        )}

        {/* Feed header */}
        <Flex align="center" justify="space-between">
          <Text fontSize="lg" fontWeight="bold" color={textMain}>
            Agent Trading Feed
          </Text>
          <HStack gap={1.5}>
            <Box
              w={1.5}
              h={1.5}
              borderRadius="full"
              bg="green.500"
              style={{ animation: 'pulse 2s infinite' }}
            />
            <Text fontSize="xs" opacity={0.5} color={textMuted}>
              Live updates
            </Text>
          </HStack>
        </Flex>

        {/* Feed items */}
        {responses.length === 0 ? (
          <Box
            bg={bgCard}
            borderRadius="xl"
            border="1px solid"
            borderColor={borderColor}
            p={4}
          >
            <Text fontSize="sm" opacity={0.6} color={textMuted}>
              No trade activity on this token yet.
            </Text>
          </Box>
        ) : (
          <Flex direction="column" gap={3}>
            {responses.map((r) => {
              const pp = r.parsed_params ?? {};
              const fromToken = pp.from_token as string | undefined;
              const toToken = pp.to_token as string | undefined;
              const amount = pp.amount as string | undefined;
              const shortReason = pp.short_reason as string | undefined;
              const humanOpinion = pp.human_opinion as string | undefined;
              const reasoning = pp.reasoning as string | undefined;
              const isBuy = toToken?.toUpperCase() === symbol;
              const actionLabel = isBuy ? 'BUY' : 'SELL';
              const borderLeft = isBuy ? 'green.500' : 'red.500';
              const iconBg = isBuy
                ? isDark
                  ? 'green.900'
                  : 'green.100'
                : isDark
                ? 'red.900'
                : 'red.100';
              const iconColor = isBuy ? 'green.400' : 'red.400';

              return (
                <Box
                  key={r.id}
                  bg={bgCard}
                  borderRadius="xl"
                  border="1px solid"
                  borderColor={borderColor}
                  borderLeft="4px solid"
                  borderLeftColor={borderLeft}
                  p={4}
                >
                  <Flex direction="column" gap={3}>
                    {/* Header: agent + action + time */}
                    <Flex align="flex-start" justify="space-between" gap={2}>
                      <HStack gap={3}>
                        <Flex
                          align="center"
                          justify="center"
                          borderRadius="lg"
                          w={9}
                          h={9}
                          bg={iconBg}
                          color={iconColor}
                          flexShrink={0}
                        >
                          <Icon as={Bot} boxSize={4} />
                        </Flex>
                        <Flex direction="column">
                          <Text fontSize="sm" fontWeight="semibold" color={textMain}>
                            {r.contract_name || fmtAddr(r.smart_contract_id)}
                          </Text>
                          <HStack gap={1} opacity={0.4}>
                            <Icon as={Clock} boxSize={3} color={textMuted} />
                            <Text fontSize="11px" color={textMuted}>
                              {timeAgo(r.created_at)}
                            </Text>
                          </HStack>
                        </Flex>
                      </HStack>
                      <Badge
                        size="sm"
                        colorPalette={isBuy ? 'green' : 'red'}
                        variant="solid"
                        flexShrink={0}
                      >
                        {actionLabel}
                      </Badge>
                    </Flex>

                    {/* Short reason */}
                    {shortReason && (
                      <Text fontSize="sm" fontWeight="semibold" lineHeight="snug" color={textMain}>
                        {shortReason}
                      </Text>
                    )}

                    {/* Human opinion / reasoning */}
                    {(humanOpinion || reasoning) && (
                      <Text
                        fontSize="xs"
                        lineHeight="relaxed"
                        opacity={0.6}
                        color={isDark ? 'gray.300' : 'gray.600'}
                      >
                        {humanOpinion || reasoning}
                      </Text>
                    )}

                    {/* Action details */}
                    {(fromToken || toToken) && (
                      <Box>
                        <Text
                          fontSize="10px"
                          opacity={0.35}
                          fontFamily="mono"
                          color={textMuted}
                        >
                          {fromToken} &rarr; {toToken}
                          {amount && amount !== '0'
                            ? ` (${fmtNano(amount, fromToken)} ${fromToken})`
                            : ''}
                        </Text>
                      </Box>
                    )}
                  </Flex>
                </Box>
              );
            })}
          </Flex>
        )}

        {/* Load more */}
        {responses.length < total && (
          <Button
            size="sm"
            variant="ghost"
            alignSelf="center"
            onClick={handleLoadMore}
            disabled={loadingMore}
            color={textMuted}
          >
            {loadingMore ? <Spinner size="xs" /> : 'Load more'}
          </Button>
        )}
      </Flex>
    </Flex>
  );
}
