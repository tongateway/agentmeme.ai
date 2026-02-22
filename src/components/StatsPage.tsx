import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, ArrowDownUp } from 'lucide-react';
import { getDexOrderBook, getRaceTokens, type OrderBookResponse, type PublicApiConfig } from '@/lib/api';

/* ---------- pair definitions ---------- */

type TradingPair = {
  label: string;
  fromSymbol: string;
  toSymbol: string;
};

const DEFAULT_PAIRS: TradingPair[] = [
  { label: 'TON / NOT',   fromSymbol: 'TON',   toSymbol: 'NOT' },
  { label: 'TON / BUILD', fromSymbol: 'TON',   toSymbol: 'BUILD' },
  { label: 'TON / USDT',  fromSymbol: 'TON',   toSymbol: 'jUSDT' },
  { label: 'NOT / BUILD', fromSymbol: 'NOT',   toSymbol: 'BUILD' },
  { label: 'NOT / USDT',  fromSymbol: 'NOT',   toSymbol: 'jUSDT' },
  { label: 'BUILD / USDT', fromSymbol: 'BUILD', toSymbol: 'jUSDT' },
];

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
 * The API returns asks and bids with different price directions:
 * - Bids: price_rate = fromSymbol per toSymbol (e.g. 0.000290 TON per NOT), amount in toSymbol
 * - Asks: price_rate = toSymbol per fromSymbol (e.g. 3,544 NOT per TON), amount in fromSymbol
 *
 * We normalize everything so:
 * - price = fromSymbol per toSymbol (same as bids)
 * - amount = in toSymbol for bids, in fromSymbol for asks (converted to toSymbol via price)
 */
type NormalizedLevel = {
  price: number;       // always fromSymbol per toSymbol
  amount: number;      // always in toSymbol
  orderCount: number;
};

function normalizeBook(book: OrderBookResponse): {
  asks: NormalizedLevel[];
  bids: NormalizedLevel[];
} {
  // Bids are already in the right format: price = from/to, amount = toSymbol
  const bids: NormalizedLevel[] = book.bids.map((b) => ({
    price: b.price_rate,
    amount: b.total_amount,
    orderCount: b.order_count,
  }));

  // Asks: price_rate is inverted (to/from), amount is in fromSymbol
  // Convert: price = 1/ask.price_rate, amount = ask.total_amount * ask.price_rate (from→to)
  const asks: NormalizedLevel[] = book.asks
    .filter((a) => a.price_rate > 0)
    .map((a) => ({
      price: 1 / a.price_rate,
      amount: a.total_amount * a.price_rate,
      orderCount: a.order_count,
    }));

  // Sort asks: lowest price first (closest to spread)
  asks.sort((a, b) => a.price - b.price);
  // Sort bids: highest price first (closest to spread)
  bids.sort((a, b) => b.price - a.price);

  return { asks, bids };
}

/* ---------- main component ---------- */

type StatsPageProps = {
  raceCfg: PublicApiConfig;
};

