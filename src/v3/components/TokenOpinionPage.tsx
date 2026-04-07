import { useCallback, useEffect, useState } from 'react';
import { Bot, ArrowLeft, TrendingUp, TrendingDown, Users, Target, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getTokenOpinionDetail,
  getRaceAiResponses,
  type AiResponse,
  type TokenOpinionSummary,
  type PublicApiConfig,
} from '@/lib/api';
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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4">
        <div className="rounded-xl border border-neutral-800/50 bg-neutral-900/50 p-4 flex flex-col gap-3">
          <p className="text-sm text-red-400">{error}</p>
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-sm text-neutral-400 hover:text-white transition-colors self-start"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
        </div>
      </div>
    );
  }

  const changePositive = (stats?.price_change_24h ?? 0) >= 0;
  const changeColorClass = changePositive ? 'text-emerald-400' : 'text-red-400';

  const consensusUpper = (stats?.consensus ?? '').toUpperCase();
  let consensusColor = 'bg-neutral-800 text-neutral-300';
  if (consensusUpper === 'BULLISH') consensusColor = 'bg-emerald-500/10 text-emerald-400';
  else if (consensusUpper === 'BEARISH') consensusColor = 'bg-red-500/10 text-red-400';

  const bullPct = stats?.bullish_pct ?? 0;
  const bearPct = stats?.bearish_pct ?? 0;
  const tokenBg = TOKEN_BG[symbol] ?? 'bg-violet-500';

  const chartFrom = 'TON';
  const chartTo = symbol === 'TON' ? 'USDT' : symbol;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="mt-4 flex flex-col lg:flex-row gap-6"
    >
      {/* ── Left Sidebar ── */}
      <div className="lg:w-80 lg:sticky lg:top-4 lg:self-start shrink-0 flex flex-col gap-4">

        {/* Token header */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-3"
        >
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white shrink-0',
              tokenBg,
            )}
          >
            {symbol.slice(0, 3)}
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold leading-tight text-white">{stats?.token_symbol}</span>
            <span className="text-xs text-neutral-500">{stats?.token_name}</span>
          </div>
        </motion.div>

        {/* Price + 24h change */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums font-mono text-white">
            {fmtPrice(stats?.price_usd ?? 0)}
          </span>
          <span className={cn('flex items-center gap-0.5 text-sm font-bold tabular-nums font-mono', changeColorClass)}>
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
            <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
              Sentiment
            </span>
            <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase', consensusColor)}>
              {consensusUpper || 'NEUTRAL'}
            </span>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-black/50">
            {bullPct > 0 && (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${bullPct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="bg-emerald-500"
              />
            )}
            {bearPct > 0 && (
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${bearPct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                className="bg-red-500"
              />
            )}
          </div>
          <div className="flex justify-between text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
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
          {[
            { icon: <Users className="h-4 w-4 text-gray-500" />, value: stats?.active_agents ?? 0, label: 'Agents' },
            { icon: <TrendingUp className="h-4 w-4 text-gray-500" />, value: (stats?.total_trades_24h ?? 0).toLocaleString(), label: 'Trades' },
            { icon: <Target className="h-4 w-4 text-gray-500" />, value: `${((stats?.avg_confidence ?? 0) * 100).toFixed(0)}%`, label: 'Confidence' },
          ].map(({ icon, value, label }) => (
            <div
              key={label}
              className="rounded-xl border border-neutral-800/50 bg-neutral-900/50 p-3 flex flex-col items-center gap-1"
            >
              {icon}
              <span className="font-mono text-base font-bold tabular-nums text-white">{value}</span>
              <span className="text-[10px] text-gray-500">{label}</span>
            </div>
          ))}
        </div>

        {/* Prediction Market */}
        {stats && <PredictionMarket raceCfg={raceCfg} stats={stats} />}

        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors self-start mt-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Hub
        </button>
      </div>

      {/* ── Right Column ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Candlestick Chart */}
        {stats && <CandlestickChart raceCfg={raceCfg} fromSymbol={chartFrom} toSymbol={chartTo} />}

        {/* Feed header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Agent Trading Feed</h2>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-neutral-500">Live updates</span>
          </div>
        </div>

        {/* Trade cards */}
        <AnimatePresence mode="popLayout">
          {responses.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-xl border border-neutral-800/50 bg-neutral-900/50 p-4"
            >
              <span className="text-sm text-gray-400">No trade activity on this token yet.</span>
            </motion.div>
          ) : (
            responses.map((r, idx) => {
              const pp = r.parsed_params ?? {};
              const fromToken = pp.from_token as string | undefined;
              const toToken = pp.to_token as string | undefined;
              const amount = pp.amount as string | undefined;
              const shortReason = pp.short_reason as string | undefined;
              const humanOpinion = pp.human_opinion as string | undefined;
              const reasoning = pp.reasoning as string | undefined;
              const isBuy = toToken?.toUpperCase() === symbol;
              const actionLabel = isBuy ? 'BUY' : 'SELL';

              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.03 }}
                  className={cn(
                    'rounded-xl border border-neutral-800/50 bg-neutral-900/50 p-4 flex flex-col gap-3',
                    isBuy ? 'border-l-4 border-l-emerald-500/50' : 'border-l-4 border-l-red-500/50',
                  )}
                >
                  {/* Header: bot icon + name + time + badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                          isBuy
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-red-500/10 text-red-400',
                        )}
                      >
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-white">
                          {r.contract_name || fmtAddr(r.smart_contract_id)}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] text-gray-500">
                          <Clock className="h-3 w-3" />
                          {timeAgo(r.created_at)}
                        </span>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'shrink-0 text-[11px] font-bold uppercase px-2 py-0.5 rounded-full',
                        isBuy
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-red-500/10 text-red-400',
                      )}
                    >
                      {actionLabel}
                    </span>
                  </div>

                  {/* Short reason */}
                  {shortReason && (
                    <p className="text-sm font-semibold leading-snug text-white">{shortReason}</p>
                  )}

                  {/* Human opinion / reasoning */}
                  {(humanOpinion || reasoning) && (
                    <p className="text-xs leading-relaxed text-gray-400">
                      {humanOpinion || reasoning}
                    </p>
                  )}

                  {/* Token route + amount */}
                  {(fromToken || toToken) && (
                    <div className="text-[10px] text-gray-600 font-mono">
                      {fromToken} &rarr; {toToken}
                      {amount && amount !== '0' && ` (${fmtNano(amount, fromToken)} ${fromToken})`}
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </AnimatePresence>

        {/* Load more */}
        {responses.length < total && (
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="self-center px-4 py-2 text-sm text-neutral-400 hover:text-white border border-neutral-800 rounded-lg bg-neutral-900/50 hover:bg-neutral-800/50 transition-all disabled:opacity-50"
          >
            {loadingMore ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
            ) : (
              'Load more'
            )}
          </button>
        )}
      </div>
    </motion.div>
  );
}
