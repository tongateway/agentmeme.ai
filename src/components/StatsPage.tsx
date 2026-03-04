import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ArrowDownUp } from 'lucide-react';
import {
  getOrderScannerBook,
  getOrderScannerStats,
  getDexOrdersByPair,
  getRaceTokens,
  type ScannerBookResponse,
  type ScannerStatsResponse,
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
  baseVault: string;
  quoteVault: string;
};

/** Only pairs whose both vaults exist */
const DEFAULT_PAIRS: TradingPair[] = [
  {
    slug: 'TON-NOT',
    label: 'TON / NOT',
    fromSymbol: 'TON',
    toSymbol: 'NOT',
    // NOT vault (jetton) / TON vault
    baseVault: 'EQAD7f1rDyPODd6XYfORpVoKP6ZgEOVKCzu4U2dws_gjR7fS',
    quoteVault: 'EQA0_4nl1-biEvpzengd5M3GNTt1PRYGIIEHlfanEl3tZkRr',
  },
  {
    slug: 'TON-BUILD',
    label: 'TON / BUILD',
    fromSymbol: 'TON',
    toSymbol: 'BUILD',
    // BUILD vault (jetton) / TON vault
    baseVault: 'EQCxWoj_Yxgeh-sRS1MjR7YuqzVLHrOpVFz9neN-Hn1eSYUC',
    quoteVault: 'EQA0_4nl1-biEvpzengd5M3GNTt1PRYGIIEHlfanEl3tZkRr',
  },
  {
    slug: 'NOT-BUILD',
    label: 'NOT / BUILD',
    fromSymbol: 'NOT',
    toSymbol: 'BUILD',
    baseVault: 'EQCxWoj_Yxgeh-sRS1MjR7YuqzVLHrOpVFz9neN-Hn1eSYUC',
    quoteVault: 'EQAD7f1rDyPODd6XYfORpVoKP6ZgEOVKCzu4U2dws_gjR7fS',
  },
  {
    slug: 'TON-DOGS',
    label: 'TON / DOGS',
    fromSymbol: 'TON',
    toSymbol: 'DOGS',
    baseVault: 'EQClIJo99DbIH56sUAnTK0wrdH3_i-_rcxl24CmIhlmGl17i',
    quoteVault: 'EQA0_4nl1-biEvpzengd5M3GNTt1PRYGIIEHlfanEl3tZkRr',
  },
  {
    slug: 'TON-NOTPIXEL',
    label: 'TON / NOT PIXEL',
    fromSymbol: 'TON',
    toSymbol: 'PX',
    baseVault: 'EQC1dcxtmYFpKETQ_TA6fA5LfnmLwPYqAWg2M94WWSajEF_Y',
    quoteVault: 'EQA0_4nl1-biEvpzengd5M3GNTt1PRYGIIEHlfanEl3tZkRr',
  },
  {
    slug: 'TON-XAUT',
    label: 'TON / XAUt',
    fromSymbol: 'TON',
    toSymbol: 'XAUT0',
    baseVault: 'EQClbgXPqGsSzPRfu8p6WKJwdjs1-14JI6m3tJ4-umB_omK1',
    quoteVault: 'EQA0_4nl1-biEvpzengd5M3GNTt1PRYGIIEHlfanEl3tZkRr',
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

/**
 * Scanner API (base=toSymbol, quote=fromSymbol):
 *   price  = base per quote (toSymbol per fromSymbol)
 *   size   = quote amount (fromSymbol)
 *   total  = base amount (toSymbol)
 *
 * We display:
 *   price  = fromSymbol per toSymbol = 1 / api_price
 *   amount = toSymbol amount = api total
 */
type NormalizedLevel = {
  price: number;       // fromSymbol per toSymbol
  amount: number;      // in toSymbol
  orderCount: number;
};

type NormalizedBook = {
  asks: NormalizedLevel[];
  bids: NormalizedLevel[];
};

function normalizeScanner(book: ScannerBookResponse): NormalizedBook {
  const asks: NormalizedLevel[] = book.asks
    .filter((a) => a.price > 0)
    .map((a) => ({
      price: 1 / a.price,
      amount: a.total,
      orderCount: a.orderCount,
    }));

  const bids: NormalizedLevel[] = book.bids
    .filter((b) => b.price > 0)
    .map((b) => ({
      price: 1 / b.price,
      amount: b.total,
      orderCount: b.orderCount,
    }));

  // Sort asks: lowest price first (closest to spread)
  asks.sort((a, b) => a.price - b.price);
  // Sort bids: highest price first (closest to spread)
  bids.sort((a, b) => b.price - a.price);

  return { asks, bids };
}

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
  amountPriceUsd: number | null;
  refreshTick: number;
  sourceLabel?: string;
};

function OrderBookTable({ normalized, stats, fromUpper, toUpper, amountPriceUsd, refreshTick, sourceLabel }: OrderBookTableProps) {
  const maxAmount = useMemo(() => {
    const maxAsk = Math.max(...normalized.asks.map((a) => a.amount), 0);
    const maxBid = Math.max(...normalized.bids.map((b) => b.amount), 0);
    return Math.max(maxAsk, maxBid);
  }, [normalized]);

  const asksReversed = useMemo(() => [...normalized.asks].reverse(), [normalized.asks]);

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
        <div className="flex items-center gap-3 px-3 py-2 border-y border-base-content/10 bg-base-300/50">
          <span className="text-xs font-bold tracking-tight">
            {fromUpper} / {toUpper}
          </span>
          {stats.spreadPct != null && (
            <span className="badge badge-xs badge-ghost mono">
              Spread {stats.spreadPct.toFixed(2)}%
            </span>
          )}
          <span className="flex-1" />
          <div className="flex items-center gap-2 text-[10px] opacity-50">
            <span className="text-success">{stats.totalBidOrders} bids</span>
            <span className="opacity-30">|</span>
            <span className="text-error">{stats.totalAskOrders} asks</span>
          </div>
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

/* ---------- stat badges row ---------- */

function StatBadges({ stats, toUpper, priceOfToSymbol }: {
  stats: BookStats;
  toUpper: string;
  priceOfToSymbol: number | null;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {stats.bestBid != null && (
        <div className="badge badge-lg gap-1.5 py-3">
          <span className="text-[10px] opacity-50">Best Bid</span>
          <span className="text-xs font-semibold mono text-success">{fmtRate(stats.bestBid)}</span>
        </div>
      )}
      {stats.bestAsk != null && (
        <div className="badge badge-lg gap-1.5 py-3">
          <span className="text-[10px] opacity-50">Best Ask</span>
          <span className="text-xs font-semibold mono text-error">{fmtRate(stats.bestAsk)}</span>
        </div>
      )}
      {stats.spreadPct != null && (
        <div className="badge badge-lg gap-1.5 py-3">
          <span className="text-[10px] opacity-50">Spread</span>
          <span className="text-xs font-semibold mono">{stats.spreadPct.toFixed(2)}%</span>
        </div>
      )}
      <div className="badge badge-lg gap-1.5 py-3">
        <span className="text-[10px] opacity-50">Bid Vol</span>
        <span className="text-xs font-semibold mono text-success">{fmtAmount(stats.totalBidAmount)}</span>
        <span className="text-[10px] opacity-40">{toUpper}</span>
        {priceOfToSymbol != null && (
          <span className="text-[10px] opacity-40 mono">~{fmtUsd(stats.totalBidAmount * priceOfToSymbol)}</span>
        )}
      </div>
      <div className="badge badge-lg gap-1.5 py-3">
        <span className="text-[10px] opacity-50">Ask Vol</span>
        <span className="text-xs font-semibold mono text-error">{fmtAmount(stats.totalAskAmount)}</span>
        <span className="text-[10px] opacity-40">{toUpper}</span>
        {priceOfToSymbol != null && (
          <span className="text-[10px] opacity-40 mono">~{fmtUsd(stats.totalAskAmount * priceOfToSymbol)}</span>
        )}
      </div>
    </div>
  );
}

/* ---------- pair stats card ---------- */

function StatWindow({ label, open, completed, volumeUsd, highlight }: {
  label: string;
  open: number;
  completed: number;
  volumeUsd: string;
  highlight?: boolean;
}) {
  const total = open + completed;
  const completionPct = total > 0 ? (completed / total) * 100 : 0;
  const volNum = parseFloat(volumeUsd);

  return (
    <div className={`flex-1 min-w-[7rem] px-3 py-2.5 rounded-lg relative overflow-hidden ${
      highlight ? 'bg-base-300/80' : 'bg-base-300/40'
    }`}>
      {/* Completion bar background */}
      <div
        className="absolute bottom-0 left-0 h-[2px] bg-success/40 transition-all duration-700"
        style={{ width: `${completionPct}%` }}
      />

      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">{label}</span>
        {volNum > 0 && (
          <span className="text-[9px] mono opacity-30">{fmtUsd(volNum)}</span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-bold mono text-info leading-none">{open.toLocaleString()}</span>
          <span className="text-[9px] opacity-30">open</span>
        </div>
        <div className="text-[10px] opacity-20">/</div>
        <div className="flex items-baseline gap-1">
          <span className="text-sm font-bold mono text-success leading-none">{completed.toLocaleString()}</span>
          <span className="text-[9px] opacity-30">filled</span>
        </div>
      </div>
    </div>
  );
}

function PairStatsCard({ stats, fromSymbol, toSymbol }: {
  stats: ScannerStatsResponse;
  fromSymbol: string;
  toSymbol: string;
}) {
  const w1h = stats.windows['1h'];
  const w24h = stats.windows['24h'];
  const wAll = stats.windows.all_time;

  return (
    <div className="rounded-xl border border-base-content/5 bg-base-200/60 p-3">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3.5 rounded-full bg-info/60" />
          <span className="text-[11px] font-bold tracking-tight opacity-70">
            {fromSymbol}/{toSymbol} Activity
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] mono opacity-20 hidden sm:inline" title={`Base: ${stats.scope.base_vault_friendly}`}>
            {stats.scope.base_vault_friendly.slice(0, 8)}...{stats.scope.base_vault_friendly.slice(-4)}
          </span>
          <div className="h-2 w-2 rounded-full bg-success/50 animate-pulse" />
        </div>
      </div>

      {/* Windows strip */}
      <div className="flex gap-2">
        <StatWindow label="1H" open={w1h.open_orders} completed={w1h.completed_orders} volumeUsd={w1h.volume_usd} />
        <StatWindow label="24H" open={w24h.open_orders} completed={w24h.completed_orders} volumeUsd={w24h.volume_usd} />
        <StatWindow label="All" open={wAll.open_orders} completed={wAll.completed_orders} volumeUsd={wAll.volume_usd} highlight />
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

  // Scanner order book state
  const [book, setBook] = useState<ScannerBookResponse | null>(null);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);

  // Open4dev order book state
  const [showOpen4dev, setShowOpen4dev] = useState(false);
  const [o4dNormalized, setO4dNormalized] = useState<NormalizedBook | null>(null);
  const [o4dLoading, setO4dLoading] = useState(false);
  const [o4dError, setO4dError] = useState<string | null>(null);

  // Order scanner stats state
  const [pairStats, setPairStats] = useState<ScannerStatsResponse | null>(null);

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

  // Track whether this is the very first load (show spinner) vs background refresh
  const hasLoadedOnce = useRef(false);
  // Counter bumped on every successful refresh — drives row flash animation
  const [refreshTick, setRefreshTick] = useState(0);
  const [o4dRefreshTick, setO4dRefreshTick] = useState(0);

  // --- Scanner book fetch ---
  const fetchBook = useCallback(async (silent = false) => {
    const { baseVault, quoteVault } = effectivePair;
    if (!baseVault || !quoteVault) {
      if (!silent) setBookError(`No vault address for pair ${effectivePair.fromSymbol}/${effectivePair.toSymbol}`);
      return;
    }
    if (!silent) { setBookLoading(true); setBookError(null); }
    try {
      const data = await getOrderScannerBook({ baseVault, quoteVault, levels: 15 });
      setBook(data);
      setRefreshTick((t) => t + 1);
      hasLoadedOnce.current = true;
    } catch (e) {
      if (!silent) setBookError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!silent) setBookLoading(false);
    }
  }, [effectivePair]);

  // --- Open4dev book fetch ---
  const fetchOpen4devBook = useCallback(async (silent = false) => {
    const fromCoinId = COIN_IDS[effectivePair.fromSymbol];
    const toCoinId = COIN_IDS[effectivePair.toSymbol];
    if (fromCoinId == null || toCoinId == null) {
      if (!silent) setO4dError(`Unknown coin ID for ${effectivePair.fromSymbol} or ${effectivePair.toSymbol}`);
      return;
    }
    if (!silent) { setO4dLoading(true); setO4dError(null); }
    try {
      // Fetch both directions in parallel
      const [bidOrders, askOrders] = await Promise.all([
        getDexOrdersByPair(fromCoinId, toCoinId, { limit: 200 }),
        getDexOrdersByPair(toCoinId, fromCoinId, { limit: 200 }),
      ]);
      const normalized = normalizeOpen4dev(bidOrders, askOrders);
      setO4dNormalized(normalized);
      setO4dRefreshTick((t) => t + 1);
    } catch (e) {
      if (!silent) setO4dError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!silent) setO4dLoading(false);
    }
  }, [effectivePair]);

  // Initial load + auto-refresh every 10s (scanner)
  useEffect(() => {
    hasLoadedOnce.current = false;
    void fetchBook();
    const id = setInterval(() => void fetchBook(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchBook]);

  // Fetch open4dev book when enabled + auto-refresh
  useEffect(() => {
    if (!showOpen4dev) return;
    void fetchOpen4devBook();
    const id = setInterval(() => void fetchOpen4devBook(true), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [showOpen4dev, fetchOpen4devBook]);

  // Reset open4dev data when pair changes
  useEffect(() => {
    setO4dNormalized(null);
    setO4dError(null);
  }, [effectivePair]);

  // Fetch order-scanner stats for the active pair (same vaults)
  useEffect(() => {
    const { baseVault, quoteVault } = effectivePair;
    if (!baseVault || !quoteVault) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getOrderScannerStats({ baseVault, quoteVault });
        if (!cancelled) setPairStats(data);
      } catch {
        if (!cancelled) setPairStats(null);
      }
    };
    void load();
    const id = setInterval(() => void load(), AUTO_REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [effectivePair]);

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

  // Normalize the scanner response
  const scannerNormalized = useMemo(() => {
    if (!book) return null;
    return normalizeScanner(book);
  }, [book]);

  // Stats for scanner book
  const scannerStats = useMemo(() => {
    if (!scannerNormalized) return null;
    return computeStats(scannerNormalized);
  }, [scannerNormalized]);

  // Stats for open4dev book
  const o4dStats = useMemo(() => {
    if (!o4dNormalized) return null;
    return computeStats(o4dNormalized);
  }, [o4dNormalized]);

  // Amount is always in toSymbol
  const amountPriceUsd = priceOf(effectivePair.toSymbol);
  const fromUpper = effectivePair.fromSymbol;
  const toUpper = effectivePair.toSymbol;

  // Handler for pair buttons
  const selectPair = useCallback((idx: number, source: 'scanner' | 'open4dev') => {
    setSelectedPairIdx(idx);
    setReversed(false);
    onPairChange?.(pairs[idx].slug);
    if (source === 'open4dev') {
      setShowOpen4dev(true);
    } else {
      setShowOpen4dev(false);
    }
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

      {/* Pair Switcher — two rows */}
      <div className="flex flex-col gap-2">
        {/* Row 1: Scanner pairs */}
        <div className="flex flex-wrap items-center gap-2">
          {pairs.map((p, idx) => (
            <button
              key={`scanner-${p.slug}`}
              className={`btn btn-xs ${
                selectedPairIdx === idx && !reversed && !showOpen4dev
                  ? 'btn-primary'
                  : 'btn-ghost border border-base-content/10'
              }`}
              onClick={() => selectPair(idx, 'scanner')}
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

        {/* Row 2: Open4dev pairs */}
        <div className="flex flex-wrap items-center gap-2">
          {pairs.map((p, idx) => (
            <button
              key={`o4d-${p.slug}`}
              className={`btn btn-xs ${
                selectedPairIdx === idx && !reversed && showOpen4dev
                  ? 'btn-secondary'
                  : 'btn-ghost border border-base-content/10'
              }`}
              onClick={() => selectPair(idx, 'open4dev')}
              type="button"
            >
              {p.label} <span className="opacity-50">(open4dev)</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stat badges — scanner */}
      {scannerStats && !bookLoading && (
        <StatBadges stats={scannerStats} toUpper={toUpper} priceOfToSymbol={amountPriceUsd} />
      )}

      {/* Pair stats from order-scanner */}
      {pairStats && (
        <PairStatsCard stats={pairStats} fromSymbol={fromUpper} toSymbol={toUpper} />
      )}

      {/* Order Book(s) */}
      {bookError && !showOpen4dev ? (
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
      ) : showOpen4dev ? (
        /* --- Side-by-side comparison mode --- */
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Scanner book */}
          {scannerNormalized && scannerStats ? (
            <OrderBookTable
              normalized={scannerNormalized}
              stats={scannerStats}
              fromUpper={fromUpper}
              toUpper={toUpper}
              amountPriceUsd={amountPriceUsd}
              refreshTick={refreshTick}
              sourceLabel="Order Scanner (aggregated)"
            />
          ) : bookError ? (
            <div className="card bg-base-200 shadow-md flex-1">
              <div className="card-body">
                <div className="text-[10px] uppercase tracking-wider font-semibold opacity-50 mb-2">Order Scanner</div>
                <div className="text-sm text-error">{bookError}</div>
              </div>
            </div>
          ) : (
            <div className="card bg-base-200 shadow-md flex-1">
              <div className="card-body">
                <div className="flex justify-center py-10">
                  <span className="loading loading-spinner loading-md" />
                </div>
              </div>
            </div>
          )}

          {/* Open4dev book */}
          {o4dLoading && !o4dNormalized ? (
            <div className="card bg-base-200 shadow-md flex-1">
              <div className="card-body">
                <div className="text-[10px] uppercase tracking-wider font-semibold opacity-50 mb-2">Open4Dev API (raw orders)</div>
                <div className="flex justify-center py-10">
                  <span className="loading loading-spinner loading-md" />
                </div>
              </div>
            </div>
          ) : o4dError ? (
            <div className="card bg-base-200 shadow-md flex-1">
              <div className="card-body">
                <div className="text-[10px] uppercase tracking-wider font-semibold opacity-50 mb-2">Open4Dev API</div>
                <div className="text-sm text-error">{o4dError}</div>
              </div>
            </div>
          ) : o4dNormalized && o4dStats ? (
            <OrderBookTable
              normalized={o4dNormalized}
              stats={o4dStats}
              fromUpper={fromUpper}
              toUpper={toUpper}
              amountPriceUsd={amountPriceUsd}
              refreshTick={o4dRefreshTick}
              sourceLabel="Open4Dev API (raw orders)"
            />
          ) : null}
        </div>
      ) : scannerNormalized && scannerStats ? (
        /* --- Single scanner book (default) --- */
        <OrderBookTable
          normalized={scannerNormalized}
          stats={scannerStats}
          fromUpper={fromUpper}
          toUpper={toUpper}
          amountPriceUsd={amountPriceUsd}
          refreshTick={refreshTick}
        />
      ) : null}
    </div>
  );
}
