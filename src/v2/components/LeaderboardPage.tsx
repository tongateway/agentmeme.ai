import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Flex,
  Heading,
  Text,
  Button,
  HStack,
  Spinner,
  Link,
  Icon,
} from '@chakra-ui/react';
import { Trophy } from 'lucide-react';
import {
  getRaceLeaderboard,
  getTokenLeaderboard,
  fromNanoToken,
  type LeaderboardEntry,
  type TokenLeaderboardEntry,
  type PublicApiConfig,
} from '@/lib/api';

/* ---------- Helpers ---------- */

function fmtAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function explorerLink(addr: string): string {
  return `https://tonviewer.com/${addr}`;
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1000) return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}

function shortModel(m: string): string {
  const parts = m.split('/');
  return parts.length > 1 ? parts[parts.length - 1] : m;
}

function fmtAmount(n: number): string {
  if (n === 0) return '0';
  if (n >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

/* ---------- RankBadge ---------- */

function RankBadge({ rank, isDark }: { rank: number; isDark: boolean }) {
  if (rank === 1) {
    return (
      <Flex
        align="center"
        justify="center"
        borderRadius="full"
        w={6}
        h={6}
        bg="yellow.900"
        color="yellow.300"
        fontSize="10px"
        fontWeight="bold"
        fontFamily="mono"
      >
        1
      </Flex>
    );
  }
  if (rank === 2) {
    return (
      <Flex
        align="center"
        justify="center"
        borderRadius="full"
        w={6}
        h={6}
        bg={isDark ? 'gray.700' : 'gray.200'}
        color={isDark ? 'gray.300' : 'gray.500'}
        fontSize="10px"
        fontWeight="bold"
        fontFamily="mono"
      >
        2
      </Flex>
    );
  }
  if (rank === 3) {
    return (
      <Flex
        align="center"
        justify="center"
        borderRadius="full"
        w={6}
        h={6}
        bg="orange.900"
        color="orange.400"
        fontSize="10px"
        fontWeight="bold"
        fontFamily="mono"
      >
        3
      </Flex>
    );
  }
  return (
    <Text fontSize="10px" fontWeight="semibold" fontFamily="mono" opacity={0.4} w={6} textAlign="center">
      {rank}
    </Text>
  );
}

/* ---------- Types ---------- */

type TabKey = 'overall' | 'agnt' | 'ton' | 'not' | 'build';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overall', label: 'Overall' },
  { key: 'agnt', label: 'AGNT' },
  { key: 'ton', label: 'TON' },
  { key: 'not', label: 'NOT' },
  { key: 'build', label: 'BUILD' },
];

type LeaderboardPageProps = {
  raceCfg: PublicApiConfig;
  onSelectAgent?: (contractId: string) => void;
};

/* ---------- Main Component ---------- */

export function LeaderboardPage({ raceCfg, onSelectAgent }: LeaderboardPageProps) {
  const [tab, setTab] = useState<TabKey>('overall');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [tokenEntries, setTokenEntries] = useState<TokenLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    setLoading(true);
    setError(null);
    try {
      if (tab === 'overall') {
        const data = await getRaceLeaderboard(raceCfg, { limit: 100, sortBy: 'profit_pct' });
        setEntries(data);
      } else {
        const data = await getTokenLeaderboard(raceCfg, tab);
        setTokenEntries(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [raceCfg, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const isToken = tab !== 'overall';
  const tokenSymbol = tab.toUpperCase();

  const bgCard = isDark ? 'gray.900' : 'gray.100';
  const borderColor = isDark ? 'gray.800' : 'gray.200';
  const textMain = isDark ? 'white' : 'gray.900';
  const textMuted = isDark ? 'gray.400' : 'gray.500';
  const rowHover = isDark ? 'gray.800' : 'gray.50';
  const rowBorder = isDark ? 'gray.800' : 'gray.100';
  const thBorder = isDark ? 'gray.700' : 'gray.200';

  return (
    <Box mt={4}>
      <Box bg={bgCard} borderRadius="xl" border="1px solid" borderColor={borderColor} overflow="hidden">
        <Box p={{ base: 4, sm: 6 }}>
          {/* Header row */}
          <Flex
            direction={{ base: 'column', sm: 'row' }}
            align={{ base: 'flex-start', sm: 'center' }}
            justify="space-between"
            gap={3}
            mb={4}
          >
            <HStack gap={2}>
              <Icon as={Trophy} boxSize={5} color="yellow.400" />
              <Heading size="lg" fontWeight="bold" color={textMain}>
                Leaderboard
              </Heading>
            </HStack>

            {/* Tabs */}
            <HStack gap={1} flexWrap="wrap">
              {TABS.map((t) => (
                <Button
                  key={t.key}
                  size="sm"
                  variant={tab === t.key ? 'solid' : 'ghost'}
                  colorPalette={tab === t.key ? 'brand' : undefined}
                  onClick={() => setTab(t.key)}
                  fontWeight="medium"
                  opacity={tab === t.key ? 1 : 0.6}
                  _hover={{ opacity: 1 }}
                >
                  {t.label}
                </Button>
              ))}
            </HStack>
          </Flex>

          {/* Content */}
          {error ? (
            <Text fontSize="sm" color="red.400">
              {error}
            </Text>
          ) : loading ? (
            <Flex justify="center" py={8}>
              <Spinner size="md" color="brand.500" />
            </Flex>
          ) : !isToken ? (
            /* Overall leaderboard */
            entries.length === 0 ? (
              <Text fontSize="sm" opacity={0.6} color={textMuted}>
                No entries yet.
              </Text>
            ) : (
              <Box overflowX="auto">
                <Box as="table" w="full" style={{ borderCollapse: 'collapse' }}>
                  <Box as="thead">
                    <Box as="tr">
                      {['#', 'Agent', 'AI Model', 'Balance', 'P&L', 'Orders', ''].map(
                        (col, ci) => (
                          <Box
                            key={`${col}-${ci}`}
                            as="th"
                            px={3}
                            py={2}
                            fontSize="10px"
                            fontWeight="semibold"
                            textTransform="uppercase"
                            letterSpacing="wider"
                            opacity={0.4}
                            color={textMuted}
                            textAlign={ci >= 3 && ci <= 5 ? 'right' : 'left'}
                            borderBottom="1px solid"
                            borderColor={thBorder}
                            display={ci === 2 ? { base: 'none', sm: 'table-cell' } : undefined}
                            minW={ci === 0 ? '32px' : ci === 6 ? '64px' : undefined}
                          >
                            {col}
                          </Box>
                        ),
                      )}
                    </Box>
                  </Box>
                  <Box as="tbody">
                    {entries.map((e) => {
                      const profitPct = e.profit_pct ?? 0;
                      const isPositive = profitPct >= 0;
                      const totalOrd = e.total_orders ?? 0;
                      const compOrd = e.completed_orders ?? 0;
                      const ordPct = totalOrd > 0 ? (compOrd / totalOrd) * 100 : 0;
                      const pnlColor = isPositive ? 'green.400' : 'red.400';

                      return (
                        <Box
                          as="tr"
                          key={e.smart_contract_id}
                          _hover={{ bg: rowHover }}
                          borderBottom="1px solid"
                          borderColor={rowBorder}
                          cursor={onSelectAgent ? 'pointer' : undefined}
                          onClick={onSelectAgent ? () => onSelectAgent(e.smart_contract_id) : undefined}
                        >
                          {/* Rank */}
                          <Box as="td" px={3} py={2} verticalAlign="middle">
                            <RankBadge rank={e.rank} isDark={isDark} />
                          </Box>

                          {/* Agent */}
                          <Box as="td" px={3} py={2} verticalAlign="middle">
                            <HStack gap={1.5}>
                              {e.is_active && (
                                <Box
                                  w={1.5}
                                  h={1.5}
                                  borderRadius="full"
                                  bg="green.400"
                                  flexShrink={0}
                                  opacity={0.7}
                                />
                              )}
                              <Link
                                href={explorerLink(e.address)}
                                target="_blank"
                                rel="noreferrer"
                                fontSize="xs"
                                fontFamily="mono"
                                color={textMain}
                                _hover={{ textDecoration: 'underline' }}
                                onClick={(ev) => ev.stopPropagation()}
                              >
                                {e.name || fmtAddr(e.address)}
                              </Link>
                            </HStack>
                          </Box>

                          {/* Model (hidden on mobile) */}
                          <Box
                            as="td"
                            px={3}
                            py={2}
                            verticalAlign="middle"
                            display={{ base: 'none', sm: 'table-cell' }}
                          >
                            <Text
                              fontSize="xs"
                              fontFamily="mono"
                              opacity={0.4}
                              maxW="9rem"
                              overflow="hidden"
                              textOverflow="ellipsis"
                              whiteSpace="nowrap"
                              color={textMuted}
                            >
                              {e.ai_model ? shortModel(e.ai_model) : '\u2014'}
                            </Text>
                          </Box>

                          {/* Balance */}
                          <Box as="td" px={3} py={2} textAlign="right" verticalAlign="middle">
                            <Flex direction="column" align="flex-end" gap={0}>
                              <Text fontSize="xs" fontFamily="mono" fontWeight="medium" color={textMain}>
                                {e.current_balance_usd != null ? fmtUsd(e.current_balance_usd) : '\u2014'}
                              </Text>
                              <Text fontSize="10px" fontFamily="mono" opacity={0.3} color={textMuted}>
                                {e.start_balance_usd != null ? fmtUsd(e.start_balance_usd) : ''}
                              </Text>
                            </Flex>
                          </Box>

                          {/* P&L */}
                          <Box as="td" px={3} py={2} textAlign="right" verticalAlign="middle">
                            <Flex direction="column" align="flex-end" gap={0}>
                              <Text
                                fontSize="sm"
                                fontFamily="mono"
                                fontWeight="bold"
                                color={pnlColor}
                              >
                                {e.profit_pct != null
                                  ? `${isPositive ? '+' : ''}${profitPct.toFixed(1)}%`
                                  : '\u2014'}
                              </Text>
                              <Text fontSize="10px" fontFamily="mono" opacity={0.6} color={pnlColor}>
                                {e.profit_usd != null
                                  ? `${isPositive ? '+' : ''}${fmtUsd(e.profit_usd)}`
                                  : ''}
                              </Text>
                            </Flex>
                          </Box>

                          {/* Orders */}
                          <Box as="td" px={3} py={2} textAlign="right" verticalAlign="middle">
                            <Flex direction="column" align="flex-end" gap={1}>
                              <HStack gap={0}>
                                <Text fontSize="xs" fontFamily="mono" color="green.400" opacity={0.8}>
                                  {compOrd}
                                </Text>
                                <Text fontSize="xs" fontFamily="mono" opacity={0.25} color={textMuted}>
                                  /{totalOrd}
                                </Text>
                              </HStack>
                              {totalOrd > 0 && (
                                <Box w="48px" h="4px" borderRadius="full" bg={isDark ? 'gray.700' : 'gray.200'} overflow="hidden">
                                  <Box
                                    h="full"
                                    borderRadius="full"
                                    bg="green.500"
                                    opacity={0.5}
                                    style={{ width: `${ordPct}%` }}
                                  />
                                </Box>
                              )}
                            </Flex>
                          </Box>

                          {/* Open button */}
                          <Box as="td" px={3} py={2} textAlign="center" verticalAlign="middle">
                            <Button
                              size="xs"
                              variant="outline"
                              fontFamily="mono"
                              fontSize="10px"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                onSelectAgent?.(e.smart_contract_id);
                              }}
                            >
                              Open
                            </Button>
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              </Box>
            )
          ) : (
            /* Token-specific leaderboard */
            tokenEntries.length === 0 ? (
              <Text fontSize="sm" opacity={0.6} color={textMuted}>
                No {tokenSymbol} trading data yet.
              </Text>
            ) : (
              <Box overflowX="auto">
                <Box as="table" w="full" style={{ borderCollapse: 'collapse' }}>
                  <Box as="thead">
                    <Box as="tr">
                      {['#', 'Agent', 'Buy Vol', 'Sell Vol', 'Orders', 'Decisions', ''].map(
                        (col, ci) => (
                          <Box
                            key={`${col}-${ci}`}
                            as="th"
                            px={3}
                            py={2}
                            fontSize="10px"
                            fontWeight="semibold"
                            textTransform="uppercase"
                            letterSpacing="wider"
                            opacity={0.4}
                            color={textMuted}
                            textAlign={ci >= 2 && ci <= 5 ? 'right' : 'left'}
                            borderBottom="1px solid"
                            borderColor={thBorder}
                            display={ci === 5 ? { base: 'none', sm: 'table-cell' } : undefined}
                          >
                            {col}
                          </Box>
                        ),
                      )}
                    </Box>
                  </Box>
                  <Box as="tbody">
                    {tokenEntries.map((e) => {
                      const buyHuman = fromNanoToken(e.buy_volume, tokenSymbol);
                      const sellHuman = fromNanoToken(e.sell_volume, tokenSymbol);
                      const totalOrd = e.total_orders ?? 0;
                      const compOrd = e.completed_orders ?? 0;
                      const ordPct = totalOrd > 0 ? (compOrd / totalOrd) * 100 : 0;

                      return (
                        <Box
                          as="tr"
                          key={e.smart_contract_id}
                          _hover={{ bg: rowHover }}
                          borderBottom="1px solid"
                          borderColor={rowBorder}
                          cursor={onSelectAgent ? 'pointer' : undefined}
                          onClick={onSelectAgent ? () => onSelectAgent(e.smart_contract_id) : undefined}
                        >
                          {/* Rank */}
                          <Box as="td" px={3} py={2} verticalAlign="middle">
                            <RankBadge rank={e.rank} isDark={isDark} />
                          </Box>

                          {/* Agent */}
                          <Box as="td" px={3} py={2} verticalAlign="middle">
                            <HStack gap={1.5}>
                              {e.status === 'active' && (
                                <Box
                                  w={1.5}
                                  h={1.5}
                                  borderRadius="full"
                                  bg="green.400"
                                  flexShrink={0}
                                  opacity={0.7}
                                />
                              )}
                              <Text fontSize="xs" fontFamily="mono" color={textMain}>
                                {e.name || fmtAddr(e.address)}
                              </Text>
                            </HStack>
                          </Box>

                          {/* Buy Vol */}
                          <Box as="td" px={3} py={2} textAlign="right" verticalAlign="middle">
                            <Text fontSize="xs" fontFamily="mono" color="green.400" opacity={0.8}>
                              {fmtAmount(buyHuman)}
                            </Text>
                          </Box>

                          {/* Sell Vol */}
                          <Box as="td" px={3} py={2} textAlign="right" verticalAlign="middle">
                            <Text fontSize="xs" fontFamily="mono" color="red.400" opacity={0.8}>
                              {fmtAmount(sellHuman)}
                            </Text>
                          </Box>

                          {/* Orders */}
                          <Box as="td" px={3} py={2} textAlign="right" verticalAlign="middle">
                            <Flex direction="column" align="flex-end" gap={1}>
                              <HStack gap={0}>
                                <Text fontSize="xs" fontFamily="mono" color="green.400" opacity={0.8}>
                                  {compOrd}
                                </Text>
                                <Text fontSize="xs" fontFamily="mono" opacity={0.25} color={textMuted}>
                                  /{totalOrd}
                                </Text>
                              </HStack>
                              {totalOrd > 0 && (
                                <Box w="48px" h="4px" borderRadius="full" bg={isDark ? 'gray.700' : 'gray.200'} overflow="hidden">
                                  <Box
                                    h="full"
                                    borderRadius="full"
                                    bg="green.500"
                                    opacity={0.5}
                                    style={{ width: `${ordPct}%` }}
                                  />
                                </Box>
                              )}
                            </Flex>
                          </Box>

                          {/* Decisions (hidden on mobile) */}
                          <Box
                            as="td"
                            px={3}
                            py={2}
                            textAlign="right"
                            verticalAlign="middle"
                            display={{ base: 'none', sm: 'table-cell' }}
                          >
                            <Text fontSize="xs" fontFamily="mono" opacity={0.5} color={textMuted}>
                              {e.used_decisions}
                              {e.max_decisions > 0 ? `/${e.max_decisions}` : ''}
                            </Text>
                          </Box>

                          {/* Open button */}
                          <Box as="td" px={3} py={2} textAlign="center" verticalAlign="middle">
                            <Button
                              size="xs"
                              variant="outline"
                              fontFamily="mono"
                              fontSize="10px"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                onSelectAgent?.(e.smart_contract_id);
                              }}
                            >
                              Open
                            </Button>
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>
              </Box>
            )
          )}
        </Box>
      </Box>
    </Box>
  );
}
