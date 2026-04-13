import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BarChart3, ArrowUp, ArrowDown } from 'lucide-react';
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
import { Card, CardContent } from '@/v2/components/ui/card';
import { Badge } from '@/v2/components/ui/badge';
import { Button } from '@/v2/components/ui/button';
import { Skeleton } from '@/v2/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/v2/components/ui/table';

const AUTO_REFRESH_MS = 10_000; // 10 seconds

const TOKEN_LOGOS: Record<string, string> = {
  AGNT: '/agnt-token.png?v=2',
  TON: 'https://assets.dedust.io/images/ton.webp',
  NOT: 'https://assets.dedust.io/images/not.webp',
  BUILD: 'https://cdn.joincommunity.xyz/build/build_logo.png',
  USDT: 'https://assets.dedust.io/images/usdt.webp',
};

function TokenLogo({ symbol, size = 'h-4 w-4' }: { symbol: string; size?: string }) {
  const logo = TOKEN_LOGOS[symbol.toUpperCase()];
  if (logo) {
    return <img src={logo} alt={symbol} className={`${size} rounded-full object-cover shrink-0`} />;
  }
  return <span className={`${size} rounded-full bg-muted shrink-0`} />;
}

/* ---------- pair definitions ---------- */

type TradingPair = {
  slug: string;
  label: string;
  fromSymbol: string; // quote symbol (price denomination, e.g. TON)
  toSymbol: string;   // base symbol (the asset, e.g. NOT)
  baseVault: string;
  quoteVault: string;
  hot?: boolean;
};

