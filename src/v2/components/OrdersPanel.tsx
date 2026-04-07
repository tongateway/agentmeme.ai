import { useCallback, useEffect, useMemo, useState } from 'react';
import { Address } from '@ton/core';
import {
  Box,
  Flex,
  Text,
  Button,
  HStack,
  Icon,
  Spinner,
  Badge,
  Table,
} from '@chakra-ui/react';
import { ArrowRightLeft, ExternalLink, RefreshCw } from 'lucide-react';
import {
  getDexOrders,
  getDexOrderStats,
  getTonPriceUsd,
  resolveCoinSymbols,
  fromNanoToken,
  type DexOrder,
  type DexOrderStats,
} from '@/lib/api';
import {
  readCache, writeCache,
  ordersCacheKey, orderStatsCacheKey, coinMapCacheKey,
} from '@/lib/cache';

/* ---------- helpers ---------- */

function toRawAddress(friendlyAddr: string): string {
  try {
    return Address.parse(friendlyAddr).toRawString();
  } catch {
    return friendlyAddr;
  }
}

function coinLabel(coinId: number, coinMap: Map<number, string>): string {
  return coinMap.get(coinId) || (coinId === 0 ? 'TON' : `#${coinId}`);
}

type StatusColorPalette = 'blue' | 'yellow' | 'green' | 'gray' | 'red';

function statusColor(status: string): StatusColorPalette {
  const map: Record<string, StatusColorPalette> = {
    deployed: 'blue',
    created: 'blue',
    pending_match: 'yellow',
    completed: 'green',
    closed: 'gray',
    cancelled: 'gray',
    failed: 'red',
  };
  return map[status] ?? 'gray';
}

