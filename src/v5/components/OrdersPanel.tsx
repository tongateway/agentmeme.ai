import { useCallback, useEffect, useMemo, useState } from 'react';
import { Address } from '@ton/core';
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
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table';
import { cn } from '../lib/utils';

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

function statusVariant(status: string): 'default' | 'warning' | 'success' | 'secondary' | 'destructive' | 'outline' {
  const map: Record<string, 'default' | 'warning' | 'success' | 'secondary' | 'destructive' | 'outline'> = {
    deployed: 'default',
    created: 'default',
    pending_match: 'warning',
    completed: 'success',
    closed: 'secondary',
    cancelled: 'outline',
    failed: 'destructive',
  };
  return map[status] ?? 'secondary';
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
};

type TabFilter = 'active' | 'history';

/* ---------- component ---------- */

export function OrdersPanel({ contractAddress }: OrdersPanelProps) {
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

  return (
    <Card className="sm:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-violet-500 dark:text-violet-400" />
            <CardTitle>DEX Orders</CardTitle>
            {refreshing && (
              <span className="flex items-center gap-1 text-xs text-neutral-500">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Updating...
              </span>
            )}
            {stats && (
              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <Badge variant="outline" className="text-[10px]">{stats.total} total</Badge>
                {stats.open > 0 && <Badge variant="default" className="text-[10px]">{stats.open} open</Badge>}
                <Badge variant="secondary" className="text-[10px]">{stats.closed} closed</Badge>
              </div>
            )}
          </div>
          {/* Tabs */}
          <div className="flex rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-800">
            <button
              type="button"
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                tab === 'active'
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-50'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-50',
              )}
              onClick={() => setTab('active')}
            >
              Active{stats?.open ? ` (${stats.open})` : ''}
            </button>
            <button
              type="button"
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                tab === 'history'
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-50'
                  : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-50',
              )}
              onClick={() => setTab('history')}
            >
              History{stats?.closed ? ` (${stats.closed})` : ''}
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {error ? (
          <div className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</div>
        ) : loading ? (
          <div className="flex justify-center py-6">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-sm text-neutral-500 py-4 text-center">
            {tab === 'active' ? 'No active orders.' : 'No order history yet.'}
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Pair</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Rate</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">~ Receive</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => {
                  const fromLabel = coinLabel(o.from_coin_id, coinMap);
                  const toLabel = coinLabel(o.to_coin_id, coinMap);
                  const humanAmount = fromNanoToken(o.initial_amount, fromLabel);
                  const humanRate = o.price_rate / 1e18;
                  const usdValue =
                    o.from_coin_id === 0 && tonPrice != null
                      ? humanAmount * tonPrice
                      : null;
                  const receiveAmount = humanRate > 0 ? humanAmount * humanRate : null;
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{fmtTime(o.created_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="font-medium text-xs">{fromLabel}</span>
                        <span className="text-neutral-400 mx-1">{'\u2192'}</span>
                        <span className="font-medium text-xs">{toLabel}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-right whitespace-nowrap">
                        <div>{fmtAmount(humanAmount)} {fromLabel}</div>
                        {usdValue != null && (
                          <div className="text-neutral-500 text-[10px]">~${usdValue.toFixed(2)}</div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-right whitespace-nowrap hidden sm:table-cell">
                        {humanRate > 0 ? fmtAmount(humanRate) : '\u2014'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-right whitespace-nowrap hidden sm:table-cell">
                        {receiveAmount != null ? (
                          <span>~{fmtAmount(receiveAmount)} {toLabel}</span>
                        ) : '\u2014'}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={statusVariant(o.status)} className="text-[10px]">
                          {o.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {o.raw_address && (
                          <a
                            className="inline-flex items-center justify-center h-7 w-7 rounded-md text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 dark:hover:text-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                            href={explorerOrderLink(o.raw_address)}
                            target="_blank"
                            rel="noreferrer"
                            title="View on Tonviewer"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {hasMore && (
              <div className="flex justify-center mt-3">
                <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Show less' : `Show all ${filteredOrders.length} orders`}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
