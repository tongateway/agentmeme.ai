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

function statusBadge(status: string) {
  const cls: Record<string, string> = {
    deployed: 'badge-info',
    created: 'badge-info',
    pending_match: 'badge-warning',
    completed: 'badge-success',
    closed: 'badge-ghost',
    cancelled: 'badge-neutral',
    failed: 'badge-error',
  };
  return cls[status] ?? 'badge-ghost';
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
  contractAddress: string; // friendly EQ/UQ form
};

type TabFilter = 'active' | 'history';

/* ---------- component ---------- */

export function OrdersPanel({ contractAddress }: OrdersPanelProps) {
  const rawAddress = useMemo(() => toRawAddress(contractAddress), [contractAddress]);

  // Cache keys
  const ordCacheKey = ordersCacheKey(contractAddress);
  const statsCacheKey = orderStatsCacheKey(contractAddress);
  const coinCacheKey = coinMapCacheKey(contractAddress);

  // Load cached data
  const cachedOrders = useMemo(() => readCache<DexOrder[]>(ordCacheKey), [ordCacheKey]);
  const cachedStats = useMemo(() => readCache<DexOrderStats>(statsCacheKey), [statsCacheKey]);
  const cachedCoinEntries = useMemo(() => readCache<[number, string][]>(coinCacheKey), [coinCacheKey]);

  const [tab, setTab] = useState<TabFilter>('active');
  const [allOrders, setAllOrders] = useState<DexOrder[]>(cachedOrders ?? []);
  const [loading, setLoading] = useState(!cachedOrders); // only spinner if no cache
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

  // Load stats + all orders in sequence (1 RPS limit)
  const loadAll = useCallback(async (isBackground = false) => {
    if (isBackground) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      // Fetch TON price in parallel with stats (different domains, no rate-limit conflict)
      const [statsData, price] = await Promise.all([
        getDexOrderStats(rawAddress),
        getTonPriceUsd(),
      ]);
      setStats(statsData);
      writeCache(statsCacheKey, statsData);
      if (price != null) setTonPrice(price);
      // Small delay to respect 1 RPS
      await new Promise((r) => setTimeout(r, 1100));
      const orders = await getDexOrders(rawAddress, { limit: 200 });
      orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAllOrders(orders);
      writeCache(ordCacheKey, orders);
      // Resolve coin names for all unique coin IDs in orders
      const coinIds = orders.flatMap((o) => [o.from_coin_id, o.to_coin_id]);
      if (coinIds.length > 0) {
        // Small delay to respect 1 RPS before fetching coins
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

  // Client-side filter
  const filteredOrders = useMemo(() => {
    if (tab === 'active') return allOrders.filter((o) => ACTIVE_SET.has(o.status));
    return allOrders.filter((o) => !ACTIVE_SET.has(o.status));
  }, [allOrders, tab, ACTIVE_SET]);

  const orders = useMemo(
    () => showAll ? filteredOrders : filteredOrders.slice(0, INITIAL_LIMIT),
    [filteredOrders, showAll],
  );
  const hasMore = filteredOrders.length > INITIAL_LIMIT;

  // Reset "show all" when switching tabs
  useEffect(() => { setShowAll(false); }, [tab]);

  return (
    <div className="card bg-base-200 shadow-md sm:col-span-2">
      <div className="card-body">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 opacity-70" />
            <h2 className="card-title">DEX Orders</h2>
            {refreshing && (
              <span className="flex items-center gap-1 text-xs opacity-50">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Updating…
              </span>
            )}
            {stats && (
              <div className="flex items-center gap-2 text-xs opacity-60">
                <span className="badge badge-sm badge-outline">{stats.total} total</span>
                {stats.open > 0 && (
                  <span className="badge badge-sm badge-info">{stats.open} open</span>
                )}
                <span className="badge badge-sm badge-ghost">{stats.closed} closed</span>
              </div>
            )}
          </div>
          {/* Tabs */}
          <div role="tablist" className="tabs tabs-boxed tabs-sm">
            <button
              role="tab"
              className={`tab ${tab === 'active' ? 'tab-active' : ''}`}
              onClick={() => setTab('active')}
              type="button"
            >
              Active{stats?.open ? ` (${stats.open})` : ''}
            </button>
            <button
              role="tab"
              className={`tab ${tab === 'history' ? 'tab-active' : ''}`}
              onClick={() => setTab('history')}
              type="button"
            >
              History{stats?.closed ? ` (${stats.closed})` : ''}
            </button>
          </div>
        </div>

        {/* Content */}
        {error ? (
          <div className="text-sm text-error mt-2">{error}</div>
        ) : loading ? (
          <div className="flex justify-center py-6">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-sm opacity-60 py-4 text-center">
            {tab === 'active' ? 'No active orders.' : 'No order history yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0 mt-2">
            <table className="table table-sm w-full">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Pair</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right hidden sm:table-cell">Rate</th>
                  <th className="text-right hidden sm:table-cell">≈ Receive</th>
                  <th className="hidden sm:table-cell">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => {
                  const fromLabel = coinLabel(o.from_coin_id, coinMap);
                  const toLabel = coinLabel(o.to_coin_id, coinMap);
                  // Convert nano amounts to human-readable using token decimals
                  const humanAmount = fromNanoToken(o.initial_amount, fromLabel);
                  const humanRate = o.price_rate / 1e18;
                  // USD value: only when from_coin is TON (coin 0) and we have a price
                  const usdValue =
                    o.from_coin_id === 0 && tonPrice != null
                      ? humanAmount * tonPrice
                      : null;
                  // Approximate receive tokens
                  const receiveAmount =
                    humanRate > 0 ? humanAmount * humanRate : null;
                  return (
                    <tr key={o.id} className="hover">
                      <td className="mono text-xs whitespace-nowrap">{fmtTime(o.created_at)}</td>
                      <td className="whitespace-nowrap">
                        <span className="font-medium text-xs">{fromLabel}</span>
                        <span className="opacity-40 mx-1">→</span>
                        <span className="font-medium text-xs">{toLabel}</span>
                      </td>
                      <td className="mono text-xs text-right whitespace-nowrap">
                        <div>{fmtAmount(humanAmount)} {fromLabel}</div>
                        {usdValue != null && (
                          <div className="opacity-50 text-[10px]">~${usdValue.toFixed(2)}</div>
                        )}
                      </td>
                      <td className="mono text-xs text-right whitespace-nowrap hidden sm:table-cell">
                        {humanRate > 0 ? fmtAmount(humanRate) : '—'}
                      </td>
                      <td className="mono text-xs text-right whitespace-nowrap hidden sm:table-cell">
                        {receiveAmount != null ? (
                          <span>~{fmtAmount(receiveAmount)} {toLabel}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="hidden sm:table-cell">
                        <span className={`badge badge-outline badge-xs ${statusBadge(o.status)}`}>
                          {o.status}
                        </span>
                      </td>
                      <td>
                        {o.raw_address && (
                          <a
                            className="btn btn-ghost btn-xs"
                            href={explorerOrderLink(o.raw_address)}
                            target="_blank"
                            rel="noreferrer"
                            title="View on Tonviewer"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {hasMore && (
              <div className="flex justify-center mt-3">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll ? 'Show less' : `Show all ${filteredOrders.length} orders`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
