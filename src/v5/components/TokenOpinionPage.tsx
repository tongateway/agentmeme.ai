import { useCallback, useEffect, useState } from 'react';
import { Bot, ArrowLeft, TrendingUp, TrendingDown, Users, Target, Clock } from 'lucide-react';
import {
  getTokenOpinionDetail,
  getRaceAiResponses,
  type AiResponse,
  type TokenOpinionSummary,
  type PublicApiConfig,
} from '@/lib/api';
import { PredictionMarket } from './PredictionMarket';
import { CandlestickChart } from './CandlestickChart';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

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

const TOKEN_BG: Record<string, string> = {
  TON: 'bg-sky-500',
  AGNT: 'bg-violet-500',
  NOT: 'bg-fuchsia-500',
  BUILD: 'bg-amber-500',
  USDT: 'bg-emerald-500',
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

  const load = useCallback(
    async (off: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const [statsData, feedData] = await Promise.all([
          off === 0 ? getTokenOpinionDetail(raceCfg, symbol, { limit: 0 }) : null,
          getRaceAiResponses(raceCfg, {
            limit: PAGE_SIZE,
            offset: off,
            actions: ['create_order'],
            tokenSymbol: symbol,
          }),
        ]);
        if (statsData) setStats(statsData.stats);
        const sym = symbol.toUpperCase();
        const relevant = feedData.results.filter((r) => {
          const pp = r.parsed_params ?? {};
          return (
            (pp.to_token as string)?.toUpperCase() === sym ||
            (pp.from_token as string)?.toUpperCase() === sym
          );
        });
        setTotal(feedData.total);
        setResponses((prev) => (append ? [...prev, ...relevant] : relevant));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [raceCfg, symbol],
  );

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
      <div className="mt-4 flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4">
        <Card>
          <CardContent className="p-4 flex flex-col gap-3">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <Button variant="ghost" size="sm" className="gap-1 self-start" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const changePositive = (stats?.price_change_24h ?? 0) >= 0;
  const changeColorClass = changePositive
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-red-600 dark:text-red-400';

  const consensusUpper = (stats?.consensus ?? '').toUpperCase();
  let consensusBadgeVariant: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (consensusUpper === 'BULLISH') consensusBadgeVariant = 'bullish';
  else if (consensusUpper === 'BEARISH') consensusBadgeVariant = 'bearish';

  const bullPct = stats?.bullish_pct ?? 0;
  const bearPct = stats?.bearish_pct ?? 0;
  const tokenBg = TOKEN_BG[symbol] ?? 'bg-violet-500';

  const chartFrom = 'TON';
  const chartTo = symbol === 'TON' ? 'USDT' : symbol;

  return (
    <div className="mt-4 flex flex-col lg:flex-row gap-6">
      {/* ── Left Sidebar ── */}
      <div className="lg:w-80 lg:sticky lg:top-4 lg:self-start shrink-0 flex flex-col gap-4">

        {/* Token header */}
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white ${tokenBg}`}
          >
            {symbol.slice(0, 3)}
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold leading-tight">{stats?.token_symbol}</span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{stats?.token_name}</span>
          </div>
        </div>

        {/* Price + 24h change */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums font-mono">
            {fmtPrice(stats?.price_usd ?? 0)}
          </span>
          <span className={`flex items-center gap-0.5 text-sm font-bold tabular-nums font-mono ${changeColorClass}`}>
            {changePositive ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {changePositive ? '+' : ''}
            {(stats?.price_change_24h ?? 0).toFixed(1)}%
          </span>
        </div>

        {/* Sentiment bar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400">
              Sentiment
            </span>
            <Badge variant={consensusBadgeVariant}>{consensusUpper || 'NEUTRAL'}</Badge>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800">
            {bullPct > 0 && (
              <div className="bg-emerald-500 transition-all" style={{ width: `${bullPct}%` }} />
            )}
            {bearPct > 0 && (
              <div className="bg-red-500 transition-all" style={{ width: `${bearPct}%` }} />
            )}
          </div>
          <div className="flex justify-between text-[10px] text-neutral-400">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-500" />
              {bullPct.toFixed(0)}% Bullish
            </span>
            <span className="flex items-center gap-1">
              {bearPct.toFixed(0)}% Bearish
              <TrendingDown className="h-3 w-3 text-red-500" />
            </span>
          </div>
        </div>

        {/* 3 stat cards */}
        <div className="grid grid-cols-3 gap-2">
          <Card>
            <CardContent className="flex flex-col items-center p-3 gap-1">
              <Users className="h-4 w-4 text-neutral-400" />
              <span className="font-mono text-base font-bold tabular-nums">
                {stats?.active_agents ?? 0}
              </span>
              <span className="text-[10px] text-neutral-400">Agents</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center p-3 gap-1">
              <TrendingUp className="h-4 w-4 text-neutral-400" />
              <span className="font-mono text-base font-bold tabular-nums">
                {(stats?.total_trades_24h ?? 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-neutral-400">Trades</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center p-3 gap-1">
              <Target className="h-4 w-4 text-neutral-400" />
              <span className="font-mono text-base font-bold tabular-nums">
                {((stats?.avg_confidence ?? 0) * 100).toFixed(0)}%
              </span>
              <span className="text-[10px] text-neutral-400">Confidence</span>
            </CardContent>
          </Card>
        </div>

        {/* Prediction Market */}
        {stats && <PredictionMarket raceCfg={raceCfg} stats={stats} />}

        {/* Back button */}
        <Button variant="ghost" size="sm" className="gap-1 self-start mt-2" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" /> Back to Hub
        </Button>
      </div>

      {/* ── Right Column ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Candlestick Chart */}
        {stats && <CandlestickChart raceCfg={raceCfg} fromSymbol={chartFrom} toSymbol={chartTo} />}

        {/* Feed header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Agent Trading Feed</h2>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-neutral-400">Live updates</span>
          </div>
        </div>

        {/* Trade cards */}
        {responses.length === 0 ? (
          <Card>
            <CardContent className="p-4">
              <span className="text-sm text-neutral-400">No trade activity on this token yet.</span>
            </CardContent>
          </Card>
        ) : (
          responses.map((r) => {
            const pp = r.parsed_params ?? {};
            const fromToken = pp.from_token as string | undefined;
            const toToken = pp.to_token as string | undefined;
            const amount = pp.amount as string | undefined;
            const shortReason = pp.short_reason as string | undefined;
            const humanOpinion = pp.human_opinion as string | undefined;
            const reasoning = pp.reasoning as string | undefined;
            const isBuy = toToken?.toUpperCase() === symbol;
            const actionLabel = isBuy ? 'BUY' : 'SELL';
            const borderClass = isBuy
              ? 'border-l-4 border-l-emerald-500'
              : 'border-l-4 border-l-red-500';
            const iconBgClass = isBuy
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
              : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400';

            return (
              <Card key={r.id} className={borderClass}>
                <CardContent className="p-4 flex flex-col gap-3">
                  {/* Header: bot icon + name + time + badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBgClass}`}
                      >
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold">
                          {r.contract_name || fmtAddr(r.smart_contract_id)}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-neutral-400">
                          <Clock className="h-3 w-3" />
                          {timeAgo(r.created_at)}
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant={isBuy ? 'success' : 'destructive'}
                      className="shrink-0 uppercase"
                    >
                      {actionLabel}
                    </Badge>
                  </div>

                  {/* Short reason */}
                  {shortReason && (
                    <p className="text-sm font-semibold leading-snug">{shortReason}</p>
                  )}

                  {/* Human opinion / reasoning */}
                  {(humanOpinion || reasoning) && (
                    <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                      {humanOpinion || reasoning}
                    </p>
                  )}

                  {/* Token route + amount */}
                  {(fromToken || toToken) && (
                    <div className="text-[10px] text-neutral-300 dark:text-neutral-600 font-mono">
                      {fromToken} &rarr; {toToken}
                      {amount && amount !== '0' && ` (${fmtNano(amount, fromToken)} ${fromToken})`}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}

        {/* Load more */}
        {responses.length < total && (
          <Button
            variant="ghost"
            size="sm"
            className="self-center"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            ) : (
              'Load more'
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