function fmtAmount(n: number): string {
  if (n === 0) return '0';
  if (n >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function explorerOrderLink(rawAddr: string): string {
  return `https://tonviewer.com/${rawAddr}`;
}

/* ---------- types ---------- */

type OrdersPanelProps = {
  contractAddress: string;
  isDark: boolean;
};

type TabFilter = 'active' | 'history';

/* ---------- component ---------- */

export function OrdersPanel({ contractAddress, isDark }: OrdersPanelProps) {
  const rawAddress = useMemo(() => toRawAddress(contractAddress), [contractAddress]);

  const ordCacheKey = ordersCacheKey(contractAddress);
  const statsCacheKey = orderStatsCacheKey(contractAddress);
  const coinCacheKey = coinMapCacheKey(contractAddress);

  const cachedOrders = useMemo(() => readCache<DexOrder[]>(ordCacheKey), [ordCacheKey]);
  const cachedStats = useMemo(() => readCache<DexOrderStats>(statsCacheKey), [statsCacheKey]);
  const cachedCoinEntries = useMemo(() => readCache<[number, string][]>(coinCacheKey), [coinCacheKey]);

  const [tab, setTab] = useState<TabFilter>('active');
  const [allOrders, setAllOrders] = useState<DexOrder[]>(cachedOrders ?? []);
  const [loading, setLoading] = useState(!cachedOrders);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DexOrderStats | null>(cachedStats);
  const [coinMap, setCoinMap] = useState<Map<number, string>>(
    cachedCoinEntries ? new Map(cachedCoinEntries) : new Map([[0, 'TON']]),
  );
  const [tonPrice, setTonPrice] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const ACTIVE_SET = useMemo(() => new Set(['created', 'deployed', 'pending_match']), []);
  const INITIAL_LIMIT = 10;

  const loadAll = useCallback(async (isBackground = false) => {
    if (isBackground) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [statsData, price] = await Promise.all([
        getDexOrderStats(rawAddress),
        getTonPriceUsd(),
      ]);
      setStats(statsData);
      writeCache(statsCacheKey, statsData);
      if (price != null) setTonPrice(price);

      await new Promise((r) => setTimeout(r, 1100));
      const [activeOrders, recentOrders] = await Promise.all([
        getDexOrders(rawAddress, { status: 'deployed', limit: 100 }),
        getDexOrders(rawAddress, { limit: 200 }),
      ]);

      const byId = new Map<number, DexOrder>();
      for (const o of recentOrders) byId.set(o.id, o);
      for (const o of activeOrders) byId.set(o.id, o);
      const orders = Array.from(byId.values());
      orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAllOrders(orders);
      writeCache(ordCacheKey, orders);

      const coinIds = orders.flatMap((o) => [o.from_coin_id, o.to_coin_id]);
      if (coinIds.length > 0) {
        await new Promise((r) => setTimeout(r, 1100));
        const resolved = await resolveCoinSymbols(coinIds);
        setCoinMap(resolved);
        writeCache(coinCacheKey, Array.from(resolved.entries()));
      }
    } catch (e) {
      if (!isBackground) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rawAddress, ordCacheKey, statsCacheKey, coinCacheKey]);

  useEffect(() => {
    void loadAll(!!cachedOrders);
  }, [loadAll, cachedOrders]);

  const filteredOrders = useMemo(() => {
    if (tab === 'active') return allOrders.filter((o) => ACTIVE_SET.has(o.status));
    return allOrders.filter((o) => !ACTIVE_SET.has(o.status));
  }, [allOrders, tab, ACTIVE_SET]);

  const orders = useMemo(
    () => showAll ? filteredOrders : filteredOrders.slice(0, INITIAL_LIMIT),
    [filteredOrders, showAll],
  );
  const hasMore = filteredOrders.length > INITIAL_LIMIT;

  useEffect(() => { setShowAll(false); }, [tab]);

  const cardBg = isDark ? 'gray.900' : 'gray.100';
  const borderCol = isDark ? 'gray.700' : 'gray.200';
  const textMain = isDark ? 'white' : 'gray.900';
  const textMuted = isDark ? 'gray.400' : 'gray.500';
  const hoverRow = isDark ? 'gray.800' : 'gray.50';

  return (
    <Box bg={cardBg} borderRadius="xl" shadow="md" gridColumn={{ base: undefined, sm: 'span 2' }}>
      <Box p={{ base: 4, md: 6 }}>
        {/* Header */}
        <Flex
          direction={{ base: 'column', sm: 'row' }}
          align={{ base: 'flex-start', sm: 'center' }}
          justify="space-between"
          gap={3}
        >
          <HStack gap={2}>
            <Icon as={ArrowRightLeft} boxSize={5} opacity={0.7} color={textMain} />
            <Text fontWeight="bold" fontSize="lg" color={textMain}>DEX Orders</Text>
            {refreshing && (
              <HStack gap={1} opacity={0.5}>
                <Icon as={RefreshCw} boxSize={3} animation="spin 1s linear infinite" color={textMuted} />
                <Text fontSize="xs" color={textMuted}>Updating...</Text>
              </HStack>
            )}
            {stats && (
              <HStack gap={2}>
                <Badge size="sm" variant="outline">{stats.total} total</Badge>
                {stats.open > 0 && (
                  <Badge size="sm" colorPalette="blue">{stats.open} open</Badge>
                )}
                <Badge size="sm" variant="subtle">{stats.closed} closed</Badge>
              </HStack>
            )}
          </HStack>

          {/* Tabs */}
          <HStack gap={0} borderBottom="2px solid" borderColor={borderCol}>
            <Button
              variant="ghost"
              size="sm"
              borderBottom="2px solid"
              borderColor={tab === 'active' ? 'brand.500' : 'transparent'}
              borderRadius={0}
              mb="-2px"
              color={tab === 'active' ? textMain : textMuted}
              fontWeight={tab === 'active' ? 'bold' : 'normal'}
              onClick={() => setTab('active')}
            >
              Active{stats?.open ? ` (${stats.open})` : ''}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              borderBottom="2px solid"
              borderColor={tab === 'history' ? 'brand.500' : 'transparent'}
              borderRadius={0}
              mb="-2px"
              color={tab === 'history' ? textMain : textMuted}
              fontWeight={tab === 'history' ? 'bold' : 'normal'}
              onClick={() => setTab('history')}
            >
              History{stats?.closed ? ` (${stats.closed})` : ''}
            </Button>
          </HStack>
        </Flex>

        {/* Content */}
        {error ? (
          <Text fontSize="sm" color="red.400" mt={2}>{error}</Text>
        ) : loading ? (
          <Flex justify="center" py={6}>
            <Spinner size="md" />
          </Flex>
        ) : orders.length === 0 ? (
          <Text fontSize="sm" opacity={0.6} py={4} textAlign="center" color={textMuted}>
            {tab === 'active' ? 'No active orders.' : 'No order history yet.'}
          </Text>
        ) : (
          <Box overflowX="auto" mx={{ base: -4, sm: 0 }} mt={2}>
            <Table.Root size="sm" variant="line">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeader color={textMuted} fontSize="xs">Time</Table.ColumnHeader>
                  <Table.ColumnHeader color={textMuted} fontSize="xs">Pair</Table.ColumnHeader>
                  <Table.ColumnHeader color={textMuted} fontSize="xs" textAlign="end">Amount</Table.ColumnHeader>
                  <Table.ColumnHeader color={textMuted} fontSize="xs" textAlign="end" display={{ base: 'none', sm: 'table-cell' }}>Rate</Table.ColumnHeader>
                  <Table.ColumnHeader color={textMuted} fontSize="xs" textAlign="end" display={{ base: 'none', sm: 'table-cell' }}>Receive</Table.ColumnHeader>
                  <Table.ColumnHeader color={textMuted} fontSize="xs" display={{ base: 'none', sm: 'table-cell' }}>Status</Table.ColumnHeader>
                  <Table.ColumnHeader w={8} />
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {orders.map((o) => {
                  const fromLabel = coinLabel(o.from_coin_id, coinMap);
                  const toLabel = coinLabel(o.to_coin_id, coinMap);
                  const humanAmount = fromNanoToken(o.initial_amount, fromLabel);
                  const humanRate = o.price_rate / 1e18;
                  const usdValue =
                    o.from_coin_id === 0 && tonPrice != null
                      ? humanAmount * tonPrice
                      : null;
                  const receiveAmount =
                    humanRate > 0 ? humanAmount * humanRate : null;

                  return (
                    <Table.Row key={o.id} _hover={{ bg: hoverRow }}>
                      <Table.Cell>
                        <Text fontFamily="mono" fontSize="xs" whiteSpace="nowrap" color={textMain}>
                          {fmtTime(o.created_at)}
                        </Text>
                      </Table.Cell>
                      <Table.Cell whiteSpace="nowrap">
                        <Text as="span" fontWeight="medium" fontSize="xs" color={textMain}>{fromLabel}</Text>
                        <Text as="span" opacity={0.4} mx={1} color={textMuted}>{'\u2192'}</Text>
                        <Text as="span" fontWeight="medium" fontSize="xs" color={textMain}>{toLabel}</Text>
                      </Table.Cell>
                      <Table.Cell textAlign="end">
                        <Text fontFamily="mono" fontSize="xs" whiteSpace="nowrap" color={textMain}>
                          {fmtAmount(humanAmount)} {fromLabel}
                        </Text>
                        {usdValue != null && (
                          <Text fontSize="10px" opacity={0.5} color={textMuted}>~${usdValue.toFixed(2)}</Text>
                        )}
                      </Table.Cell>
                      <Table.Cell textAlign="end" display={{ base: 'none', sm: 'table-cell' }}>
                        <Text fontFamily="mono" fontSize="xs" whiteSpace="nowrap" color={textMain}>
                          {humanRate > 0 ? fmtAmount(humanRate) : '\u2014'}
                        </Text>
                      </Table.Cell>
                      <Table.Cell textAlign="end" display={{ base: 'none', sm: 'table-cell' }}>
                        <Text fontFamily="mono" fontSize="xs" whiteSpace="nowrap" color={textMain}>
                          {receiveAmount != null ? `~${fmtAmount(receiveAmount)} ${toLabel}` : '\u2014'}
                        </Text>
                      </Table.Cell>
                      <Table.Cell display={{ base: 'none', sm: 'table-cell' }}>
                        <Badge size="sm" variant="outline" colorPalette={statusColor(o.status)}>
                          {o.status}
                        </Badge>
                      </Table.Cell>
                      <Table.Cell>
                        {o.raw_address && (
                          <a
                            href={explorerOrderLink(o.raw_address)}
                            target="_blank"
                            rel="noreferrer"
                            title="View on Tonviewer"
                            style={{ display: 'inline-flex', padding: 4, borderRadius: 4 }}
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
            {hasMore && (
              <Flex justify="center" mt={3}>
                <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Show less' : `Show all ${filteredOrders.length} orders`}
                </Button>
              </Flex>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
