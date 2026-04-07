import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Flex,
  Heading,
  Text,
  Button,
  SimpleGrid,
  HStack,
  Spinner,
  Badge,
  Icon,
} from '@chakra-ui/react';
import { BarChart3, ArrowDownUp, TrendingUp, ArrowUp, ArrowDown } from 'lucide-react';
import {
  getDexCoinPrice,
  getDexOrderBook,
  getOrderScannerStats,
  type DexOrderBookResponse,
  type PublicApiConfig,
  type ScannerStatsResponse,
  type ScannerStatsWindow,
} from '@/lib/api';

const AUTO_REFRESH_MS = 10_000;

/* ---------- pair definitions ---------- */

type TradingPair = {
  slug: string;
  label: string;
  fromSymbol: string;
  toSymbol: string;
  baseVault: string;
  quoteVault: string;
};

const DEFAULT_PAIRS: TradingPair[] = [
  {
    slug: 'AGNT-USDT',
    label: 'AGNT / USDT',
    fromSymbol: 'AGNT',
    toSymbol: 'USDT',
    baseVault: 'EQCfzBzukuhvyXvKwFXq9nffu_YRngAJugAuR5ibQ7Arcl1w',
    quoteVault: 'EQBrozHGTEwumr5ND62CpUXqmfYyi1UucbIj-15ZJnlFLe9U',
  },
  {
    slug: 'USDT-BUILD',
    label: 'USDT / BUILD',
    fromSymbol: 'USDT',
    toSymbol: 'BUILD',
    baseVault: 'EQCxWoj_Yxgeh-sRS1MjR7YuqzVLHrOpVFz9neN-Hn1eSYUC',
    quoteVault: 'EQBrozHGTEwumr5ND62CpUXqmfYyi1UucbIj-15ZJnlFLe9U',
  },
];

/* ---------- helpers ---------- */

function fmtRate(n: number): string {
  if (n === 0) return '0';
  if (n >= 1_000_000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.0001) return n.toFixed(6);
  if (n >= 0.0000001) return n.toFixed(9);
  return n.toFixed(12);
}

