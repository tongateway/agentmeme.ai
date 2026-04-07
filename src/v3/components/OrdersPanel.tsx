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
    deployed: 'border-blue-400/50 text-blue-400',
    created: 'border-blue-400/50 text-blue-400',
    pending_match: 'border-yellow-400/50 text-yellow-400',
    completed: 'border-[#00C389]/50 text-[#00C389]',
    closed: 'border-gray-500/50 text-gray-400',
    cancelled: 'border-gray-500/50 text-gray-400',
    failed: 'border-red-400/50 text-red-400',
  };
  return map[status] ?? 'border-gray-500/50 text-gray-400';
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-white/5 bg-gray-900/60 p-5 backdrop-blur-sm sm:col-span-2"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-bold text-white">DEX Orders</h2>
          {refreshing && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Updating...
            </span>
          )}
          {stats && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="rounded-full border border-white/10 px-2 py-0.5">{stats.total} total</span>
              {stats.open > 0 && (
                <span className="rounded-full border border-blue-400/30 px-2 py-0.5 text-blue-400">{stats.open} open</span>
              )}
              <span className="rounded-full border border-white/10 px-2 py-0.5">{stats.closed} closed</span>
            </div>
          )}
        </div>
        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-gray-800/60 p-0.5">
          <button
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              tab === 'active' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => setTab('active')}
            type="button"
          >
            Active{stats?.open ? ` (${stats.open})` : ''}
          </button>
          <button
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              tab === 'history' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => setTab('history')}
            type="button"
          >
            History{stats?.closed ? ` (${stats.closed})` : ''}
          </button>
        </div>
      </div>

      {/* Content */}
      {error ? (
        <div className="mt-3 text-sm text-red-400">{error}</div>
      ) : loading ? (
        <div className="flex justify-center py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-[#00C389]" />
        </div>
      ) : orders.length === 0 ? (
        <div className="py-6 text-center text-sm text-gray-500">
          {tab === 'active' ? 'No active orders.' : 'No order history yet.'}
        </div>
      ) : (
        <div className="-mx-2 mt-3 overflow-x-auto sm:mx-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-xs text-gray-500">
                <th className="pb-2 text-left font-medium">Time</th>
                <th className="pb-2 text-left font-medium">Pair</th>
                <th className="pb-2 text-right font-medium">Amount</th>
                <th className="hidden pb-2 text-right font-medium sm:table-cell">Rate</th>
                <th className="hidden pb-2 text-right font-medium sm:table-cell">Receive</th>
                <th className="hidden pb-2 font-medium sm:table-cell">Status</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <AnimatePresence mode="popLayout">
              <tbody>
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
                    <motion.tr
                      key={o.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="py-2 pr-3 font-mono text-xs text-gray-300 whitespace-nowrap">{fmtTime(o.created_at)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <span className="text-xs font-medium text-white">{fromLabel}</span>
                        <span className="mx-1 text-gray-600">&rarr;</span>
                        <span className="text-xs font-medium text-white">{toLabel}</span>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-xs text-gray-300 whitespace-nowrap">
                        <div>{fmtAmount(humanAmount)} {fromLabel}</div>
                        {usdValue != null && (
                          <div className="text-[10px] text-gray-600">~${usdValue.toFixed(2)}</div>
                        )}
                      </td>
                      <td className="hidden py-2 pr-3 text-right font-mono text-xs text-gray-400 whitespace-nowrap sm:table-cell">
                        {humanRate > 0 ? fmtAmount(humanRate) : '\u2014'}
                      </td>
                      <td className="hidden py-2 pr-3 text-right font-mono text-xs text-gray-400 whitespace-nowrap sm:table-cell">
                        {receiveAmount != null ? (
                          <span>~{fmtAmount(receiveAmount)} {toLabel}</span>
                        ) : (
                          '\u2014'
                        )}
                      </td>
                      <td className="hidden py-2 sm:table-cell">
                        <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusColor(o.status)}`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="py-2">
                        {o.raw_address && (
                          <a
                            className="inline-flex items-center rounded p-1 text-gray-500 transition-colors hover:text-gray-300"
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
              </tbody>
            </AnimatePresence>
          </table>
          {hasMore && (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                className="rounded-lg px-4 py-1.5 text-xs text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'Show less' : `Show all ${filteredOrders.length} orders`}
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
