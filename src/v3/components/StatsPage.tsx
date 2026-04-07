import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, ArrowDownUp, TrendingUp, ArrowUp, ArrowDown } from 'lucide-react';
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
} from '../../lib/api';
import { cn } from '../utils/cn';

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

function pairIdxFromSlug(slug: string | null): number {
  if (!slug) return 0;
  const upper = slug.toUpperCase();
  const idx = DEFAULT_PAIRS.findIndex((p) => p.slug === upper);
  return idx >= 0 ? idx : 0;
}

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

/**
 * Normalize the open4dev order book response.
 * Per-level rate check: rate > 1 → invert, rate < 1 → direct.
 * decAdj = 10^(to_decimals - from_decimals)
 * Bids use to_decimals for amounts, asks use from_decimals.
 */
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

/* ---------- stats ---------- */

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

type ActivityVolumeUsdByWindow = {
  '1h': number | null;
  '24h': number | null;
  max: number | null;
};

type TradingPeriodsState = {
  bid: DexTradingStatsPeriod[];
  ask: DexTradingStatsPeriod[];
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
  return { totalAskOrders, totalBidOrders, totalAskAmount, totalBidAmount, bestAsk, bestBid, spread, spreadPct };
}

/* ---------- ActivityWindow ---------- */

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
  const volume = Number.isFinite(rawVolume) && rawVolume > 0 && rawVolume < 1_000_000_000 ? rawVolume : 0;
  const volumeText = volume > 0 ? fmtUsd(volume) : '$0.00';

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border border-white/5 px-3 py-2.5',
        highlight ? 'bg-white/5' : 'bg-white/[0.03]',
      )}
    >
      <div
        className="absolute bottom-0 left-0 h-[2px] bg-emerald-500/40 transition-all duration-700"
        style={{ width: `${completionPct}%` }}
      />
      <div className="mb-2 flex items-center justify-between">
        <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-gray-400">
          {label}
        </span>
        <TrendingUp className="h-3.5 w-3.5 text-gray-600" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-[9px] uppercase tracking-wide text-gray-600">Open</div>
          <div className="font-mono text-sm font-semibold text-sky-400">{data.open_orders.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide text-gray-600">Filled</div>
          <div className="font-mono text-sm font-semibold text-emerald-400">{data.completed_orders.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wide text-gray-600">Volume</div>
          <div className="font-mono text-sm font-semibold text-gray-300">{volumeText}</div>
        </div>
      </div>
    </div>
  );
}

/* ---------- PairActivityRow ---------- */

function PairActivityRow({
  stats,
  fromSymbol,
  toSymbol,
  volumeUsdByWindow,
}: {
  stats: ScannerStatsResponse;
  fromSymbol: string;
  toSymbol: string;
  volumeUsdByWindow?: ActivityVolumeUsdByWindow | null;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-1 rounded-full bg-sky-500/60" />
          <span className="text-[11px] font-bold tracking-tight text-gray-400">
            {fromSymbol}/{toSymbol} Order Stats
          </span>
        </div>
        <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500/50" />
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <ActivityWindow label="1H" data={stats.windows['1h']} volumeUsdOverride={volumeUsdByWindow?.['1h'] ?? null} />
        <ActivityWindow label="24H" data={stats.windows['24h']} volumeUsdOverride={volumeUsdByWindow?.['24h'] ?? null} />
        <ActivityWindow label="MAX" data={stats.windows.all_time} volumeUsdOverride={volumeUsdByWindow?.max ?? null} highlight />
      </div>
    </div>
  );
}

/* ---------- OrderBookTable ---------- */

type OrderBookTableProps = {
  normalized: NormalizedBook;
  stats: BookStats;
  fromUpper: string;
  toUpper: string;
  fromPriceUsd: number | null;
  amountPriceUsd: number | null;
  refreshTick: number;
};

