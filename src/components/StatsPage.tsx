import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, ArrowDownUp } from 'lucide-react';
import {
  getDexOrdersByPair,
  getDexTradingStats,
  getRaceTokens,
  type DexOrder,
  type PublicApiConfig,
} from '@/lib/api';

const AUTO_REFRESH_MS = 10_000; // 10 seconds

/* ---------- coin ID mapping (open4dev) ---------- */

const COIN_IDS: Record<string, number> = {
  TON: 0,
  NOT: 107,
  BUILD: 24,
  DOGS: 1696227,
  PX: 1696228,
  XAUT0: 1696229,
};

/* ---------- pair definitions ---------- */

type TradingPair = {
  slug: string;
  label: string;
  fromSymbol: string;  // quote symbol (price denomination, e.g. TON)
  toSymbol: string;    // base symbol (the asset, e.g. NOT)
};

/** Only pairs whose both vaults exist */
const DEFAULT_PAIRS: TradingPair[] = [
  {
    slug: 'TON-NOT',
    label: 'TON / NOT',
    fromSymbol: 'TON',
    toSymbol: 'NOT',
  },
  {
    slug: 'TON-BUILD',
    label: 'TON / BUILD',
    fromSymbol: 'TON',
    toSymbol: 'BUILD',
  },
  {
    slug: 'NOT-BUILD',
    label: 'NOT / BUILD',
    fromSymbol: 'NOT',
    toSymbol: 'BUILD',
  },
  {
    slug: 'TON-DOGS',
    label: 'TON / DOGS',
    fromSymbol: 'TON',
    toSymbol: 'DOGS',
  },
  {
    slug: 'TON-NOTPIXEL',
    label: 'TON / NOT PIXEL',
    fromSymbol: 'TON',
    toSymbol: 'PX',
  },
  {
    slug: 'TON-XAUT',
    label: 'TON / XAUt',
    fromSymbol: 'TON',
    toSymbol: 'XAUT0',
  },
];

function pairIdxFromSlug(slug: string | null): number {
  if (!slug) return 0;
  const upper = slug.toUpperCase();
  // Backward compatibility for older links
  const normalized = upper === 'TON-XAUTH' ? 'TON-XAUT' : upper;
  const idx = DEFAULT_PAIRS.findIndex((p) => p.slug === normalized);
  return idx >= 0 ? idx : 0;
}

/* ---------- helpers ---------- */

