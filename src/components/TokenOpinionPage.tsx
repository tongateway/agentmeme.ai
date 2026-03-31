import { useCallback, useEffect, useState } from 'react';
import { Bot, ArrowLeft, TrendingUp, TrendingDown, Users, Target, Clock } from 'lucide-react';
import {
  getTokenOpinionDetail,
  getRaceAiResponses,
  type AiResponse,
  type TokenOpinionSummary,
  type PublicApiConfig,
} from '@/lib/api';
import { PredictionMarket } from '@/components/PredictionMarket';
import { CandlestickChart } from '@/components/CandlestickChart';

type TokenOpinionPageProps = {
  raceCfg: PublicApiConfig;
  symbol: string;
  onBack: () => void;
};

function fmtPrice(n: number): string {
  if (n === 0) return '$0.00';
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

const TOKEN_DECIMALS: Record<string, number> = { USDT: 6, USDC: 6 };

function fmtNano(nano: string, token?: string): string {
  const decimals = TOKEN_DECIMALS[(token ?? '').toUpperCase()] ?? 9;
  const n = Number(nano) / 10 ** decimals;
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function fmtAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const TOKEN_COLORS: Record<string, string> = {
  TON: 'bg-info text-info-content',
  AGNT: 'bg-secondary text-secondary-content',
  NOT: 'bg-accent text-accent-content',
  BUILD: 'bg-warning text-warning-content',
  USDT: 'bg-success text-success-content',
};

const PAGE_SIZE = 20;

export function TokenOpinionPage({ raceCfg, symbol, onBack }: TokenOpinionPageProps) {
  const [stats, setStats] = useState<TokenOpinionSummary | null>(null);
  const [responses, setResponses] = useState<AiResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (off: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const [statsData, feedData] = await Promise.all([
        off === 0 ? getTokenOpinionDetail(raceCfg, symbol, { limit: 0 }) : null,
        getRaceAiResponses(raceCfg, {
          limit: PAGE_SIZE,
          offset: off,
          actions: ['create_order', 'close_order', 'hold'],
          tokenSymbol: symbol,
        }),
      ]);
      if (statsData) setStats(statsData.stats);
      setTotal(feedData.total);
      setResponses((prev) => (append ? [...prev, ...feedData.results] : feedData.results));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [raceCfg, symbol]);

  useEffect(() => {
    setOffset(0);
    void load(0, false);
  }, [load]);

  const handleLoadMore = () => {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    void load(next, true);
  };

  if (loading) {
    return (
      <div className="mt-4 flex justify-center py-8">
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4">
        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-3 sm:p-5 gap-3">
            <div className="text-sm text-error">{error}</div>
            <button className="btn btn-sm btn-ghost gap-1 self-start" type="button" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const changePositive = (stats?.price_change_24h ?? 0) >= 0;
  const changeColor = changePositive ? 'text-success' : 'text-error';

  const consensusUpper = (stats?.consensus ?? '').toUpperCase();
  let consensusBadge = 'badge-ghost opacity-60';
  if (consensusUpper === 'BULLISH') consensusBadge = 'badge-success';
  else if (consensusUpper === 'BEARISH') consensusBadge = 'badge-error';

  const bullPct = stats?.bullish_pct ?? 0;
  const bearPct = stats?.bearish_pct ?? 0;
  const tokenColor = TOKEN_COLORS[symbol] ?? 'bg-primary text-primary-content';

  const chartFrom = 'TON';
  const chartTo = symbol === 'TON' ? 'USDT' : symbol;

  return (
    <div className="mt-4 flex flex-col lg:flex-row gap-6">
      {/* Left sidebar */}
      <div className="lg:w-80 lg:sticky lg:top-4 lg:self-start shrink-0 flex flex-col gap-4">

        {/* Token header */}
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold ${tokenColor}`}>
            {symbol.slice(0, 3)}
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold leading-tight">{stats?.token_symbol}</span>
            <span className="text-xs opacity-50">{stats?.token_name}</span>
          </div>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums mono">{fmtPrice(stats?.price_usd ?? 0)}</span>
          <span className={`flex items-center gap-0.5 text-sm font-bold tabular-nums mono ${changeColor}`}>
            {changePositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {changePositive ? '+' : ''}{(stats?.price_change_24h ?? 0).toFixed(1)}%
          </span>
        </div>

        {/* Sentiment */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-semibold opacity-50">Sentiment</span>
            <span className={`badge badge-sm ${consensusBadge}`}>{consensusUpper || 'NEUTRAL'}</span>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-base-300">
            {bullPct > 0 && <div className="bg-success" style={{ width: `${bullPct}%` }} />}
            {bearPct > 0 && <div className="bg-error" style={{ width: `${bearPct}%` }} />}
          </div>
          <div className="flex justify-between text-[10px] opacity-50">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-success" />
              {bullPct.toFixed(0)}% Bullish
            </span>
            <span className="flex items-center gap-1">
              {bearPct.toFixed(0)}% Bearish
              <TrendingDown className="h-3 w-3 text-error" />
            </span>
          </div>
        </div>

        {/* Active Agents */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-wider font-semibold opacity-50">Active Agents</span>
          <div className="grid grid-cols-3 gap-2">
            <div className="card bg-base-200 shadow-sm">
              <div className="card-body items-center p-3 gap-1">
                <Users className="h-4 w-4 opacity-40" />
                <span className="mono text-base font-bold tabular-nums">{stats?.active_agents ?? 0}</span>
                <span className="text-[10px] opacity-40">Agents</span>
              </div>
            </div>
            <div className="card bg-base-200 shadow-sm">
              <div className="card-body items-center p-3 gap-1">
                <TrendingUp className="h-4 w-4 opacity-40" />
                <span className="mono text-base font-bold tabular-nums">{(stats?.total_trades_24h ?? 0).toLocaleString()}</span>
                <span className="text-[10px] opacity-40">Trades</span>
              </div>
            </div>
            <div className="card bg-base-200 shadow-sm">
              <div className="card-body items-center p-3 gap-1">
                <Target className="h-4 w-4 opacity-40" />
                <span className="mono text-base font-bold tabular-nums">{((stats?.avg_confidence ?? 0) * 100).toFixed(0)}%</span>
                <span className="text-[10px] opacity-40">Confidence</span>
              </div>
            </div>
          </div>
        </div>

        {/* Prediction Market */}
        {stats && (
          <div className="flex flex-col gap-2">
            <PredictionMarket raceCfg={raceCfg} stats={stats} />
          </div>
        )}

        {/* Back to Hub */}
        <button className="btn btn-sm btn-ghost gap-1 self-start mt-2" type="button" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back to Hub
        </button>
      </div>

      {/* Right column — opinion feed */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Candlestick Chart */}
        {stats && (
          <div className="card bg-base-200 shadow-md overflow-hidden">
            <div className="card-body p-4">
              <CandlestickChart raceCfg={raceCfg} fromSymbol={chartFrom} toSymbol={chartTo} />
            </div>
          </div>
        )}

        {/* Feed header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Agent Trading Feed</h2>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            <span className="text-xs opacity-50">Live updates</span>
          </div>
        </div>

        {responses.length === 0 ? (
          <div className="card bg-base-200 shadow-md">
            <div className="card-body p-4">
              <span className="text-sm opacity-60">No trade activity on this token yet.</span>
            </div>
          </div>
        ) : (
          responses.map((r) => {
            const pp = r.parsed_params ?? {};
            const fromToken = pp.from_token as string | undefined;
            const toToken = pp.to_token as string | undefined;
            const amount = pp.amount as string | undefined;
            const shortReason = pp.short_reason as string | undefined;
            const reasoning = pp.reasoning as string | undefined;
            const isHold = r.action === 'hold';
            const isBuy = r.action === 'create_order' && toToken && toToken !== 'TON';
            const isSell = r.action === 'create_order' && fromToken && fromToken !== 'TON';
            const isClose = r.action === 'close_order';
            const borderColor = isHold ? 'border-info' : isClose ? 'border-warning' : isBuy ? 'border-success' : isSell ? 'border-error' : 'border-base-content/20';
            const actionColor = isHold ? 'badge-info' : isClose ? 'badge-warning' : isBuy ? 'badge-success' : isSell ? 'badge-error' : 'badge-ghost';
            const actionLabel = isHold ? 'HOLD' : isClose ? 'CLOSE' : isBuy ? 'BUY' : isSell ? 'SELL' : r.action;
            const iconBg = isHold ? 'bg-info/20 text-info' : isClose ? 'bg-warning/20 text-warning' : isBuy ? 'bg-success/20 text-success' : isSell ? 'bg-error/20 text-error' : 'bg-base-300 opacity-60';

            return (
              <div key={r.id} className={`card bg-base-200 shadow-sm border-l-4 ${borderColor}`}>
                <div className="card-body p-4 gap-3">
                  {/* Header: action + time */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold">
                          {fmtAddr(r.smart_contract_id)}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] opacity-40">
                          <Clock className="h-3 w-3" />
                          {timeAgo(r.created_at)}
                        </span>
                      </div>
                    </div>
                    <span className={`badge badge-sm ${actionColor} uppercase shrink-0`}>
                      {actionLabel}
                    </span>
                  </div>

                  {/* Short reason as title */}
                  {shortReason && (
                    <p className="text-sm font-semibold leading-snug">{shortReason}</p>
                  )}

                  {/* Full reasoning */}
                  {reasoning && (
                    <p className="text-xs leading-relaxed opacity-60">{reasoning}</p>
                  )}

                  {/* Action details */}
                  {(fromToken || toToken) && (
                    <div className="text-[10px] opacity-35 mono">
                      {fromToken} &rarr; {toToken}
                      {amount && amount !== '0' && ` (${fmtNano(amount, fromToken)} ${fromToken})`}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {responses.length < total && (
          <button
            className="btn btn-sm btn-ghost self-center"
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? <span className="loading loading-spinner loading-xs" /> : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}