function OrderBookTable({
  normalized,
  stats,
  fromUpper,
  toUpper,
  fromPriceUsd,
  amountPriceUsd,
  refreshTick,
}: OrderBookTableProps) {
  const maxAmount = useMemo(() => {
    const maxAsk = Math.max(...normalized.asks.map((a) => a.amount), 0);
    const maxBid = Math.max(...normalized.bids.map((b) => b.amount), 0);
    return Math.max(maxAsk, maxBid);
  }, [normalized]);

  // Column headers differ: Bids=Amount(toSymbol)/Total(fromSymbol), Asks=Amount(fromSymbol)/Total(toSymbol)
  // Price label uses fromUpper when inverted, toUpper when not
  const priceLabel = normalized.inverted ? fromUpper : toUpper;
  const askAmtLabel = fromUpper;
  const askTotalLabel = toUpper;
  const bidAmtLabel = toUpper;
  const bidTotalLabel = fromUpper;

  const asksReversed = useMemo(() => [...normalized.asks].reverse(), [normalized.asks]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Bids panel */}
        <div className="overflow-hidden rounded-xl border border-white/5 bg-[#0d1117]">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <ArrowUp className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-sm font-bold text-white">Bids</span>
              <span className="text-xs text-gray-600">({normalized.bids.length})</span>
            </div>
            <span className="text-[10px] text-emerald-500/60">Buy orders</span>
          </div>
          <div className="flex items-center gap-2 border-b border-white/[0.03] px-3 py-2 text-[10px] uppercase tracking-wider text-gray-600">
            <span className="w-24 text-right sm:w-32">Price ({priceLabel})</span>
            <span className="flex-1 text-right">Amount ({bidAmtLabel})</span>
            <span className="hidden w-24 text-right sm:block">Total ({bidTotalLabel})</span>
            <span className="hidden w-16 text-right sm:block">USD</span>
            <span className="w-8 text-right">Qty</span>
          </div>
          {normalized.bids.length === 0 ? (
            <div className="py-4 text-center text-xs text-gray-600">No bids</div>
          ) : (
            <div className="flex flex-col">
              {normalized.bids.map((lvl, i) => {
                const pct = maxAmount > 0 ? (lvl.amount / maxAmount) * 100 : 0;
                const usdVal = amountPriceUsd != null ? lvl.amount * amountPriceUsd : null;
                const fromTotal = normalized.inverted
                  ? lvl.amount * lvl.price
                  : lvl.price > 0
                    ? lvl.amount / lvl.price
                    : 0;
                return (
                  <div
                    key={`bid-${i}-${refreshTick}`}
                    className="relative flex items-center gap-2 px-3 py-1 font-mono text-xs"
                  >
                    <div
                      className="absolute inset-y-0 right-0 bg-emerald-500/10 transition-[width] duration-700 ease-out"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                    <span className="relative z-10 w-24 text-right font-medium text-emerald-400 sm:w-32">
                      {fmtRate(lvl.price)}
                    </span>
                    <span className="relative z-10 flex-1 text-right text-gray-300">{fmtAmount(lvl.amount)}</span>
                    <span className="relative z-10 hidden w-24 text-right text-gray-500 sm:block">{fmtAmount(fromTotal)}</span>
                    <span className="relative z-10 hidden w-16 text-right text-[10px] text-gray-600 sm:block">
                      {usdVal != null ? fmtUsd(usdVal) : '\u2014'}
                    </span>
                    <span className="relative z-10 w-8 text-right text-gray-600">{lvl.orderCount}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Asks panel */}
        <div className="overflow-hidden rounded-xl border border-white/5 bg-[#0d1117]">
          <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <ArrowDown className="h-3.5 w-3.5 text-red-400" />
              <span className="text-sm font-bold text-white">Asks</span>
              <span className="text-xs text-gray-600">({normalized.asks.length})</span>
            </div>
            <span className="text-[10px] text-red-500/60">Sell orders</span>
          </div>
          <div className="flex items-center gap-2 border-b border-white/[0.03] px-3 py-2 text-[10px] uppercase tracking-wider text-gray-600">
            <span className="w-24 text-right sm:w-32">Price ({priceLabel})</span>
            <span className="flex-1 text-right">Amount ({askAmtLabel})</span>
            <span className="hidden w-24 text-right sm:block">Total ({askTotalLabel})</span>
            <span className="hidden w-16 text-right sm:block">USD</span>
            <span className="w-8 text-right">Qty</span>
          </div>
          {asksReversed.length === 0 ? (
            <div className="py-4 text-center text-xs text-gray-600">No asks</div>
          ) : (
            <div className="flex flex-col">
              {asksReversed.map((lvl, i) => {
                const pct = maxAmount > 0 ? (lvl.amount / maxAmount) * 100 : 0;
                const usdVal = fromPriceUsd != null ? lvl.amount * fromPriceUsd : null;
                const toTotal = normalized.inverted
                  ? lvl.price > 0
                    ? lvl.amount / lvl.price
                    : 0
                  : lvl.amount * lvl.price;
                return (
                  <div
                    key={`ask-${i}-${refreshTick}`}
                    className="relative flex items-center gap-2 px-3 py-1 font-mono text-xs"
                  >
                    <div
                      className="absolute inset-y-0 right-0 bg-red-500/10 transition-[width] duration-700 ease-out"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                    <span className="relative z-10 w-24 text-right font-medium text-red-400 sm:w-32">
                      {fmtRate(lvl.price)}
                    </span>
                    <span className="relative z-10 flex-1 text-right text-gray-300">{fmtAmount(lvl.amount)}</span>
                    <span className="relative z-10 hidden w-24 text-right text-gray-500 sm:block">{fmtAmount(toTotal)}</span>
                    <span className="relative z-10 hidden w-16 text-right text-[10px] text-gray-600 sm:block">
                      {usdVal != null ? fmtUsd(usdVal) : '\u2014'}
                    </span>
                    <span className="relative z-10 w-8 text-right text-gray-600">{lvl.orderCount}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Spread bar */}
      {stats.bestBid != null && stats.bestAsk != null && stats.spreadPct != null && (
        <div className="rounded-xl border border-white/5 bg-[#0d1117] p-3">
          <div className="flex items-center justify-center gap-6">
            <div className="text-center">
              <div className="text-[10px] text-gray-600">Best Bid</div>
              <div className="font-mono text-sm font-bold text-emerald-400">{fmtRate(stats.bestBid)}</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1 w-12 rounded-full bg-emerald-500" />
              <div className="text-center">
                <div className="text-[10px] text-gray-600">Spread</div>
                <div className={cn('font-mono text-xs font-bold', stats.spreadPct < 0 ? 'text-yellow-400' : 'text-gray-300')}>
                  {stats.spreadPct < 0 ? 'Crossed' : `${stats.spreadPct.toFixed(2)}%`}
                </div>
              </div>
              <div className="h-1 w-12 rounded-full bg-red-500" />
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-600">Best Ask</div>
              <div className="font-mono text-sm font-bold text-red-400">{fmtRate(stats.bestAsk)}</div>
            </div>
          </div>
        </div>
      )}
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

  const [book, setBook] = useState<DexOrderBookResponse | null>(null);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [pairStats, setPairStats] = useState<ScannerStatsResponse | null>(null);
  const [tradingPeriods, setTradingPeriods] = useState<TradingPeriodsState | null>(null);
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
    if (!baseVault || !quoteVault) { setPairStats(null); return; }
    try {
      const data = await getOrderScannerStats({ baseVault, quoteVault });
      setPairStats(data);
    } catch { setPairStats(null); }
  }, [effectivePair]);

  const fetchTradingStats = useCallback(async () => {
    try {
      const [bidSide, askSide] = await Promise.all([
        getDexTradingStats(effectivePair.fromSymbol, effectivePair.toSymbol),
        getDexTradingStats(effectivePair.toSymbol, effectivePair.fromSymbol),
      ]);
      setTradingPeriods({ bid: bidSide.periods, ask: askSide.periods });
    } catch { setTradingPeriods(null); }
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
          if (t.price_usd > 0 && t.price_usd < 1_000_000) {
            map.set(t.symbol.toUpperCase(), t.price_usd);
          } else {
            missingSymbols.push(t.symbol.toUpperCase());
          }
        }
        if (missingSymbols.length > 0) {
          const dexResults = await Promise.all(missingSymbols.map((s) => getDexCoinPrice(s)));
          for (let i = 0; i < missingSymbols.length; i++) {
            const p = dexResults[i]?.priceUsd;
            if (p != null && p > 0) map.set(missingSymbols[i], p);
          }
        }
        if (!cancelled) setTokenPrices(map);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
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

  const normalized = useMemo(() => (book ? normalizeOpen4DevBook(book) : null), [book]);
  const stats = useMemo(() => (normalized ? computeBookStats(normalized) : null), [normalized]);

  const fromPriceUsd = priceOf(effectivePair.fromSymbol);
  const rawAmountPrice = priceOf(effectivePair.toSymbol);
  const amountPriceUsd = rawAmountPrice != null && rawAmountPrice <= 1000 ? rawAmountPrice : null;
  const fromUpper = effectivePair.fromSymbol;
  const toUpper = effectivePair.toSymbol;

  const activityVolumeUsd = useMemo<ActivityVolumeUsdByWindow | null>(() => {
    if (!tradingPeriods) return null;
    const getPeriod = (periods: DexTradingStatsPeriod[], period: string) =>
      periods.find((p) => p.period === period) ?? null;
    const getMaxPeriod = (periods: DexTradingStatsPeriod[]) =>
      periods.find((p) => p.period === '30d') ?? periods[periods.length - 1] ?? null;
    const toUsd = (volume: number | null, price: number | null): number | null => {
      if (volume == null || price == null || price > 1000) return null;
      const usd = volume * price;
      return usd < 1_000_000_000 ? usd : null;
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
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#00C389]/10">
            <BarChart3 className="h-5 w-5 text-[#00C389]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Order Book</h1>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <p className="text-xs text-gray-500">Live from open4dev DEX — refreshes every 10s</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Pair tabs + flip */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="flex flex-wrap items-center gap-2"
      >
        {pairs.map((p, idx) => {
          const isSelected = selectedPairIdx === idx && !reversed;
          return (
            <button
              key={p.slug}
              onClick={() => selectPair(idx)}
              type="button"
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm font-medium transition-all',
                isSelected
                  ? 'border-[#00C389]/40 bg-[#00C389]/10 text-[#00C389]'
                  : 'border-white/10 bg-white/[0.03] text-gray-400 hover:border-white/20 hover:text-white',
              )}
            >
              {p.label}
            </button>
          );
        })}
        <button
          onClick={() => setReversed((r) => !r)}
          type="button"
          title="Reverse pair"
          className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-gray-500 transition-all hover:border-white/20 hover:text-white"
        >
          <ArrowDownUp className="h-3 w-3" />
          Flip
        </button>
      </motion.div>

      {/* Activity stats */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        {pairStats ? (
          <PairActivityRow
            stats={pairStats}
            fromSymbol={fromUpper}
            toSymbol={toUpper}
            volumeUsdByWindow={activityVolumeUsd}
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            {['1H', '24H', 'ALL'].map((label) => (
              <div key={label} className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                    {label}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {['Open', 'Filled', 'Volume'].map((col) => (
                    <div key={col}>
                      <div className="text-[9px] uppercase tracking-wide text-gray-600">{col}</div>
                      <div className="mt-1 h-4 w-10 animate-pulse rounded bg-white/5" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Quick spread summary */}
      <div className="rounded-xl border border-white/5 bg-[#0d1117] px-3 py-2">
        <div className="flex flex-wrap items-center justify-center gap-4 font-mono text-xs">
          <span className="text-gray-600">{fromUpper} / {toUpper}</span>
          {stats ? (
            <>
              <span>Bid <span className="font-bold text-emerald-400">{fmtRate(stats.bestBid ?? 0)}</span></span>
              <span>Ask <span className="font-bold text-red-400">{fmtRate(stats.bestAsk ?? 0)}</span></span>
              {stats.spreadPct != null && (
                <span>Spread <span className={cn('font-bold', stats.spreadPct < 0 ? 'text-yellow-400' : 'text-gray-300')}>
                  {stats.spreadPct < 0 ? 'Crossed' : `${stats.spreadPct.toFixed(2)}%`}
                </span></span>
              )}
            </>
          ) : (
            <span className="text-gray-700">Loading...</span>
          )}
        </div>
      </div>

      {/* Book table */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        {bookError ? (
          <div className="rounded-xl border border-white/5 bg-[#0d1117] p-6">
            <p className="text-sm text-red-400">{bookError}</p>
          </div>
        ) : bookLoading && !book ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00C389] border-t-transparent" />
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
          />
        ) : null}
      </motion.div>

      {(normalized || bookLoading) && (
        <p className="text-center text-[10px] text-gray-700">
          open4dev is data provider
        </p>
      )}
    </div>
  );
}