function fmtRate(n: number): string {
  if (n === 0) return '0';
  if (n >= 1_000_000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (n >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  if (n >= 0.0001) return n.toFixed(6);
  return n.toExponential(3);
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
  return `$${n.toFixed(4)}`;
}

/* ---------- normalized level ---------- */

type NormalizedLevel = {
  price: number;       // fromSymbol per toSymbol
  amount: number;      // in toSymbol
  orderCount: number;
};

type NormalizedBook = {
  asks: NormalizedLevel[];
  bids: NormalizedLevel[];
};

/**
 * Build order book from raw open4dev orders.
 *
 * For pair fromSymbol/toSymbol (e.g. TON/NOT), display price = fromSymbol per toSymbol.
 *
 * Bids (buying toSymbol with fromSymbol):
 *   Orders: from_coin = fromSymbol, to_coin = toSymbol
 *   price_rate = toSymbol per fromSymbol (how much toSymbol you get per fromSymbol)
 *   Display price = 1 / price_rate
 *   Amount in toSymbol = order.amount * price_rate
 *
 * Asks (selling toSymbol for fromSymbol):
 *   Orders: from_coin = toSymbol, to_coin = fromSymbol
 *   price_rate = fromSymbol per toSymbol (directly the display price)
 *   Amount in toSymbol = order.amount
 */
function normalizeOpen4dev(bidOrders: DexOrder[], askOrders: DexOrder[]): NormalizedBook {
  // Aggregate bids by price level
  const bidMap = new Map<string, { price: number; amount: number; count: number }>();
  for (const o of bidOrders) {
    if (o.price_rate <= 0 || o.amount <= 0) continue;
    const displayPrice = 1 / o.price_rate;
    const key = displayPrice.toPrecision(6);
    const existing = bidMap.get(key);
    const amountInToSymbol = o.amount * o.price_rate;
    if (existing) {
      existing.amount += amountInToSymbol;
      existing.count += 1;
    } else {
      bidMap.set(key, { price: displayPrice, amount: amountInToSymbol, count: 1 });
    }
  }

  // Aggregate asks by price level
  const askMap = new Map<string, { price: number; amount: number; count: number }>();
  for (const o of askOrders) {
    if (o.price_rate <= 0 || o.amount <= 0) continue;
    const displayPrice = o.price_rate;
    const key = displayPrice.toPrecision(6);
    const existing = askMap.get(key);
    if (existing) {
      existing.amount += o.amount;
      existing.count += 1;
    } else {
      askMap.set(key, { price: displayPrice, amount: o.amount, count: 1 });
    }
  }

  const bids: NormalizedLevel[] = [...bidMap.values()]
    .map((v) => ({ price: v.price, amount: v.amount, orderCount: v.count }))
    .sort((a, b) => b.price - a.price); // highest bid first

  const asks: NormalizedLevel[] = [...askMap.values()]
    .map((v) => ({ price: v.price, amount: v.amount, orderCount: v.count }))
    .sort((a, b) => a.price - b.price); // lowest ask first

  return { asks, bids };
}

/* ---------- stats from normalized book ---------- */

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

type RealPairStats24h = {
  bidOrders: number | null;
  askOrders: number | null;
  bidVolume: number | null;
  askVolume: number | null;
  bidVolumeSymbol: string;
  askVolumeSymbol: string;
};

function computeStats(normalized: NormalizedBook): BookStats {
  const totalAskOrders = normalized.asks.reduce((s, a) => s + a.orderCount, 0);
  const totalBidOrders = normalized.bids.reduce((s, b) => s + b.orderCount, 0);
  const totalAskAmount = normalized.asks.reduce((s, a) => s + a.amount, 0);
  const totalBidAmount = normalized.bids.reduce((s, b) => s + b.amount, 0);
  const bestAsk = normalized.asks.length > 0 ? normalized.asks[0].price : null;
  const bestBid = normalized.bids.length > 0 ? normalized.bids[0].price : null;
  const spread = bestAsk != null && bestBid != null ? bestAsk - bestBid : null;
  const spreadPct = spread != null && bestBid != null && bestBid > 0
    ? (spread / ((bestAsk! + bestBid) / 2)) * 100
    : null;
  return { totalAskOrders, totalBidOrders, totalAskAmount, totalBidAmount, bestAsk, bestBid, spread, spreadPct };
}

/* ---------- OrderBookTable (reusable) ---------- */

type OrderBookTableProps = {
  normalized: NormalizedBook;
  stats: BookStats;
  fromUpper: string;
  toUpper: string;
  fromPriceUsd: number | null;
  amountPriceUsd: number | null;
  refreshTick: number;
  sourceLabel?: string;
  realStats24h?: RealPairStats24h | null;
};

function OrderBookTable({
  normalized,
  stats,
  fromUpper,
  toUpper,
  fromPriceUsd,
  amountPriceUsd,
  refreshTick,
  sourceLabel,
  realStats24h,
}: OrderBookTableProps) {
  const maxAmount = useMemo(() => {
    const maxAsk = Math.max(...normalized.asks.map((a) => a.amount), 0);
    const maxBid = Math.max(...normalized.bids.map((b) => b.amount), 0);
    return Math.max(maxAsk, maxBid);
  }, [normalized]);

  const asksReversed = useMemo(() => [...normalized.asks].reverse(), [normalized.asks]);

  const bidOrders = realStats24h?.bidOrders ?? stats.totalBidOrders;
  const askOrders = realStats24h?.askOrders ?? stats.totalAskOrders;
  const bidVolume = realStats24h?.bidVolume ?? stats.totalBidAmount;
  const askVolume = realStats24h?.askVolume ?? stats.totalAskAmount;
  const bidVolumeSymbol = realStats24h?.bidVolumeSymbol ?? toUpper;
  const askVolumeSymbol = realStats24h?.askVolumeSymbol ?? toUpper;
  const bidVolumeUsd = bidVolumeSymbol.toUpperCase() === fromUpper
    ? (fromPriceUsd != null ? bidVolume * fromPriceUsd : null)
    : bidVolumeSymbol.toUpperCase() === toUpper
      ? (amountPriceUsd != null ? bidVolume * amountPriceUsd : null)
      : null;
  const askVolumeUsd = askVolumeSymbol.toUpperCase() === fromUpper
    ? (fromPriceUsd != null ? askVolume * fromPriceUsd : null)
    : askVolumeSymbol.toUpperCase() === toUpper
      ? (amountPriceUsd != null ? askVolume * amountPriceUsd : null)
      : null;

  return (
    <div className="card bg-base-200 shadow-md overflow-hidden flex-1 min-w-0">
      <div className="card-body p-0">
        {/* Source label */}
        {sourceLabel && (
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold opacity-50 border-b border-base-content/5 bg-base-300/30">
            {sourceLabel}
          </div>
        )}

        {/* Column header */}
        <div className="flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-wider opacity-40 border-b border-base-content/5">
          <span className="w-28 sm:w-36 text-right">Price ({fromUpper})</span>
          <span className="flex-1 text-right">Amount ({toUpper})</span>
          <span className="w-16 text-right hidden sm:block">USD</span>
          <span className="w-10 text-right">Qty</span>
        </div>

        {/* ---- ASKS (reversed: highest at top, lowest near spread) ---- */}
        {asksReversed.length === 0 ? (
          <div className="text-center py-4 text-xs opacity-40">No asks</div>
        ) : (
          <div className="flex flex-col">
            {asksReversed.map((lvl, i) => {
              const pct = maxAmount > 0 ? (lvl.amount / maxAmount) * 100 : 0;
              const usdVal = amountPriceUsd != null ? lvl.amount * amountPriceUsd : null;
              return (
                <div
                  key={`ask-${i}-${refreshTick}`}
                  className="relative flex items-center gap-2 px-3 py-1 text-xs mono animate-[rowFlash_0.6s_ease-out]"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div
                    className="absolute inset-y-0 right-0 bg-error/10 transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                  <span className="relative z-10 w-28 sm:w-36 text-right text-error font-medium">
                    {fmtRate(lvl.price)}
                  </span>
                  <span className="relative z-10 flex-1 text-right">
                    {fmtAmount(lvl.amount)}
                  </span>
                  <span className="relative z-10 w-16 text-right opacity-40 text-[10px] hidden sm:block">
                    {usdVal != null ? fmtUsd(usdVal) : ''}
                  </span>
                  <span className="relative z-10 w-10 text-right opacity-50">
                    {lvl.orderCount}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* ---- SPREAD BAR ---- */}
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-y border-base-content/10 bg-base-300/50">
          <span className="text-xs font-bold tracking-tight mr-1">
            {fromUpper} / {toUpper}
          </span>

          {stats.bestBid != null && (
            <span className="badge badge-xs badge-ghost gap-1 mono">
              <span className="opacity-50">Bid</span>
              <span className="text-success font-semibold">{fmtRate(stats.bestBid)}</span>
            </span>
          )}

          {stats.bestAsk != null && (
            <span className="badge badge-xs badge-ghost gap-1 mono">
              <span className="opacity-50">Ask</span>
              <span className="text-error font-semibold">{fmtRate(stats.bestAsk)}</span>
            </span>
          )}

          {stats.spreadPct != null && (
            <span className="badge badge-xs badge-ghost gap-1 mono">
              <span className="opacity-50">Spread</span>
              <span className="font-semibold">{stats.spreadPct.toFixed(2)}%</span>
            </span>
          )}

          <span className="badge badge-xs badge-ghost gap-1 mono">
            <span className="opacity-50">{realStats24h ? 'Bid Vol 24h' : 'Bid Vol'}</span>
            <span className="text-success font-semibold">{fmtAmount(bidVolume)}</span>
            <span className="opacity-40">{bidVolumeSymbol}</span>
            {bidVolumeUsd != null && (
              <span className="opacity-40 hidden sm:inline">~{fmtUsd(bidVolumeUsd)}</span>
            )}
          </span>

          <span className="badge badge-xs badge-ghost gap-1 mono">
            <span className="opacity-50">{realStats24h ? 'Ask Vol 24h' : 'Ask Vol'}</span>
            <span className="text-error font-semibold">{fmtAmount(askVolume)}</span>
            <span className="opacity-40">{askVolumeSymbol}</span>
            {askVolumeUsd != null && (
              <span className="opacity-40 hidden sm:inline">~{fmtUsd(askVolumeUsd)}</span>
            )}
          </span>

          <span className="ml-auto flex items-center gap-2 text-[10px] opacity-50">
            <span className="text-success">{bidOrders}{realStats24h ? ' bids (24h)' : ' bids'}</span>
            <span className="opacity-30">|</span>
            <span className="text-error">{askOrders}{realStats24h ? ' asks (24h)' : ' asks'}</span>
          </span>
        </div>
        
        {/* ---- BIDS (highest price at top, closest to spread) ---- */}
        {normalized.bids.length === 0 ? (
          <div className="text-center py-4 text-xs opacity-40">No bids</div>
        ) : (
          <div className="flex flex-col">
            {normalized.bids.map((lvl, i) => {
              const pct = maxAmount > 0 ? (lvl.amount / maxAmount) * 100 : 0;
              const usdVal = amountPriceUsd != null ? lvl.amount * amountPriceUsd : null;
              return (
                <div
                  key={`bid-${i}-${refreshTick}`}
                  className="relative flex items-center gap-2 px-3 py-1 text-xs mono animate-[rowFlash_0.6s_ease-out]"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div
                    className="absolute inset-y-0 right-0 bg-success/10 transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                  <span className="relative z-10 w-28 sm:w-36 text-right text-success font-medium">
                    {fmtRate(lvl.price)}
                  </span>
                  <span className="relative z-10 flex-1 text-right">
                    {fmtAmount(lvl.amount)}
                  </span>
                  <span className="relative z-10 w-16 text-right opacity-40 text-[10px] hidden sm:block">
                    {usdVal != null ? fmtUsd(usdVal) : ''}
                  </span>
                  <span className="relative z-10 w-10 text-right opacity-50">
                    {lvl.orderCount}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- main component ---------- */

type StatsPageProps = {
  raceCfg: PublicApiConfig;
  pairSlug?: string | null;
  onPairChange?: (slug: string) => void;
};

export function StatsPage({ raceCfg, pairSlug, onPairChange }: StatsPageProps) {
  const [selectedPairIdx, setSelectedPairIdx] = useState(() => pairIdxFromSlug(pairSlug ?? null));
  const [reversed, setReversed] = useState(false);
  const [tokenPrices, setTokenPrices] = useState<Map<string, number>>(new Map());

  // Open4dev order book state
  const [book, setBook] = useState<NormalizedBook | null>(null);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [realStats24h, setRealStats24h] = useState<RealPairStats24h | null>(null);

  const pairs = DEFAULT_PAIRS;
  const currentPair = pairs[selectedPairIdx] ?? pairs[0];

  const effectivePair = useMemo(() => {
    if (!reversed) return currentPair;
    return {
      ...currentPair,
      label: `${currentPair.toSymbol} / ${currentPair.fromSymbol}`,
      fromSymbol: currentPair.toSymbol,
      toSymbol: currentPair.fromSymbol,
    };
  }, [currentPair, reversed]);

  // Counter bumped on every successful refresh — drives row flash animation
  const [refreshTick, setRefreshTick] = useState(0);

  const fetchBook = useCallback(async (silent = false) => {
    const fromCoinId = COIN_IDS[effectivePair.fromSymbol];
    const toCoinId = COIN_IDS[effectivePair.toSymbol];
    if (fromCoinId == null || toCoinId == null) {
      if (!silent) setBookError(`Unknown coin ID for ${effectivePair.fromSymbol} or ${effectivePair.toSymbol}`);
      return;
    }
    if (!silent) { setBookLoading(true); setBookError(null); }
    try {
      const [bidOrders, askOrders] = await Promise.all([
        getDexOrdersByPair(fromCoinId, toCoinId, { limit: 200 }),
        getDexOrdersByPair(toCoinId, fromCoinId, { limit: 200 }),
      ]);
      const normalized = normalizeOpen4dev(bidOrders, askOrders);
      setBook(normalized);
      setRefreshTick((t) => t + 1);
    } catch (e) {
      if (!silent) setBookError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!silent) setBookLoading(false);
    }
  }, [effectivePair.fromSymbol, effectivePair.toSymbol]);

  const fetchTradingStats = useCallback(async () => {
    try {
      const [bidSide, askSide] = await Promise.all([
        getDexTradingStats(effectivePair.fromSymbol, effectivePair.toSymbol),
        getDexTradingStats(effectivePair.toSymbol, effectivePair.fromSymbol),
      ]);

      const bid24h = bidSide.periods.find((p) => p.period === '24h') ?? null;
      const ask24h = askSide.periods.find((p) => p.period === '24h') ?? null;

      setRealStats24h({
        bidOrders: bid24h?.total_orders ?? null,
        askOrders: ask24h?.total_orders ?? null,
        bidVolume: bid24h?.total_volume ?? null,
        askVolume: ask24h?.total_volume ?? null,
        bidVolumeSymbol: effectivePair.fromSymbol,
        askVolumeSymbol: effectivePair.toSymbol,
      });
    } catch {
      setRealStats24h(null);
    }
  }, [effectivePair.fromSymbol, effectivePair.toSymbol]);

  // Initial load + auto-refresh every 10s
  useEffect(() => {
    void fetchBook();
    const id = setInterval(() => void fetchBook(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchBook]);

  // Real market stats/volume from open4dev trading-stats API
  useEffect(() => {
    void fetchTradingStats();
    const id = setInterval(() => void fetchTradingStats(), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchTradingStats]);

  // Fetch token USD prices once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tokens = await getRaceTokens(raceCfg);
        if (cancelled) return;
        const map = new Map<string, number>();
        for (const t of tokens) {
          if (t.price_usd > 0) map.set(t.symbol.toUpperCase(), t.price_usd);
        }
        setTokenPrices(map);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [raceCfg]);

  const priceOf = useCallback((sym: string): number | null => {
    const upper = sym.toUpperCase();
    const p = tokenPrices.get(upper);
    if (p != null) return p;
    if (upper.startsWith('J')) {
      const fallback = tokenPrices.get(upper.slice(1));
      if (fallback != null) return fallback;
    }
    return null;
  }, [tokenPrices]);

  const normalized = useMemo(() => {
    if (!book) return null;
    return book;
  }, [book]);

  const stats = useMemo(() => {
    if (!normalized) return null;
    return computeStats(normalized);
  }, [normalized]);

  // Amount is always in toSymbol
  const fromPriceUsd = priceOf(effectivePair.fromSymbol);
  const amountPriceUsd = priceOf(effectivePair.toSymbol);
  const fromUpper = effectivePair.fromSymbol;
  const toUpper = effectivePair.toSymbol;

  const selectPair = useCallback((idx: number) => {
    setSelectedPairIdx(idx);
    setReversed(false);
    onPairChange?.(pairs[idx].slug);
  }, [onPairChange, pairs]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <BarChart3 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Order Book</h1>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
            <p className="text-xs opacity-50">Live from open4dev DEX</p>
          </div>
        </div>
      </div>

      {/* Pair Switcher */}
      <div className="flex flex-wrap items-center gap-2">
        {pairs.map((p, idx) => (
          <button
            key={p.slug}
            className={`btn btn-xs ${
              selectedPairIdx === idx && !reversed
                ? 'btn-primary'
                : 'btn-ghost border border-base-content/10'
            }`}
            onClick={() => selectPair(idx)}
            type="button"
          >
            {p.label}
          </button>
        ))}
        <button
          className="btn btn-ghost btn-xs gap-1 opacity-60 hover:opacity-100"
          onClick={() => setReversed((r) => !r)}
          type="button"
          title="Reverse pair"
        >
          <ArrowDownUp className="h-3 w-3" />
          Flip
        </button>
      </div>

      {/* Order Book */}
      {bookError ? (
        <div className="card bg-base-200 shadow-md">
          <div className="card-body">
            <div className="text-sm text-error">{bookError}</div>
          </div>
        </div>
      ) : bookLoading && !book ? (
        <div className="card bg-base-200 shadow-md">
          <div className="card-body">
            <div className="flex justify-center py-10">
              <span className="loading loading-spinner loading-md" />
            </div>
          </div>
        </div>
      ) : normalized && stats ? (
        <OrderBookTable
          normalized={normalized}
          stats={stats}
          fromUpper={fromUpper}
          toUpper={toUpper}
          fromPriceUsd={fromPriceUsd}
          amountPriceUsd={amountPriceUsd}
          refreshTick={refreshTick}
          sourceLabel="Open4Dev (aggregated)"
          realStats24h={realStats24h}
        />
      ) : null}
    </div>
  );
}