/** Only pairs whose both vaults exist */
const DEFAULT_PAIRS: TradingPair[] = [
  {
    slug: 'AGNT-USDT',
    label: 'AGNT / USDT',
    fromSymbol: 'AGNT',
    toSymbol: 'USDT',
    baseVault: 'EQCfzBzukuhvyXvKwFXq9nffu_YRngAJugAuR5ibQ7Arcl1w',
    quoteVault: 'EQBrozHGTEwumr5ND62CpUXqmfYyi1UucbIj-15ZJnlFLe9U',
    hot: true,
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
  price: number;      // display price (always same direction within a book)
  amount: number;     // human-readable amount
  orderCount: number;
};

type NormalizedBook = {
  asks: NormalizedLevel[];
  bids: NormalizedLevel[];
  inverted: boolean;  // true when price was inverted (rate > 1 pairs like USDT/BUILD)
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
 * We detect this by comparing against mid_price -- if price_rate is >1000x
 * smaller than mid_price, it's already inverted and should be used as-is.
 */
function normalizeOpen4DevBook(book: DexOrderBookResponse): NormalizedBook {
  const decAdj = 10 ** ((book.to_decimals ?? 9) - (book.from_decimals ?? 9));

  const allRates = [
    ...book.asks.filter((a) => a.price_rate > 0).map((a) => a.price_rate),
    ...book.bids.filter((b) => b.price_rate > 0).map((b) => b.price_rate),
  ];

  // Reference display price from rates > 1 (if any exist)
  const bigRates = allRates.filter((r) => r > 1);
  let refDisplay: number | null = null;
  if (bigRates.length > 0) {
    bigRates.sort((a, b) => a - b);
    refDisplay = (1 / bigRates[Math.floor(bigRates.length / 2)]) * decAdj;
  }
  // Fallback: reference from normal small rates (those that are very small)
  if (refDisplay == null) {
    const smallRates = allRates.filter((r) => r > 0 && r < 1);
    if (smallRates.length > 0) {
      smallRates.sort((a, b) => a - b);
      refDisplay = smallRates[Math.floor(smallRates.length / 2)] * decAdj;
    }
  }

  const toDisplayPrice = (priceRate: number): number => {
    if (priceRate > 1) return (1 / priceRate) * decAdj;
    // Detect already-display rates: if scaling by decAdj overshoots reference by >50x
    if (refDisplay != null && Math.abs(refDisplay) > 0 && decAdj !== 1) {
      const scaled = priceRate * decAdj;
      if (Math.abs(scaled) > Math.abs(refDisplay) * 50) {
        if (decAdj > 1) {
          return 1 / priceRate;
        }
        return priceRate;
      }
    }
    return priceRate * decAdj;
  };

  const shouldInvert = decAdj > 1 && bigRates.length > 0;

  const asks: NormalizedLevel[] = book.asks
    .filter((a) => a.price_rate > 0)
    .map((a) => ({ price: toDisplayPrice(a.price_rate), amount: a.total_amount, orderCount: a.order_count }));

  const bids: NormalizedLevel[] = book.bids
    .filter((b) => b.price_rate > 0)
    .map((b) => ({ price: toDisplayPrice(b.price_rate), amount: b.total_amount, orderCount: b.order_count }));

  asks.sort((a, b) => a.price - b.price);
  bids.sort((a, b) => b.price - a.price);

  return { asks, bids, inverted: shouldInvert };
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
  realStats24h: _realStats24h,
}: OrderBookTableProps) {
  const maxBidAmount = useMemo(() => Math.max(...normalized.bids.map((b) => b.amount), 0), [normalized]);
  const totalBidAmount = useMemo(() => normalized.bids.reduce((s, b) => s + b.amount, 0), [normalized]);
  const totalBidOrders = useMemo(() => normalized.bids.reduce((s, b) => s + b.orderCount, 0), [normalized]);
  const totalBidUsd = useMemo(() => amountPriceUsd != null ? normalized.bids.reduce((s, b) => s + b.amount * amountPriceUsd, 0) : null, [normalized, amountPriceUsd]);
  const totalAskAmount = useMemo(() => normalized.asks.reduce((s, a) => s + a.amount, 0), [normalized]);
  const totalAskOrders = useMemo(() => normalized.asks.reduce((s, a) => s + a.orderCount, 0), [normalized]);
  const totalAskUsd = useMemo(() => fromPriceUsd != null ? normalized.asks.reduce((s, a) => s + a.amount * fromPriceUsd, 0) : null, [normalized, fromPriceUsd]);
  const maxAskAmount = useMemo(() => Math.max(...normalized.asks.map((a) => a.amount), 0), [normalized]);

  // Column labels depend on whether price was inverted
  const priceLabel = normalized.inverted ? fromUpper : toUpper;
  const askAmtLabel = fromUpper;
  const askTotalLabel = toUpper;
  const bidAmtLabel = toUpper;
  const bidTotalLabel = fromUpper;

  const asksReversed = useMemo(() => [...normalized.asks].reverse(), [normalized.asks]);

  return (
    <div className="space-y-3">
      {/* Spread summary bar — compact single-row at top of orderbook */}
      {stats.bestBid != null && stats.bestAsk != null && stats.spreadPct != null && (
        <Card className="py-0">
          <CardContent className="px-3 py-1.5 flex flex-row items-center justify-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Best Bid</span>
              <span className="font-bold text-green-500">{fmtRate(stats.bestBid)}</span>
            </span>
            <span className="h-3 w-px bg-border" />
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Spread</span>
              <span className={`font-bold ${stats.spreadPct < 0 ? 'text-yellow-500' : ''}`}>
                {stats.spreadPct < 0 ? 'Crossed' : `${stats.spreadPct.toFixed(2)}%`}
              </span>
            </span>
            <span className="h-3 w-px bg-border" />
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Best Ask</span>
              <span className="font-bold text-red-500">{fmtRate(stats.bestAsk)}</span>
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bids panel */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <div className="flex items-center gap-1.5">
                <ArrowUp className="h-3.5 w-3.5 text-green-500" />
                <span className="text-sm font-bold">Bids</span>
                <span className="text-xs text-muted-foreground">({normalized.bids.length})</span>
              </div>
              <span className="text-[10px] text-green-500/60">Buy orders</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/50">
              <span className="w-24 sm:w-32 text-right">Price ({priceLabel})</span>
              <span className="flex-1 text-right">Amount ({bidAmtLabel})</span>
              <span className="w-24 text-right hidden sm:block">Total ({bidTotalLabel})</span>
              <span className="w-16 text-right hidden sm:block">USD</span>
              <span className="w-8 text-right">Qty</span>
            </div>
            {normalized.bids.length === 0 ? (
              <div className="text-center py-4 text-xs text-muted-foreground">No bids</div>
            ) : (
              <div className="flex flex-col">
                {normalized.bids.map((lvl, i) => {
                  const pct = maxBidAmount > 0 ? (lvl.amount / maxBidAmount) * 100 : 0;
                  const usdVal = amountPriceUsd != null ? lvl.amount * amountPriceUsd : null;
                  const fromTotal = normalized.inverted ? lvl.amount * lvl.price : (lvl.price > 0 ? lvl.amount / lvl.price : 0);
                  return (
                    <div
                      key={`bid-${i}-${refreshTick}`}
                      className="relative flex items-center gap-2 px-3 py-1 text-xs font-mono animate-[rowFlash_0.6s_ease-out]"
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <div
                        className="absolute inset-y-0 right-0 bg-green-500/10 transition-[width] duration-700 ease-out"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                      <span className="relative z-10 w-24 sm:w-32 text-right text-green-500 font-medium">
                        {fmtRate(lvl.price)}
                      </span>
                      <span className="relative z-10 flex-1 text-right">{fmtAmount(lvl.amount)}</span>
                      <span className="relative z-10 w-24 text-right text-muted-foreground hidden sm:block">{fmtAmount(fromTotal)}</span>
                      <span className="relative z-10 w-16 text-right text-muted-foreground text-[10px] hidden sm:block">
                        {usdVal != null ? fmtUsd(usdVal) : '\u2014'}
                      </span>
                      <span className="relative z-10 w-8 text-right text-muted-foreground">{lvl.orderCount}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Totals row */}
            {normalized.bids.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border-t border-border bg-muted/30">
                <span className="w-24 sm:w-32 text-right font-bold text-muted-foreground">Total</span>
                <span className="flex-1 text-right font-bold">{fmtAmount(totalBidAmount)} {bidAmtLabel}</span>
                <span className="w-24 text-right hidden sm:block" />
                <span className="w-16 text-right hidden sm:block font-bold text-muted-foreground">{totalBidUsd != null ? fmtUsd(totalBidUsd) : ''}</span>
                <span className="w-8 text-right font-bold text-muted-foreground">{totalBidOrders}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Asks panel */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <div className="flex items-center gap-1.5">
                <ArrowDown className="h-3.5 w-3.5 text-red-500" />
                <span className="text-sm font-bold">Asks</span>
                <span className="text-xs text-muted-foreground">({normalized.asks.length})</span>
              </div>
              <span className="text-[10px] text-red-500/60">Sell orders</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/50">
              <span className="w-24 sm:w-32 text-right">Price ({priceLabel})</span>
              <span className="flex-1 text-right">Amount ({askAmtLabel})</span>
              <span className="w-24 text-right hidden sm:block">Total ({askTotalLabel})</span>
              <span className="w-16 text-right hidden sm:block">USD</span>
              <span className="w-8 text-right">Qty</span>
            </div>
            {asksReversed.length === 0 ? (
              <div className="text-center py-4 text-xs text-muted-foreground">No asks</div>
            ) : (
              <div className="flex flex-col">
                {asksReversed.map((lvl, i) => {
                  const pct = maxAskAmount > 0 ? (lvl.amount / maxAskAmount) * 100 : 0;
                  const usdVal = fromPriceUsd != null ? lvl.amount * fromPriceUsd : null;
                  const toTotal = normalized.inverted ? (lvl.price > 0 ? lvl.amount / lvl.price : 0) : lvl.amount * lvl.price;
                  return (
                    <div
                      key={`ask-${i}-${refreshTick}`}
                      className="relative flex items-center gap-2 px-3 py-1 text-xs font-mono animate-[rowFlash_0.6s_ease-out]"
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <div
                        className="absolute inset-y-0 right-0 bg-red-500/10 transition-[width] duration-700 ease-out"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                      <span className="relative z-10 w-24 sm:w-32 text-right text-red-500 font-medium">
                        {fmtRate(lvl.price)}
                      </span>
                      <span className="relative z-10 flex-1 text-right">{fmtAmount(lvl.amount)}</span>
                      <span className="relative z-10 w-24 text-right text-muted-foreground hidden sm:block">{fmtAmount(toTotal)}</span>
                      <span className="relative z-10 w-16 text-right text-muted-foreground text-[10px] hidden sm:block">
                        {usdVal != null ? fmtUsd(usdVal) : '\u2014'}
                      </span>
                      <span className="relative z-10 w-8 text-right text-muted-foreground">{lvl.orderCount}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Totals row */}
            {asksReversed.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border-t border-border bg-muted/30">
                <span className="w-24 sm:w-32 text-right font-bold text-muted-foreground">Total</span>
                <span className="flex-1 text-right font-bold">{fmtAmount(totalAskAmount)} {askAmtLabel}</span>
                <span className="w-24 text-right hidden sm:block" />
                <span className="w-16 text-right hidden sm:block font-bold text-muted-foreground">{totalAskUsd != null ? fmtUsd(totalAskUsd) : ''}</span>
                <span className="w-8 text-right font-bold text-muted-foreground">{totalAskOrders}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {sourceLabel && (
        <div className="px-3 py-1.5 text-[10px] tracking-wide text-muted-foreground border-t border-border/50 bg-muted/30 text-center rounded-b-xl">
          <a
            href="https://github.com/tongateway"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            tongateway
          </a>
          {' '}is data provider
        </div>
      )}
    </div>
  );
}

/* ---------- activity row ---------- */

type ActivityWindowData = {
  label: string;
  openOrders: number;
  filledOrders: number;
  volume: number;
  volumeText: string;
  completionPct: number;
};

function computeWindowData(
  label: string,
  data: ScannerStatsWindow,
  volumeUsdOverride: number | null | undefined,
  tradingPeriod: DexTradingStatsPeriod | null | undefined,
): ActivityWindowData {
  // Scanner uses open_orders/completed_orders. Trading-stats uses by_status with keys: open, filled, closed.
  const tsOpen = tradingPeriod?.by_status?.['open']?.count ?? 0;
  const tsFilled = (tradingPeriod?.by_status?.['filled']?.count ?? 0)
    + (tradingPeriod?.by_status?.['completed']?.count ?? 0)
    + (tradingPeriod?.by_status?.['closed']?.count ?? 0);
  const openOrders = data.open_orders > 0 ? data.open_orders : (tsOpen > 0 ? tsOpen : data.open_orders);
  const filledOrders = data.completed_orders > 0 ? data.completed_orders : (tsFilled > 0 ? tsFilled : data.completed_orders);
  const total = openOrders + filledOrders;
  const completionPct = total > 0 ? (filledOrders / total) * 100 : 0;

  // Prefer trading-stats volume (already converted to USD), fall back to scanner's volume_usd
  const rawVolume = (volumeUsdOverride != null && volumeUsdOverride > 0)
    ? volumeUsdOverride
    : Number(String(data.volume_usd ?? '0').replaceAll(',', '').trim());

  const volume = Number.isFinite(rawVolume) && rawVolume > 0 && rawVolume < 1_000_000_000 ? rawVolume : 0;
  const volumeText = volume > 0 ? fmtUsd(volume) : '$0.00';
  return { label, openOrders, filledOrders, volume, volumeText, completionPct };
}

function PairActivityRow({ stats, fromSymbol, toSymbol, volumeUsdByWindow, tradingPeriods }: {
  stats: ScannerStatsResponse;
  fromSymbol: string;
  toSymbol: string;
  volumeUsdByWindow?: ActivityVolumeUsdByWindow | null;
  tradingPeriods?: TradingPeriodsState | null;
}) {
  // Merge bid+ask trading periods into combined order counts per time window
  const mergePeriod = (period: string): DexTradingStatsPeriod | null => {
    if (!tradingPeriods) return null;
    const bid = tradingPeriods.bid.find((p) => p.period === period);
    const ask = tradingPeriods.ask.find((p) => p.period === period);
    if (!bid && !ask) return null;
    const mergeStatus = (key: string) => ({
      count: (bid?.by_status?.[key]?.count ?? 0) + (ask?.by_status?.[key]?.count ?? 0),
      volume: (bid?.by_status?.[key]?.volume ?? 0) + (ask?.by_status?.[key]?.volume ?? 0),
    });
    const allKeys = new Set([
      ...Object.keys(bid?.by_status ?? {}),
      ...Object.keys(ask?.by_status ?? {}),
    ]);
    const by_status: Record<string, { count: number; volume: number }> = {};
    for (const k of allKeys) by_status[k] = mergeStatus(k);
    return {
      period,
      total_orders: (bid?.total_orders ?? 0) + (ask?.total_orders ?? 0),
      total_volume: (bid?.total_volume ?? 0) + (ask?.total_volume ?? 0),
      by_status,
    };
  };

  const tp1h = mergePeriod('1h');
  const tp24h = mergePeriod('24h');
  const tp30d = mergePeriod('30d') ?? mergePeriod('7d');

  const rows: ActivityWindowData[] = [
    computeWindowData('1H', stats.windows['1h'], volumeUsdByWindow?.['1h'] ?? null, tp1h),
    computeWindowData('24H', stats.windows['24h'], volumeUsdByWindow?.['24h'] ?? null, tp24h),
    computeWindowData('30D', stats.windows.all_time, volumeUsdByWindow?.max ?? null, tp30d),
  ];

  return (
    <Card className="py-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3.5 rounded-full bg-blue-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {fromSymbol}/{toSymbol} Order Stats
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] text-muted-foreground">Live</span>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-b-border/40 hover:bg-transparent">
            <TableHead className="w-16 text-[10px] uppercase tracking-wider">Period</TableHead>
            <TableHead className="text-right text-[10px] uppercase tracking-wider">Open</TableHead>
            <TableHead className="text-right text-[10px] uppercase tracking-wider">Filled</TableHead>
            <TableHead className="text-right text-[10px] uppercase tracking-wider">Volume</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.label} className="border-b-border/20 last:border-0 hover:bg-accent/20">
              <TableCell>
                <Badge variant="outline" className="text-[10px] font-bold px-2 py-0">{row.label}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono text-sm tabular-nums font-semibold text-blue-400">
                {row.openOrders.toLocaleString()}
              </TableCell>
              <TableCell className="text-right font-mono text-sm tabular-nums font-semibold text-green-500">
                {row.filledOrders.toLocaleString()}
              </TableCell>
              <TableCell className="text-right font-mono text-sm tabular-nums font-semibold">
                {row.volumeText}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

/* ---------- main component ---------- */

export function StatsPage() {
  const { pair } = useParams<{ pair?: string }>();
  const navigate = useNavigate();
  const raceCfg: PublicApiConfig = {
    baseUrl: import.meta.env.VITE_API_BASE_URL || 'https://ai-api.open4dev.xyz',
  };

  const [selectedPairIdx, setSelectedPairIdx] = useState(() => pairIdxFromSlug(pair ?? null));
  const [tokenPrices, setTokenPrices] = useState<Map<string, number>>(new Map());

  // Open4Dev order book state
  const [book, setBook] = useState<DexOrderBookResponse | null>(null);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [pairStats, setPairStats] = useState<ScannerStatsResponse | null>(null);
  const [realStats24h, setRealStats24h] = useState<RealPairStats24h | null>(null);
  const [tradingPeriods, setTradingPeriods] = useState<TradingPeriodsState | null>(null);

  const pairs = DEFAULT_PAIRS;
  const effectivePair = pairs[selectedPairIdx] ?? pairs[0];

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
      // Use a single direction (fromSymbol -> toSymbol) for trading stats
      const stats = await getDexTradingStats(effectivePair.fromSymbol, effectivePair.toSymbol);

      const period24h = stats.periods.find((p) => p.period === '24h') ?? null;

      setRealStats24h({
        bidOrders: period24h?.total_orders ?? null,
        askOrders: period24h?.total_orders ?? null,
        bidVolume: period24h?.total_volume ?? null,
        askVolume: period24h?.total_volume ?? null,
        bidVolumeSymbol: effectivePair.fromSymbol,
        askVolumeSymbol: effectivePair.fromSymbol,
      });
      setTradingPeriods({
        bid: stats.periods,
        ask: stats.periods,
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
          if (t.price_usd > 0 && t.price_usd < 1_000_000) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raceCfg.baseUrl]);

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
  const rawAmountPrice = priceOf(effectivePair.toSymbol);
  const amountPriceUsd = rawAmountPrice != null && rawAmountPrice <= 1000 ? rawAmountPrice : null;
  const fromUpper = effectivePair.fromSymbol;
  const toUpper = effectivePair.toSymbol;
  // Trading stats: volumes are in from_token human units (divided by from_decimals in API).
  // Multiply by from_token USD price to get volume in USD.
  // For USDT/BUILD: from=USDT, volume in USDT human → × $1 = USD directly.
  // For AGNT/USDT: from=AGNT, volume in AGNT human → × AGNT_price = USD.
  const activityVolumeUsd = useMemo<ActivityVolumeUsdByWindow | null>(() => {
    if (!tradingPeriods) return null;

    const periods = tradingPeriods.bid; // bid and ask are the same (single direction fetch)
    const getPeriod = (period: string) => periods.find((p) => p.period === period) ?? null;
    const getMaxPeriod = () => periods.find((p) => p.period === '30d') ?? periods[periods.length - 1] ?? null;

    // fromPriceUsd = USD price of the from_symbol token
    const fPrice = fromPriceUsd ?? 1;

    const vol = (p: DexTradingStatsPeriod | null): number | null => {
      if (!p || p.total_volume <= 0) return null;
      const usd = p.total_volume * fPrice;
      return usd > 0 && usd < 1_000_000_000 ? usd : null;
    };

    const vol1h = vol(getPeriod('1h'));
    const vol24h = vol(getPeriod('24h'));
    const volMax = vol(getMaxPeriod());

    return { '1h': vol1h, '24h': vol24h, max: volMax };
  }, [tradingPeriods, fromPriceUsd]);

  const selectPair = useCallback(
    (idx: number) => {
      setSelectedPairIdx(idx);
      navigate(`/stats/${pairs[idx].slug}`);
    },
    [navigate, pairs],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <BarChart3 className="h-5 w-5 text-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Order Book</h1>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              <p className="text-xs text-muted-foreground">
                Live data by{' '}
                <a
                  href="https://github.com/tongateway"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-foreground underline-offset-4 hover:underline"
                >
                  tongateway
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {pairs.map((p, idx) => {
          const isSelected = selectedPairIdx === idx;
          return (
            <Button
              key={p.slug}
              size="sm"
              variant={isSelected ? 'default' : 'outline'}
              className="rounded-full pl-1.5 pr-4 gap-2"
              onClick={() => selectPair(idx)}
              type="button"
            >
              <span className="flex items-center -space-x-1.5">
                <TokenLogo symbol={p.fromSymbol} size="h-5 w-5" />
                <TokenLogo symbol={p.toSymbol} size="h-5 w-5" />
              </span>
              {p.label}
            </Button>
          );
        })}
      </div>

      {bookError ? (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-red-500">{bookError}</div>
          </CardContent>
        </Card>
      ) : bookLoading && !book ? (
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-center py-10">
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </CardContent>
        </Card>
      ) : normalized && stats ? (
        <OrderBookTable
          normalized={normalized}
          stats={stats}
          fromUpper={fromUpper}
          toUpper={toUpper}
          fromPriceUsd={fromPriceUsd}
          amountPriceUsd={amountPriceUsd}
          refreshTick={refreshTick}
          sourceLabel="tongateway is data provider"
          realStats24h={realStats24h}
        />
      ) : null}

      {pairStats ? (
        <PairActivityRow
          stats={pairStats}
          fromSymbol={fromUpper}
          toSymbol={toUpper}
          volumeUsdByWindow={activityVolumeUsd}
          tradingPeriods={tradingPeriods}
        />
      ) : (
        <Card className="py-0">
          <CardContent className="p-3">
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
