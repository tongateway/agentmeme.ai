import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { cn } from '../utils/cn';

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

function statusColor(status: string): string {
  const map: Record<string, string> = {
    deployed: 'bg-[#00C389]/20 text-[#00C389] border-[#00C389]/30',
    created: 'bg-[#00C389]/20 text-[#00C389] border-[#00C389]/30',
    pending_match: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    completed: 'bg-[#00C389]/20 text-[#00C389] border-[#00C389]/30',
    closed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    cancelled: 'bg-gray-500/20 text-gray-500 border-gray-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  };
  return map[status] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30';
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
    <div className="sm:col-span-2 bg-gray-900/50 border border-white/10 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-[#00C389]" />
            <h3 className="text-white font-semibold text-sm">DEX Orders</h3>
            {refreshing && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Updating...
              </span>
            )}
            {stats && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="px-1.5 py-0.5 rounded border border-white/10 text-[10px] text-gray-400">{stats.total} total</span>
                {stats.open > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-[#00C389]/20 text-[#00C389] text-[10px]">{stats.open} open</span>
                )}
                <span className="px-1.5 py-0.5 rounded bg-white/5 text-gray-400 text-[10px]">{stats.closed} closed</span>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex rounded-lg bg-black/50 p-0.5 border border-white/5">
            <button
              type="button"
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                tab === 'active'
                  ? 'bg-gray-800 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white',
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
                  ? 'bg-gray-800 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white',
              )}
              onClick={() => setTab('history')}
            >
              History{stats?.closed ? ` (${stats.closed})` : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 pb-5">
        {error ? (
          <div className="text-sm text-red-400 mt-2">{error}</div>
        ) : loading ? (
          <div className="flex justify-center py-6">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#00C389] border-t-transparent" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-sm text-gray-500 py-4 text-center">
            {tab === 'active' ? 'No active orders.' : 'No order history yet.'}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left text-xs font-medium text-gray-500 pb-2 pr-3">Time</th>
                    <th className="text-left text-xs font-medium text-gray-500 pb-2 pr-3">Pair</th>
                    <th className="text-right text-xs font-medium text-gray-500 pb-2 pr-3">Amount</th>
                    <th className="text-right text-xs font-medium text-gray-500 pb-2 pr-3 hidden sm:table-cell">Rate</th>
                    <th className="text-right text-xs font-medium text-gray-500 pb-2 pr-3 hidden sm:table-cell">~ Receive</th>
                    <th className="text-xs font-medium text-gray-500 pb-2 pr-3 hidden sm:table-cell">Status</th>
                    <th className="w-8 pb-2" />
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
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
                        <motion.tr
                          key={o.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="font-mono text-xs text-gray-300 whitespace-nowrap py-2.5 pr-3">{fmtTime(o.created_at)}</td>
                          <td className="whitespace-nowrap py-2.5 pr-3">
                            <span className="font-medium text-xs text-white">{fromLabel}</span>
                            <span className="text-gray-500 mx-1">{'\u2192'}</span>
                            <span className="font-medium text-xs text-white">{toLabel}</span>
                          </td>
                          <td className="font-mono text-xs text-right whitespace-nowrap py-2.5 pr-3">
                            <div className="text-gray-300">{fmtAmount(humanAmount)} {fromLabel}</div>
                            {usdValue != null && (
                              <div className="text-gray-600 text-[10px]">~${usdValue.toFixed(2)}</div>
                            )}
                          </td>
                          <td className="font-mono text-xs text-right text-gray-300 whitespace-nowrap py-2.5 pr-3 hidden sm:table-cell">
                            {humanRate > 0 ? fmtAmount(humanRate) : '\u2014'}
                          </td>
                          <td className="font-mono text-xs text-right text-gray-300 whitespace-nowrap py-2.5 pr-3 hidden sm:table-cell">
                            {receiveAmount != null ? (
                              <span>~{fmtAmount(receiveAmount)} {toLabel}</span>
                            ) : '\u2014'}
                          </td>
                          <td className="py-2.5 pr-3 hidden sm:table-cell">
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', statusColor(o.status))}>
                              {o.status}
                            </span>
                          </td>
                          <td className="py-2.5">
                            {o.raw_address && (
                              <a
                                className="inline-flex items-center justify-center h-7 w-7 rounded-md text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
                                href={explorerOrderLink(o.raw_address)}
                                target="_blank"
                                rel="noreferrer"
                                title="View on Tonviewer"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="flex justify-center mt-3">
                <button
                  type="button"
                  className="text-gray-400 hover:text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors hover:bg-white/5"
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll ? 'Show less' : `Show all ${filteredOrders.length} orders`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
