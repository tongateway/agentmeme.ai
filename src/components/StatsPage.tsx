import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, ArrowDownUp } from 'lucide-react';
import {
  getDexCoinPrice,
  getDexOrderBook,
  getDexTradingStats,
  getOrderScannerStats,
  getRaceTokens,
  type DexOrderBookResponse,
  type DexTradingStatsPeriod,
  type PublicApiConfig,
  type ScannerStatsResponse,
  type ScannerStatsWindow,
} from '@/lib/api';

const AUTO_REFRESH_MS = 10_000; // 10 seconds

/* ---------- pair definitions ---------- */

type TradingPair = {
  slug: string;
  label: string;
  fromSymbol: string; // quote symbol (price denomination, e.g. TON)
  toSymbol: string; // base symbol (the asset, e.g. NOT)
  baseVault: string;
  quoteVault: string;
  hot?: boolean;
};

/** Only pairs whose both vaults exist */
const DEFAULT_PAIRS: TradingPair[] = [
  {
    slug: 'TON-AGNT',
    label: 'TON / AGNT',
    fromSymbol: 'TON',
    toSymbol: 'AGNT',
    baseVault: 'EQCfzBzukuhvyXvKwFXq9nffu_YRngAJugAuR5ibQ7Arcl1w',
    quoteVault: 'EQA0_4nl1-biEvpzengd5M3GNTt1PRYGIIEHlfanEl3tZkRr',
    hot: true,
  },
  {
    slug: 'USDT-AGNT',
    label: 'USDT / AGNT',
    fromSymbol: 'USDT',
    toSymbol: 'AGNT',
    baseVault: 'EQCfzBzukuhvyXvKwFXq9nffu_YRngAJugAuR5ibQ7Arcl1w',
    quoteVault: 'EQBrozHGTEwumr5ND62CpUXqmfYyi1UucbIj-15ZJnlFLe9U',
    hot: true,
  },
  {
    slug: 'TON-NOT',
    label: 'TON / NOT',
    fromSymbol: 'TON',
    toSymbol: 'NOT',
    baseVault: 'EQAD7f1rDyPODd6XYfORpVoKP6ZgEOVKCzu4U2dws_gjR7fS',
    quoteVault: 'EQA0_4nl1-biEvpzengd5M3GNTt1PRYGIIEHlfanEl3tZkRr',
  },
  {
    slug: 'TON-BUILD',
    label: 'TON / BUILD',
    fromSymbol: 'TON',
    toSymbol: 'BUILD',
    baseVault: 'EQCxWoj_Yxgeh-sRS1MjR7YuqzVLHrOpVFz9neN-Hn1eSYUC',
    quoteVault: 'EQA0_4nl1-biEvpzengd5M3GNTt1PRYGIIEHlfanEl3tZkRr',
  },
  {
    slug: 'TON-USDT',
    label: 'TON / USDT',
    fromSymbol: 'TON',
    toSymbol: 'USDT',
    baseVault: '',
    quoteVault: '',
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
  price: number; // fromSymbol per toSymbol
  amount: number; // in toSymbol
  orderCount: number;
};

type NormalizedBook = {
  asks: NormalizedLevel[];
  bids: NormalizedLevel[];
};

/**
 * Open4Dev order book API:
 *   price  = base per quote (toSymbol per fromSymbol)
 *   total_amount = base amount (toSymbol)
 *
 * We display:
 *   price  = fromSymbol per toSymbol = 1 / api_price
 *   amount = toSymbol amount = total_amount
 *
 * NOTE: Some orders have price_rate already in display format (inverted).
 * We detect this by comparing against mid_price — if price_rate is >1000×
 * smaller than mid_price, it's already inverted and should be used as-is.
 */
function normalizeOpen4DevBook(book: DexOrderBookResponse): NormalizedBook {
  const ref = book.mid_price ?? null;

  const toDisplayPrice = (priceRate: number): number => {
    if (ref != null && ref > 0 && priceRate < ref / 1000) return priceRate;
    return 1 / priceRate;
  };

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

type ActivityVolumeUsdByWindow = {
  '1h': number | null;
  '24h': number | null;
  max: number | null;
};

type TradingPeriodsState = {
  bid: DexTradingStatsPeriod[];
  ask: DexTradingStatsPeriod[];
};

function computeStats(normalized: NormalizedBook): BookStats {
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
  const bidVolumeUsd =
    bidVolumeSymbol.toUpperCase() === fromUpper
      ? fromPriceUsd != null
        ? bidVolume * fromPriceUsd
        : null
      : bidVolumeSymbol.toUpperCase() === toUpper
        ? amountPriceUsd != null
          ? bidVolume * amountPriceUsd
          : null
        : null;
  const askVolumeUsd =
    askVolumeSymbol.toUpperCase() === fromUpper
      ? fromPriceUsd != null
        ? askVolume * fromPriceUsd
        : null
      : askVolumeSymbol.toUpperCase() === toUpper
        ? amountPriceUsd != null
          ? askVolume * amountPriceUsd
          : null
        : null;
  const statsStrip = (classes: string) => (
    <div className={`flex flex-wrap items-center gap-1.5 px-3 py-2 ${classes}`}>
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
  );

  return (
    <div className="card bg-base-200 shadow-md overflow-hidden flex-1 min-w-0">
      <div className="card-body p-0">
        {statsStrip('border-b border-base-content/10 bg-base-300/40')}

        <div className="flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-wider opacity-40 border-b border-base-content/5">
          <span className="w-28 sm:w-36 text-right">Price ({fromUpper})</span>
          <span className="flex-1 text-right">Amount ({toUpper})</span>
          <span className="w-16 text-right hidden sm:block">USD</span>
          <span className="w-10 text-right">Qty</span>
        </div>

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
                  <span className="relative z-10 flex-1 text-right">{fmtAmount(lvl.amount)}</span>
                  <span className="relative z-10 w-16 text-right opacity-40 text-[10px] hidden sm:block">
                    {usdVal != null ? fmtUsd(usdVal) : ''}
                  </span>
                  <span className="relative z-10 w-10 text-right opacity-50">{lvl.orderCount}</span>
                </div>
              );
            })}
          </div>
        )}

        {statsStrip('border-y border-base-content/10 bg-base-300/50')}

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
                  <span className="relative z-10 flex-1 text-right">{fmtAmount(lvl.amount)}</span>
                  <span className="relative z-10 w-16 text-right opacity-40 text-[10px] hidden sm:block">
                    {usdVal != null ? fmtUsd(usdVal) : ''}
                  </span>
                  <span className="relative z-10 w-10 text-right opacity-50">{lvl.orderCount}</span>
                </div>
              );
            })}
          </div>
        )}
        {sourceLabel && (
          <div className="px-3 py-1.5 text-[10px] tracking-wide opacity-50 border-t border-base-content/5 bg-base-300/30 text-center">
            {sourceLabel}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- activity row ---------- */

function ActivityWindow({
  label,
  data,
  highlight,
  volumeUsdOverride,
}: {
  label: string;
  data: ScannerStatsWindow;
  highlight?: boolean;
  volumeUsdOverride?: number | null;
}) {
  const total = data.open_orders + data.completed_orders;
  const completionPct = total > 0 ? (data.completed_orders / total) * 100 : 0;
  const rawVolume =
    volumeUsdOverride ??
    Number(String(data.volume_usd ?? '0').replaceAll(',', '').trim());
  // Sanity cap: skip if volume looks broken (> $1B)
  const volume = Number.isFinite(rawVolume) && rawVolume > 0 && rawVolume < 1_000_000_000 ? rawVolume : 0;
  const volumeText = volume > 0 ? fmtUsd(volume) : '$0.00';

  return (
    <div
      className={`rounded-lg px-3 py-2.5 relative overflow-hidden border border-base-content/5 ${
        highlight ? 'bg-base-300/80' : 'bg-base-300/50'
      }`}
    >
      <div
        className="absolute left-0 bottom-0 h-[2px] bg-success/50 transition-all duration-700"
        style={{ width: `${completionPct}%` }}
      />
      <div className="text-[10px] uppercase tracking-widest font-semibold opacity-50 mb-2">{label}</div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-[9px] uppercase tracking-wide opacity-40">Open</div>
          <div className="text-sm font-semibold mono text-info">{data.open_orders.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide opacity-40">Filled</div>
          <div className="text-sm font-semibold mono text-success">{data.completed_orders.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide opacity-40">Volume</div>
          <div className="text-sm font-semibold mono opacity-75">{volumeText}</div>
        </div>
      </div>
    </div>
  );
}

function PairActivityRow({ stats, fromSymbol, toSymbol, volumeUsdByWindow }: {
  stats: ScannerStatsResponse;
  fromSymbol: string;
  toSymbol: string;
  volumeUsdByWindow?: ActivityVolumeUsdByWindow | null;
}) {
  return (
    <div className="rounded-xl border border-base-content/5 bg-base-200/60 p-3">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3.5 rounded-full bg-info/60" />
          <span className="text-[11px] font-bold tracking-tight opacity-70">
            {fromSymbol}/{toSymbol} Order Stats
          </span>
        </div>
        <div className="h-2 w-2 rounded-full bg-success/50 animate-pulse" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <ActivityWindow label="1H" data={stats.windows['1h']} volumeUsdOverride={volumeUsdByWindow?.['1h'] ?? null} />
        <ActivityWindow label="24H" data={stats.windows['24h']} volumeUsdOverride={volumeUsdByWindow?.['24h'] ?? null} />
        <ActivityWindow label="MAX" data={stats.windows.all_time} volumeUsdOverride={volumeUsdByWindow?.max ?? null} highlight />
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

  // Open4Dev order book state
  const [book, setBook] = useState<DexOrderBookResponse | null>(null);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [pairStats, setPairStats] = useState<ScannerStatsResponse | null>(null);
  const [realStats24h, setRealStats24h] = useState<RealPairStats24h | null>(null);
  const [tradingPeriods, setTradingPeriods] = useState<TradingPeriodsState | null>(null);

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

  const [refreshTick, setRefreshTick] = useState(0);

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
      setTradingPeriods({
        bid: bidSide.periods,
        ask: askSide.periods,
      });
    } catch {
      setRealStats24h(null);
      setTradingPeriods(null);
    }
  }, [effectivePair.fromSymbol, effectivePair.toSymbol]);

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

  useEffect(() => {
    void fetchTradingStats();
    const id = setInterval(() => void fetchTradingStats(), AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchTradingStats]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tokens = await getRaceTokens(raceCfg);
        if (cancelled) return;
        const map = new Map<string, number>();
        const missingSymbols: string[] = [];
        for (const t of tokens) {
          if (t.price_usd > 0) {
            map.set(t.symbol.toUpperCase(), t.price_usd);
          } else {
            missingSymbols.push(t.symbol.toUpperCase());
          }
        }
        // Fetch DEX prices for tokens without race API price (e.g. AGNT)
        if (missingSymbols.length > 0) {
          const dexResults = await Promise.all(
            missingSymbols.map((s) => getDexCoinPrice(s)),
          );
          for (let i = 0; i < missingSymbols.length; i++) {
            const p = dexResults[i]?.priceUsd;
            if (p != null && p > 0) map.set(missingSymbols[i], p);
          }
        }
        if (!cancelled) setTokenPrices(map);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [raceCfg]);

  const priceOf = useCallback(
    (sym: string): number | null => {
      const upper = sym.toUpperCase();
      const p = tokenPrices.get(upper);
      if (p != null) return p;
      if (upper.startsWith('J')) {
        const fallback = tokenPrices.get(upper.slice(1));
        if (fallback != null) return fallback;
      }
      return null;
    },
    [tokenPrices],
  );

  const normalized = useMemo(() => {
    if (!book) return null;
    return normalizeOpen4DevBook(book);
  }, [book]);

  const stats = useMemo(() => {
    if (!normalized) return null;
    return computeStats(normalized);
  }, [normalized]);

  const fromPriceUsd = priceOf(effectivePair.fromSymbol);
  const amountPriceUsd = priceOf(effectivePair.toSymbol);
  const fromUpper = effectivePair.fromSymbol;
  const toUpper = effectivePair.toSymbol;
  const activityVolumeUsd = useMemo<ActivityVolumeUsdByWindow | null>(() => {
    if (!tradingPeriods) return null;

    const getPeriod = (periods: DexTradingStatsPeriod[], period: string) =>
      periods.find((p) => p.period === period) ?? null;
    const getMaxPeriod = (periods: DexTradingStatsPeriod[]) =>
      periods.find((p) => p.period === '30d') ?? periods[periods.length - 1] ?? null;

    const toUsd = (volume: number | null, price: number | null): number | null => {
      if (volume == null || price == null) return null;
      return volume * price;
    };
    const sumUsd = (a: number | null, b: number | null): number | null => {
      if (a == null && b == null) return null;
      return (a ?? 0) + (b ?? 0);
    };

    const bid1h = getPeriod(tradingPeriods.bid, '1h');
    const ask1h = getPeriod(tradingPeriods.ask, '1h');
    const bid24h = getPeriod(tradingPeriods.bid, '24h');
    const ask24h = getPeriod(tradingPeriods.ask, '24h');
    const bidMax = getMaxPeriod(tradingPeriods.bid);
    const askMax = getMaxPeriod(tradingPeriods.ask);

    const vol1h = sumUsd(toUsd(bid1h?.total_volume ?? null, fromPriceUsd), toUsd(ask1h?.total_volume ?? null, amountPriceUsd));
    const vol24h = sumUsd(toUsd(bid24h?.total_volume ?? null, fromPriceUsd), toUsd(ask24h?.total_volume ?? null, amountPriceUsd));
    const volMax = sumUsd(toUsd(bidMax?.total_volume ?? null, fromPriceUsd), toUsd(askMax?.total_volume ?? null, amountPriceUsd));

    // When a period has no volume data from trading stats (API only returns 7d/30d
    // granularity for some pairs), estimate proportionally using scanner order counts.
    const scanner1h = pairStats?.windows?.['1h']?.completed_orders ?? 0;
    const scanner24h = pairStats?.windows?.['24h']?.completed_orders ?? 0;
    const scannerMax = pairStats?.windows?.all_time?.completed_orders ?? 0;

    const estimateFromMax = (windowCompleted: number, maxVol: number | null): number | null => {
      if (maxVol == null || maxVol <= 0 || scannerMax <= 0 || windowCompleted <= 0) return null;
      return maxVol * (windowCompleted / scannerMax);
    };

    return {
      '1h': (vol1h != null && vol1h > 0) ? vol1h : estimateFromMax(scanner1h, volMax),
      '24h': (vol24h != null && vol24h > 0) ? vol24h : estimateFromMax(scanner24h, volMax),
      max: volMax,
    };
  }, [tradingPeriods, fromPriceUsd, amountPriceUsd, pairStats]);

  const selectPair = useCallback(
    (idx: number) => {
      setSelectedPairIdx(idx);
      setReversed(false);
      onPairChange?.(pairs[idx].slug);
    },
    [onPairChange, pairs],
  );

  return (
    <div className="space-y-4">
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

      <div className="flex flex-wrap items-center gap-2">
        {pairs.map((p, idx) => {
          const isSelected = selectedPairIdx === idx && !reversed;
          const isHot = p.hot && !isSelected;
          return (
            <button
              key={p.slug}
              className={`btn btn-xs ${
                isSelected
                  ? 'btn-primary'
                  : isHot
                    ? 'border-2 border-orange-500/60 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 hover:border-orange-400'
                    : 'btn-ghost border border-base-content/10'
              }`}
              onClick={() => selectPair(idx)}
              type="button"
            >
              {p.hot && <span className="text-orange-400 mr-0.5">*</span>}
              {p.label}
            </button>
          );
        })}
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

      {pairStats && (
        <PairActivityRow
          stats={pairStats}
          fromSymbol={fromUpper}
          toSymbol={toUpper}
          volumeUsdByWindow={activityVolumeUsd}
        />
      )}

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
          sourceLabel="open4dev is data provider"
          realStats24h={realStats24h}
        />
      ) : null}
    </div>
  );
}