export function StatsPage({ raceCfg }: StatsPageProps) {
  const [selectedPairIdx, setSelectedPairIdx] = useState(0);
  const [book, setBook] = useState<OrderBookResponse | null>(null);
  const [bookLoading, setBookLoading] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [reversed, setReversed] = useState(false);
  const [tokenPrices, setTokenPrices] = useState<Map<string, number>>(new Map());

  const pairs = DEFAULT_PAIRS;
  const currentPair = pairs[selectedPairIdx] ?? pairs[0];

  const effectivePair = useMemo(() => {
    if (!reversed) return currentPair;
    return {
      ...currentPair,
      label: `${currentPair.toSymbol.toUpperCase()} / ${currentPair.fromSymbol.toUpperCase()}`,
      fromSymbol: currentPair.toSymbol,
      toSymbol: currentPair.fromSymbol,
    };
  }, [currentPair, reversed]);

  const fetchBook = useCallback(async () => {
    setBookLoading(true);
    setBookError(null);
    try {
      const data = await getDexOrderBook({
        fromSymbol: effectivePair.fromSymbol,
        toSymbol: effectivePair.toSymbol,
        limit: 15,
      });
      setBook(data);
    } catch (e) {
      setBookError(e instanceof Error ? e.message : String(e));
    } finally {
      setBookLoading(false);
    }
  }, [effectivePair.fromSymbol, effectivePair.toSymbol]);

  useEffect(() => {
    void fetchBook();
  }, [fetchBook]);

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

  // Normalize the raw book so all prices & amounts are in the same direction
  const normalized = useMemo(() => {
    if (!book) return null;
    return normalizeBook(book);
  }, [book]);

  // Compute global max for bar sizing (amounts now all in toSymbol)
  const maxAmount = useMemo(() => {
    if (!normalized) return 0;
    const maxAsk = Math.max(...normalized.asks.map((a) => a.amount), 0);
    const maxBid = Math.max(...normalized.bids.map((b) => b.amount), 0);
    return Math.max(maxAsk, maxBid);
  }, [normalized]);

  // Summary stats (using normalized prices)
  const stats = useMemo(() => {
    if (!normalized) return null;
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
  }, [normalized]);

  // Asks reversed: highest price at top, lowest near spread
  const asksReversed = useMemo(() => {
    if (!normalized) return [];
    return [...normalized.asks].reverse();
  }, [normalized]);

  // Amount is always in toSymbol now
  const amountPriceUsd = priceOf(effectivePair.toSymbol);
  const fromUpper = effectivePair.fromSymbol.toUpperCase();
  const toUpper = effectivePair.toSymbol.toUpperCase();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Order Book</h1>
            <p className="text-xs opacity-50">Live from open4dev DEX</p>
          </div>
        </div>

        <button
          className={`btn btn-ghost btn-sm gap-1.5 ${bookLoading ? 'btn-disabled' : ''}`}
          onClick={() => void fetchBook()}
          type="button"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${bookLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Pair Switcher — compact */}
      <div className="flex flex-wrap items-center gap-2">
        {pairs.map((p, idx) => (
          <button
            key={`${p.fromSymbol}-${p.toSymbol}`}
            className={`btn btn-xs ${
              selectedPairIdx === idx && !reversed
                ? 'btn-primary'
                : 'btn-ghost border border-base-content/10'
            }`}
            onClick={() => { setSelectedPairIdx(idx); setReversed(false); }}
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

      {/* Compact stat row ABOVE the book */}
      {stats && !bookLoading && (
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
            {(() => {
              const p = priceOf(effectivePair.toSymbol);
              return p != null ? <span className="text-[10px] opacity-40 mono">~{fmtUsd(stats.totalBidAmount * p)}</span> : null;
            })()}
          </div>
          <div className="badge badge-lg gap-1.5 py-3">
            <span className="text-[10px] opacity-50">Ask Vol</span>
            <span className="text-xs font-semibold mono text-error">{fmtAmount(stats.totalAskAmount)}</span>
            <span className="text-[10px] opacity-40">{toUpper}</span>
            {(() => {
              const p = priceOf(effectivePair.toSymbol);
              return p != null ? <span className="text-[10px] opacity-40 mono">~{fmtUsd(stats.totalAskAmount * p)}</span> : null;
            })()}
          </div>
        </div>
      )}

      {/* Order Book Card — single column exchange style */}
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
      ) : normalized ? (
        <div className="card bg-base-200 shadow-md overflow-hidden">
          <div className="card-body p-0">
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
                    <div key={`ask-${i}`} className="relative flex items-center gap-2 px-3 py-1 text-xs mono">
                      <div
                        className="absolute inset-y-0 right-0 bg-error/10 transition-all"
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
              {stats?.spreadPct != null && (
                <span className="badge badge-xs badge-ghost mono">
                  Spread {stats.spreadPct.toFixed(2)}%
                </span>
              )}
              <span className="flex-1" />
              {stats && (
                <div className="flex items-center gap-2 text-[10px] opacity-50">
                  <span className="text-success">{stats.totalBidOrders} bids</span>
                  <span className="opacity-30">|</span>
                  <span className="text-error">{stats.totalAskOrders} asks</span>
                </div>
              )}
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
                    <div key={`bid-${i}`} className="relative flex items-center gap-2 px-3 py-1 text-xs mono">
                      <div
                        className="absolute inset-y-0 right-0 bg-success/10 transition-all"
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
      ) : null}
    </div>
  );
}
