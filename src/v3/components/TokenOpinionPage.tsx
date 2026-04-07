import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bot,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  Clock,
} from 'lucide-react';
import {
  getTokenOpinionDetail,
  getRaceAiResponses,
  type AiResponse,
  type TokenOpinionSummary,
  type PublicApiConfig,
} from '../../lib/api';
import { PredictionMarket } from './PredictionMarket';
import { CandlestickChart } from './CandlestickChart';
import { cn } from '../utils/cn';

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
      <div className="flex justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#00C389] border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-6">
        <div className="rounded-xl border border-white/5 bg-gray-900 p-6 flex flex-col gap-3">
          <p className="text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors self-start"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        </div>
      </div>
    );
  }

  const changePositive = (stats?.price_change_24h ?? 0) >= 0;
  const changeColor = changePositive ? 'text-[#00C389]' : 'text-red-400';

  const consensusUpper = (stats?.consensus ?? '').toUpperCase();
  let consensusClasses = 'bg-gray-700/50 text-gray-400';
  if (consensusUpper === 'BULLISH') consensusClasses = 'bg-[#00C389]/15 text-[#00C389]';
  else if (consensusUpper === 'BEARISH') consensusClasses = 'bg-red-500/15 text-red-400';

  const bullPct = stats?.bullish_pct ?? 0;
  const bearPct = stats?.bearish_pct ?? 0;

  const chartFrom = 'TON';
  const chartTo = symbol === 'TON' ? 'USDT' : symbol;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col lg:flex-row gap-6 py-6"
    >
      {/* ── Left Sidebar ── */}
      <div className="lg:w-80 lg:sticky lg:top-20 lg:self-start shrink-0 flex flex-col gap-5">

        {/* Token header */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00C389]/15 text-xs font-bold text-[#00C389]">
            {symbol.slice(0, 3)}
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold text-white leading-tight">{stats?.token_symbol}</span>
            <span className="text-xs text-gray-500">{stats?.token_name}</span>
          </div>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-bold tabular-nums text-white">
            {fmtPrice(stats?.price_usd ?? 0)}
          </span>
          <span className={cn('flex items-center gap-0.5 font-mono text-sm font-bold tabular-nums', changeColor)}>
            {changePositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {changePositive ? '+' : ''}{(stats?.price_change_24h ?? 0).toFixed(1)}%
          </span>
        </div>

        {/* Sentiment bar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Sentiment</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', consensusClasses)}>
              {consensusUpper || 'NEUTRAL'}
            </span>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-800">
            {bullPct > 0 && (
              <div className="bg-[#00C389] h-full" style={{ width: `${bullPct}%` }} />
            )}
            {bearPct > 0 && (
              <div className="bg-red-500 h-full" style={{ width: `${bearPct}%` }} />
            )}
          </div>
          <div className="flex justify-between text-[10px] text-gray-600">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-[#00C389]" />
              {bullPct.toFixed(0)}% Bullish
            </span>
            <span className="flex items-center gap-1">
              {bearPct.toFixed(0)}% Bearish
              <TrendingDown className="h-3 w-3 text-red-400" />
            </span>
          </div>
        </div>

        {/* Active agents stats */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Active Agents</span>
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: <Users className="h-4 w-4 text-gray-500" />, value: stats?.active_agents ?? 0, label: 'Agents' },
              { icon: <TrendingUp className="h-4 w-4 text-gray-500" />, value: (stats?.total_trades_24h ?? 0).toLocaleString(), label: 'Trades' },
              { icon: <Target className="h-4 w-4 text-gray-500" />, value: `${((stats?.avg_confidence ?? 0) * 100).toFixed(0)}%`, label: 'Conf.' },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-white/5 bg-gray-900 flex flex-col items-center gap-1 p-3"
              >
                {item.icon}
                <span className="font-mono text-sm font-bold tabular-nums text-white">{item.value}</span>
                <span className="text-[10px] text-gray-600">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Prediction Market */}
        {stats && <PredictionMarket raceCfg={raceCfg} stats={stats} />}

        {/* Back button */}
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors self-start mt-1"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Hub
        </button>
      </div>

      {/* ── Right Column ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">

        {/* Candlestick chart */}
        {stats && (
          <div className="rounded-xl border border-white/5 bg-gray-900 p-4 overflow-hidden">
            <CandlestickChart raceCfg={raceCfg} fromSymbol={chartFrom} toSymbol={chartTo} />
          </div>
        )}

        {/* Feed header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Agent Trading Feed</h2>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#00C389] animate-pulse" />
            <span className="text-xs text-gray-500">Live updates</span>
          </div>
        </div>

        {/* Feed cards */}
        {responses.length === 0 ? (
          <div className="rounded-xl border border-white/5 bg-gray-900 p-5">
            <span className="text-sm text-gray-500">No trade activity on this token yet.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {responses.map((r, i) => {
              const pp = r.parsed_params ?? {};
              const fromToken = pp.from_token as string | undefined;
              const toToken = pp.to_token as string | undefined;
              const amount = pp.amount as string | undefined;
              const shortReason = pp.short_reason as string | undefined;
              const humanOpinion = pp.human_opinion as string | undefined;
              const reasoning = pp.reasoning as string | undefined;
              const isBuy = toToken?.toUpperCase() === symbol;
              const borderColor = isBuy ? 'border-l-[#00C389]' : 'border-l-red-500';
              const actionClasses = isBuy
                ? 'bg-[#00C389]/15 text-[#00C389]'
                : 'bg-red-500/15 text-red-400';
              const iconBg = isBuy ? 'bg-[#00C389]/15 text-[#00C389]' : 'bg-red-500/15 text-red-400';
              const actionLabel = isBuy ? 'BUY' : 'SELL';

              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.03 }}
                  className={cn(
                    'rounded-xl border border-white/5 bg-gray-900 border-l-4 p-4 flex flex-col gap-3',
                    borderColor,
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', iconBg)}>
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-white">
                          {r.contract_name || fmtAddr(r.smart_contract_id)}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-gray-600">
                          <Clock className="h-3 w-3" />
                          {timeAgo(r.created_at)}
                        </span>
                      </div>
                    </div>
                    <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase shrink-0', actionClasses)}>
                      {actionLabel}
                    </span>
                  </div>

                  {shortReason && (
                    <p className="text-sm font-semibold leading-snug text-white">{shortReason}</p>
                  )}

                  {(humanOpinion || reasoning) && (
                    <p className="text-xs leading-relaxed text-gray-500">{humanOpinion || reasoning}</p>
                  )}

                  {(fromToken || toToken) && (
                    <div className="font-mono text-[10px] text-gray-700">
                      {fromToken} &rarr; {toToken}
                      {amount && amount !== '0' && ` (${fmtNano(amount, fromToken)} ${fromToken})`}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

        {responses.length < total && (
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="self-center rounded-lg border border-white/10 px-4 py-2 text-xs text-gray-400 hover:text-white hover:border-white/20 transition-colors disabled:opacity-50"
          >
            {loadingMore ? (
              <span className="inline-flex items-center gap-1.5">
                <div className="h-3 w-3 animate-spin rounded-full border border-gray-400 border-t-transparent" />
                Loading…
              </span>
            ) : (
              'Load more'
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
}