function fmtAmount(n: number): string {
  if (n === 0) return '0';
  if (n < 0.000001) return '<0.000001';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(2)}`;
  if (n >= 0.0001) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

/* ---------- normalized level ---------- */

type NormalizedLevel = {
  price: number;
  amount: number;
  orderCount: number;
};

type NormalizedBook = {
  asks: NormalizedLevel[];
  bids: NormalizedLevel[];
  inverted: boolean;
};

function normalizeOpen4DevBook(book: DexOrderBookResponse): NormalizedBook {
  const ref = book.mid_price ?? null;
  const decAdj = 10 ** ((book.to_decimals ?? 9) - (book.from_decimals ?? 9));
  const toDisplayPrice = (priceRate: number): number => {
    if (priceRate > 1) return (1 / priceRate) * decAdj;
    return priceRate * decAdj;
  };
  const shouldInvert = ref != null ? ref > 1 : true;

  const asks: NormalizedLevel[] = book.asks
    .filter((a) => a.price_rate > 0)
    .map((a) => ({
      price: toDisplayPrice(a.price_rate),
      amount: a.total_amount,
      orderCount: a.order_count,
    }));

  const bids: NormalizedLevel[] = book.bids
    .filter((b) => b.price_rate > 0)
    .map((b) => ({
      price: toDisplayPrice(b.price_rate),
      amount: b.total_amount,
      orderCount: b.order_count,
    }));

  asks.sort((a, b) => a.price - b.price);
  bids.sort((a, b) => b.price - a.price);

  return { asks, bids, inverted: shouldInvert };
}

/* ---------- book stats ---------- */

type BookStats = {
  totalAskOrders: number;
  totalBidOrders: number;
  totalAskAmount: number;
  totalBidAmount: number;
  bestAsk: number | null;
  bestBid: number | null;
  spread: number | null;
  spreadPct: number | null;
};

function computeBookStats(normalized: NormalizedBook): BookStats {
  const totalAskOrders = normalized.asks.reduce((s, a) => s + a.orderCount, 0);
  const totalBidOrders = normalized.bids.reduce((s, b) => s + b.orderCount, 0);
  const totalAskAmount = normalized.asks.reduce((s, a) => s + a.amount, 0);
  const totalBidAmount = normalized.bids.reduce((s, b) => s + b.amount, 0);
  const bestAsk = normalized.asks.length > 0 ? normalized.asks[0].price : null;
  const bestBid = normalized.bids.length > 0 ? normalized.bids[0].price : null;
  const spread = bestAsk != null && bestBid != null ? bestAsk - bestBid : null;
  const spreadPct =
    spread != null && bestBid != null && bestBid > 0
      ? (spread / (((bestAsk as number) + bestBid) / 2)) * 100
      : null;
  return {
    totalAskOrders,
    totalBidOrders,
    totalAskAmount,
    totalBidAmount,
    bestAsk,
    bestBid,
    spread,
    spreadPct,
  };
}

/* ---------- ActivityWindow sub-component ---------- */

function ActivityWindow({
  label,
  data,
  highlight,
  volumeUsdOverride,
  isDark,
}: {
  label: string;
  data: ScannerStatsWindow;
  highlight?: boolean;
  volumeUsdOverride?: number | null;
  isDark: boolean;
}) {
  const rawVolume =
    volumeUsdOverride ??
    Number(String(data.volume_usd ?? '0').replaceAll(',', '').trim());
  const volume =
    Number.isFinite(rawVolume) && rawVolume > 0 && rawVolume < 1_000_000_000 ? rawVolume : 0;
  const volumeText = volume > 0 ? fmtUsd(volume) : '$0.00';

  const bgBox = isDark
    ? highlight ? 'gray.800' : 'gray.850'
    : highlight ? 'gray.100' : 'gray.50';
  const borderColor = isDark ? 'gray.700' : 'gray.200';
  const textMuted = isDark ? 'gray.500' : 'gray.400';

  return (
    <Box
      bg={bgBox}
      borderRadius="lg"
      border="1px solid"
      borderColor={borderColor}
      px={3}
      py={2.5}
      position="relative"
      overflow="hidden"
    >
      <Flex align="center" justify="space-between" mb={2}>
        <Badge variant="outline" size="sm">{label}</Badge>
        <Icon as={TrendingUp} boxSize={3.5} opacity={0.3} />
      </Flex>
      <SimpleGrid columns={3} gap={2}>
        <Box>
          <Text fontSize="9px" textTransform="uppercase" letterSpacing="wider" color={textMuted}>
            Open
          </Text>
          <Text fontSize="sm" fontWeight="semibold" fontFamily="mono" color="blue.400">
            {data.open_orders.toLocaleString()}
          </Text>
        </Box>
        <Box>
          <Text fontSize="9px" textTransform="uppercase" letterSpacing="wider" color={textMuted}>
            Filled
          </Text>
          <Text fontSize="sm" fontWeight="semibold" fontFamily="mono" color="green.400">
            {data.completed_orders.toLocaleString()}
          </Text>
        </Box>
        <Box>
          <Text fontSize="9px" textTransform="uppercase" letterSpacing="wider" color={textMuted}>
            Volume
          </Text>
          <Text fontSize="sm" fontWeight="semibold" fontFamily="mono" opacity={0.75}>
            {volumeText}
          </Text>
        </Box>
      </SimpleGrid>
    </Box>
  );
}

/* ---------- PairActivityRow ---------- */

function PairActivityRow({
  stats,
  fromSymbol,
  toSymbol,
  isDark,
}: {
  stats: ScannerStatsResponse;
  fromSymbol: string;
  toSymbol: string;
  isDark: boolean;
}) {
  const borderColor = isDark ? 'gray.700' : 'gray.200';
  const bgRow = isDark ? 'gray.900' : 'gray.50';
  const textMuted = isDark ? 'gray.500' : 'gray.400';

  return (
    <Box
      borderRadius="xl"
      border="1px solid"
      borderColor={borderColor}
      bg={bgRow}
      p={3}
    >
      <Flex align="center" justify="space-between" mb={2.5}>
        <HStack gap={2}>
          <Box w={1} h="14px" borderRadius="full" bg="blue.400" opacity={0.6} />
          <Text fontSize="11px" fontWeight="bold" letterSpacing="tight" color={textMuted}>
            {fromSymbol}/{toSymbol} Order Stats
          </Text>
        </HStack>
        <Box w={2} h={2} borderRadius="full" bg="green.400" opacity={0.5} />
      </Flex>
      <SimpleGrid columns={3} gap={2}>
        <ActivityWindow label="1H" data={stats.windows['1h']} isDark={isDark} />
        <ActivityWindow label="24H" data={stats.windows['24h']} isDark={isDark} />
        <ActivityWindow label="MAX" data={stats.windows.all_time} highlight isDark={isDark} />
      </SimpleGrid>
    </Box>
  );
}

/* ---------- Spread Bar ---------- */

function SpreadBar({
  stats,
  fromUpper,
  toUpper,
  isDark,
}: {
  stats: BookStats;
  fromUpper: string;
  toUpper: string;
  isDark: boolean;
}) {
  const bgCard = isDark ? 'gray.900' : 'gray.100';
  const borderColor = isDark ? 'gray.700' : 'gray.200';
  const textMuted = isDark ? 'gray.500' : 'gray.400';

  return (
    <Box bg={bgCard} borderRadius="xl" border="1px solid" borderColor={borderColor} px={3} py={2}>
      <Flex align="center" justify="center" gap={6} flexWrap="wrap">
        <Text fontSize="xs" fontFamily="mono" color={textMuted}>
          {fromUpper} / {toUpper}
        </Text>
        {stats.bestBid != null && (
          <Box textAlign="center">
            <Text fontSize="10px" color={textMuted}>Best Bid</Text>
            <Text fontSize="sm" fontWeight="bold" fontFamily="mono" color="green.400">
              {fmtRate(stats.bestBid)}
            </Text>
          </Box>
        )}
        {stats.spreadPct != null && (
          <Box textAlign="center">
            <Text fontSize="10px" color={textMuted}>Spread</Text>
            <Text
              fontSize="xs"
              fontWeight="bold"
              fontFamily="mono"
              color={stats.spreadPct < 0 ? 'orange.400' : undefined}
            >
              {stats.spreadPct < 0 ? 'Crossed' : `${stats.spreadPct.toFixed(2)}%`}
            </Text>
          </Box>
        )}
        {stats.bestAsk != null && (
          <Box textAlign="center">
            <Text fontSize="10px" color={textMuted}>Best Ask</Text>
            <Text fontSize="sm" fontWeight="bold" fontFamily="mono" color="red.400">
              {fmtRate(stats.bestAsk)}
            </Text>
          </Box>
        )}
      </Flex>
    </Box>
  );
}

/* ---------- OrderBookSide (single side table) ---------- */

function OrderBookSide({
  side,
  levels,
  maxAmount,
  priceLabel,
  amountLabel,
  totalLabel,
  refreshTick,
  priceUsd,
  isDark,
  inverted,
}: {
  side: 'bid' | 'ask';
  levels: NormalizedLevel[];
  maxAmount: number;
  priceLabel: string;
  amountLabel: string;
  totalLabel: string;
  refreshTick: number;
  priceUsd: number | null;
  isDark: boolean;
  inverted: boolean;
}) {
  const isBid = side === 'bid';
  const accent = isBid ? 'green' : 'red';
  const accentColor = isBid ? 'green.400' : 'red.400';
  const bgCard = isDark ? 'gray.900' : 'gray.100';
  const borderColor = isDark ? 'gray.700' : 'gray.200';
  const borderHeader = isDark ? 'gray.750' : 'gray.200';
  const textMuted = isDark ? 'gray.500' : 'gray.400';

  // Display levels: asks shown in reverse (lowest ask at top after reversal)
  const displayLevels = isBid ? levels : [...levels].reverse();

  return (
    <Box bg={bgCard} borderRadius="xl" border="1px solid" borderColor={borderColor} overflow="hidden">
      {/* Header */}
      <Flex
        align="center"
        justify="space-between"
        px={3}
        py={2}
        borderBottom="1px solid"
        borderColor={borderHeader}
      >
        <HStack gap={1.5}>
          <Icon as={isBid ? ArrowUp : ArrowDown} boxSize={3.5} color={accentColor} />
          <Text fontSize="sm" fontWeight="bold">{isBid ? 'Bids' : 'Asks'}</Text>
          <Text fontSize="xs" color={textMuted}>({levels.length})</Text>
        </HStack>
        <Text fontSize="10px" color={accentColor} opacity={0.6}>
          {isBid ? 'Buy orders' : 'Sell orders'}
        </Text>
      </Flex>

      {/* Column headers */}
      <Flex
        align="center"
        px={3}
        py={1.5}
        gap={2}
        fontSize="10px"
        textTransform="uppercase"
        letterSpacing="wider"
        color={textMuted}
        borderBottom="1px solid"
        borderColor={borderHeader}
      >
        <Box w="28" textAlign="right">Price ({priceLabel})</Box>
        <Box flex={1} textAlign="right">Amount ({amountLabel})</Box>
        <Box w="24" textAlign="right" display={{ base: 'none', sm: 'block' }}>
          Total ({totalLabel})
        </Box>
        <Box w="16" textAlign="right" display={{ base: 'none', sm: 'block' }}>USD</Box>
        <Box w="8" textAlign="right">Qty</Box>
      </Flex>

      {/* Rows */}
      {displayLevels.length === 0 ? (
        <Box textAlign="center" py={4} fontSize="xs" color={textMuted}>
          No {isBid ? 'bids' : 'asks'}
        </Box>
      ) : (
        <Box>
          {displayLevels.map((lvl, i) => {
            const pct = maxAmount > 0 ? (lvl.amount / maxAmount) * 100 : 0;
            const usdVal = priceUsd != null ? lvl.amount * priceUsd : null;
            const crossTotal = isBid
              ? (inverted ? lvl.amount * lvl.price : lvl.price > 0 ? lvl.amount / lvl.price : 0)
              : (inverted ? (lvl.price > 0 ? lvl.amount / lvl.price : 0) : lvl.amount * lvl.price);

            return (
              <Box
                key={`${side}-${i}-${refreshTick}`}
                position="relative"
                px={3}
                py={1}
              >
                {/* Background bar */}
                <Box
                  position="absolute"
                  insetY={0}
                  right={0}
                  bg={`${accent}.900`}
                  opacity={isDark ? 0.35 : 0.1}
                  style={{ width: `${Math.min(100, pct)}%` }}
                  transition="width 0.7s ease-out"
                />
                <Flex align="center" gap={2} fontSize="xs" fontFamily="mono" position="relative" zIndex={1}>
                  <Box w="28" textAlign="right" color={accentColor} fontWeight="medium">
                    {fmtRate(lvl.price)}
                  </Box>
                  <Box flex={1} textAlign="right">
                    {fmtAmount(lvl.amount)}
                  </Box>
                  <Box w="24" textAlign="right" color={textMuted} display={{ base: 'none', sm: 'block' }}>
                    {fmtAmount(crossTotal)}
                  </Box>
                  <Box w="16" textAlign="right" color={textMuted} fontSize="10px" display={{ base: 'none', sm: 'block' }}>
                    {usdVal != null ? fmtUsd(usdVal) : '\u2014'}
                  </Box>
                  <Box w="8" textAlign="right" color={textMuted}>
                    {lvl.orderCount}
                  </Box>
                </Flex>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

/* ---------- main StatsPage ---------- */

type StatsPageProps = {
  raceCfg: PublicApiConfig;
  pairSlug?: string | null;
  onPairChange?: (slug: string) => void;
  isDark?: boolean;
};

export function StatsPage({ raceCfg: _raceCfg, pairSlug, onPairChange, isDark = true }: StatsPageProps) {
  const [selectedPairIdx, setSelectedPairIdx] = useState(() => {
    if (!pairSlug) return 0;
    const upper = pairSlug.toUpperCase();
    const idx = DEFAULT_PAIRS.findIndex((p) => p.slug === upper);
    return idx >= 0 ? idx : 0;
  });
  const [reversed, setReversed] = useState(false);
  const [tokenPrices, setTokenPrices] = useState<Map<string, number>>(new Map());

  const [book, setBook] = useState<DexOrderBookResponse | null>(null);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [pairStats, setPairStats] = useState<ScannerStatsResponse | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const pairs = DEFAULT_PAIRS;
  const currentPair = pairs[selectedPairIdx] ?? pairs[0];

  const effectivePair = useMemo(() => {
    if (!reversed) return currentPair;
    return {
      ...currentPair,
      label: `${currentPair.toSymbol} / ${currentPair.fromSymbol}`,
      fromSymbol: currentPair.toSymbol,
      toSymbol: currentPair.fromSymbol,
      baseVault: currentPair.quoteVault,
      quoteVault: currentPair.baseVault,
    };
  }, [currentPair, reversed]);

  // Fetch order book
  const fetchBook = useCallback(
    async (silent = false) => {
      if (!silent) {
        setBookLoading(true);
        setBookError(null);
      }
      try {
        const data = await getDexOrderBook({
          fromSymbol: effectivePair.fromSymbol,
          toSymbol: effectivePair.toSymbol,
          limit: 15,
        });
        setBook(data);
        setRefreshTick((t) => t + 1);
      } catch (e) {
        if (!silent) setBookError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!silent) setBookLoading(false);
      }
    },
    [effectivePair.fromSymbol, effectivePair.toSymbol],
  );

  // Fetch pair stats
  const fetchPairStats = useCallback(async () => {
    const { baseVault, quoteVault } = effectivePair;
    if (!baseVault || !quoteVault) {
      setPairStats(null);
      return;
    }
    try {
      const data = await getOrderScannerStats({ baseVault, quoteVault });
      setPairStats(data);
    } catch {
      setPairStats(null);
    }
  }, [effectivePair]);

  // Fetch token prices
  useEffect(() => {
    let cancelled = false;
    const symbols = [effectivePair.fromSymbol, effectivePair.toSymbol];
    (async () => {
      try {
        const results = await Promise.all(symbols.map((s) => getDexCoinPrice(s)));
        if (cancelled) return;
        const map = new Map<string, number>(tokenPrices);
        for (let i = 0; i < symbols.length; i++) {
          const p = results[i]?.priceUsd;
          if (p != null && p > 0) map.set(symbols[i].toUpperCase(), p);
        }
        setTokenPrices(map);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePair.fromSymbol, effectivePair.toSymbol]);

  // Polling intervals
  useEffect(() => {
    void fetchBook();
    const id = setInterval(() => void fetchBook(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchBook]);

  useEffect(() => {
    void fetchPairStats();
    const id = setInterval(() => void fetchPairStats(), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchPairStats]);

  const priceOf = useCallback(
    (sym: string): number | null => {
      const upper = sym.toUpperCase();
      return tokenPrices.get(upper) ?? null;
    },
    [tokenPrices],
  );

  const normalized = useMemo(() => (book ? normalizeOpen4DevBook(book) : null), [book]);
  const stats = useMemo(() => (normalized ? computeBookStats(normalized) : null), [normalized]);

  const fromPriceUsd = priceOf(effectivePair.fromSymbol);
  const rawAmountPrice = priceOf(effectivePair.toSymbol);
  const amountPriceUsd = rawAmountPrice != null && rawAmountPrice <= 1000 ? rawAmountPrice : null;
  const fromUpper = effectivePair.fromSymbol;
  const toUpper = effectivePair.toSymbol;

  const selectPair = useCallback(
    (idx: number) => {
      setSelectedPairIdx(idx);
      setReversed(false);
      onPairChange?.(pairs[idx].slug);
    },
    [onPairChange, pairs],
  );

  // Column labels
  const priceLabel = normalized?.inverted ? fromUpper : toUpper;
  const askAmtLabel = fromUpper;
  const askTotalLabel = toUpper;
  const bidAmtLabel = toUpper;
  const bidTotalLabel = fromUpper;

  const maxAmount = useMemo(() => {
    if (!normalized) return 0;
    const maxAsk = Math.max(...normalized.asks.map((a) => a.amount), 0);
    const maxBid = Math.max(...normalized.bids.map((b) => b.amount), 0);
    return Math.max(maxAsk, maxBid);
  }, [normalized]);

  // Color tokens
  const bgPage = isDark ? 'gray.950' : 'white';
  const bgCard = isDark ? 'gray.900' : 'gray.100';
  const borderColor = isDark ? 'gray.700' : 'gray.200';
  const textMain = isDark ? 'white' : 'gray.900';
  const textMuted = isDark ? 'gray.500' : 'gray.400';

  return (
    <Box bg={bgPage} minH="100vh" p={{ base: 3, md: 5 }}>
      {/* Header */}
      <Flex align="center" justify="space-between" mb={4}>
        <HStack gap={3}>
          <Flex
            h={10}
            w={10}
            align="center"
            justify="center"
            borderRadius="xl"
            bg={isDark ? 'blue.900' : 'blue.50'}
          >
            <Icon as={BarChart3} boxSize={5} color="blue.400" />
          </Flex>
          <Box>
            <Heading size="lg" fontWeight="semibold" letterSpacing="tight" color={textMain}>
              Order Book
            </Heading>
            <HStack gap={1.5}>
              <Box position="relative" w={2} h={2}>
                <Box
                  position="absolute"
                  inset={0}
                  borderRadius="full"
                  bg="green.400"
                  opacity={0.75}
                  animation="ping 1s cubic-bezier(0,0,0.2,1) infinite"
                />
                <Box position="relative" w={2} h={2} borderRadius="full" bg="green.400" />
              </Box>
              <Text fontSize="xs" color={textMuted}>
                Live from open4dev DEX
              </Text>
            </HStack>
          </Box>
        </HStack>
      </Flex>

      {/* Pair selector */}
      <HStack gap={2} mb={4} flexWrap="wrap">
        {pairs.map((p, idx) => {
          const isSelected = selectedPairIdx === idx && !reversed;
          return (
            <Button
              key={p.slug}
              size="sm"
              borderRadius="full"
              variant={isSelected ? 'solid' : 'outline'}
              colorPalette={isSelected ? 'blue' : undefined}
              onClick={() => selectPair(idx)}
            >
              {p.label}
            </Button>
          );
        })}
        <Button
          size="sm"
          variant="ghost"
          opacity={0.6}
          _hover={{ opacity: 1 }}
          onClick={() => setReversed((r) => !r)}
        >
          <Icon as={ArrowDownUp} boxSize={3} mr={1} />
          Flip
        </Button>
      </HStack>

      {/* Order Stats cards */}
      {pairStats ? (
        <Box mb={4}>
          <PairActivityRow
            stats={pairStats}
            fromSymbol={fromUpper}
            toSymbol={toUpper}
            isDark={isDark}
          />
        </Box>
      ) : (
        <SimpleGrid columns={3} gap={2} mb={4}>
          {['1H', '24H', 'MAX'].map((label) => (
            <Box
              key={label}
              borderRadius="lg"
              border="1px solid"
              borderColor={borderColor}
              bg={bgCard}
              px={3}
              py={2.5}
            >
              <Flex align="center" justify="space-between" mb={2}>
                <Badge variant="outline" size="sm">{label}</Badge>
              </Flex>
              <SimpleGrid columns={3} gap={2}>
                {['Open', 'Filled', 'Volume'].map((col) => (
                  <Box key={col}>
                    <Text fontSize="9px" textTransform="uppercase" letterSpacing="wider" color={textMuted}>
                      {col}
                    </Text>
                    <Box h={4} w={col === 'Volume' ? 14 : 8} bg={isDark ? 'gray.700' : 'gray.200'} borderRadius="sm" mt={1} />
                  </Box>
                ))}
              </SimpleGrid>
            </Box>
          ))}
        </SimpleGrid>
      )}

      {/* Spread bar */}
      {stats && (
        <Box mb={4}>
          <SpreadBar stats={stats} fromUpper={fromUpper} toUpper={toUpper} isDark={isDark} />
        </Box>
      )}

      {/* Order book tables */}
      {bookError ? (
        <Box bg={bgCard} borderRadius="xl" border="1px solid" borderColor={borderColor} p={4}>
          <Text fontSize="sm" color="red.400">{bookError}</Text>
        </Box>
      ) : bookLoading && !book ? (
        <Box bg={bgCard} borderRadius="xl" border="1px solid" borderColor={borderColor} p={4}>
          <Flex justify="center" py={10}>
            <Spinner size="md" />
          </Flex>
        </Box>
      ) : normalized && stats ? (
        <SimpleGrid columns={{ base: 1, lg: 2 }} gap={4}>
          <OrderBookSide
            side="bid"
            levels={normalized.bids}
            maxAmount={maxAmount}
            priceLabel={priceLabel}
            amountLabel={bidAmtLabel}
            totalLabel={bidTotalLabel}
            refreshTick={refreshTick}
            priceUsd={amountPriceUsd}
            isDark={isDark}
            inverted={normalized.inverted}
          />
          <OrderBookSide
            side="ask"
            levels={normalized.asks}
            maxAmount={maxAmount}
            priceLabel={priceLabel}
            amountLabel={askAmtLabel}
            totalLabel={askTotalLabel}
            refreshTick={refreshTick}
            priceUsd={fromPriceUsd}
            isDark={isDark}
            inverted={normalized.inverted}
          />
        </SimpleGrid>
      ) : null}

      {/* Footer */}
      <Box
        mt={4}
        py={2}
        textAlign="center"
        fontSize="10px"
        letterSpacing="wide"
        color={textMuted}
        borderTop="1px solid"
        borderColor={borderColor}
      >
        open4dev is data provider
      </Box>
    </Box>
  );
}
