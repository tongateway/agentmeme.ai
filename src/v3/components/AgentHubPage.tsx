import { useCallback, useEffect, useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import {
  Bot,
  TrendingUp,
  TrendingDown,
  Target,
  ChevronRight,
  Trophy,
  Rocket,
} from 'lucide-react';
import {
  getTokenOpinions,
  getRaceLeaderboard,
  type TokenOpinionSummary,
  type LeaderboardEntry,
  type PublicApiConfig,
} from '../../lib/api';
import { cn } from '../utils/cn';

type AgentHubPageProps = {
  raceCfg: PublicApiConfig;
  onSelectToken: (symbol: string) => void;
  onDeploy?: () => void;
  onViewLeaderboard?: () => void;
};

function computeSignalStrength(
  token: TokenOpinionSummary,
  maxAgents: number,
  maxTrades: number,
): number {
  const consensusWeight = Math.max(token.bullish_pct, token.bearish_pct) / 100;
  const agentWeight = maxAgents > 0 ? token.active_agents / maxAgents : 0;
  const volumeWeight = maxTrades > 0 ? (token.total_trades_24h || 0) / maxTrades : 0;
  return (
    consensusWeight * 0.4 +
    token.avg_confidence * 0.3 +
    agentWeight * 0.15 +
    volumeWeight * 0.15
  ) * 10;
}

function signalColor(signal: number): string {
  if (signal >= 7) return 'text-[#00C389]';
  if (signal >= 4) return 'text-yellow-400';
  return 'text-gray-600';
}

function fmtPrice(n: number): string {
  if (n === 0) return '$0.00';
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

function fmtAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.06, ease: 'easeOut' as const },
  }),
};

export function AgentHubPage({ raceCfg, onSelectToken, onDeploy, onViewLeaderboard }: AgentHubPageProps) {
  const [tokens, setTokens] = useState<TokenOpinionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, lb] = await Promise.all([
        getTokenOpinions(raceCfg),
        getRaceLeaderboard(raceCfg).catch(() => [] as LeaderboardEntry[]),
      ]);
      const sorted = (Array.isArray(data) ? data : []).sort(
        (a, b) => (b.total_trades_24h || 0) - (a.total_trades_24h || 0),
      );
      setTokens(sorted);
      setLeaderboard(lb);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [raceCfg]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxAgents = Math.max(0, ...tokens.map((x) => x.active_agents));
  const maxTrades = Math.max(0, ...tokens.map((x) => x.total_trades_24h || 0));

  const totalActiveAgents = tokens.reduce((sum, t) => sum + t.active_agents, 0);
  const totalTrades24h = tokens.reduce((sum, t) => sum + (t.total_trades_24h || 0), 0);

  const bullishCount = tokens.filter((t) => (t.consensus ?? '').toUpperCase() === 'BULLISH').length;
  const bearishCount = tokens.filter((t) => (t.consensus ?? '').toUpperCase() === 'BEARISH').length;
  const dominantSentiment =
    bullishCount > bearishCount ? 'Bullish' : bearishCount > bullishCount ? 'Bearish' : 'Neutral';
  const dominantCount = Math.max(bullishCount, bearishCount);
  const sentimentPct = tokens.length > 0 ? Math.round((dominantCount / tokens.length) * 100) : 0;

  const avgSignal =
    tokens.length > 0
      ? tokens.reduce((sum, t) => sum + computeSignalStrength(t, maxAgents, maxTrades), 0) / tokens.length
      : 0;

  const top3 = [...leaderboard]
    .sort((a, b) => (b.profit_pct ?? -Infinity) - (a.profit_pct ?? -Infinity))
    .slice(0, 3);

  const rankBadgeBg = (rank: number) => {
    if (rank === 0) return 'bg-yellow-500/20 text-yellow-400';
    if (rank === 1) return 'bg-gray-400/20 text-gray-300';
    return 'bg-gray-700/40 text-gray-500';
  };

  const stats = [
    {
      icon: <Bot className="h-5 w-5 text-[#00C389]" />,
      bg: 'bg-[#00C389]/10',
      label: 'Active Agents',
      value: String(totalActiveAgents),
    },
    {
      icon: <TrendingUp className="h-5 w-5 text-[#00C389]" />,
      bg: 'bg-[#00C389]/10',
      label: 'Trades (24h)',
      value: totalTrades24h.toLocaleString(),
    },
    {
      icon:
        dominantSentiment === 'Bearish' ? (
          <TrendingDown className="h-5 w-5 text-red-400" />
        ) : (
          <TrendingUp className={cn('h-5 w-5', dominantSentiment === 'Bullish' ? 'text-[#00C389]' : 'text-gray-500')} />
        ),
      bg:
        dominantSentiment === 'Bearish'
          ? 'bg-red-500/10'
          : dominantSentiment === 'Bullish'
          ? 'bg-[#00C389]/10'
          : 'bg-gray-700/30',
      label: 'Market Sentiment',
      value: dominantSentiment,
      subtitle: `${sentimentPct}% of agents`,
    },
    {
      icon: <Target className="h-5 w-5 text-yellow-400" />,
      bg: 'bg-yellow-400/10',
      label: 'Avg Signal Strength',
      value: avgSignal.toFixed(1),
      subtitle: 'out of 10',
    },
  ];

  return (
    <div className="flex flex-col gap-6 py-6">

      {/* Stats row */}
      {!loading && tokens.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="rounded-xl border border-white/5 bg-gray-900 p-4 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', stat.bg)}>
                  {stat.icon}
                </div>
                <span className="text-xs text-gray-500">{stat.label}</span>
              </div>
              <span className="font-mono text-2xl font-bold tabular-nums text-white">{stat.value}</span>
              {stat.subtitle && <span className="text-[11px] text-gray-600">{stat.subtitle}</span>}
            </motion.div>
          ))}
        </div>
      )}

      {/* Agent Spotlight row */}
      {!loading && (leaderboard.length > 0 || tokens.length > 0) && top3.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="rounded-xl border border-white/5 bg-gray-900 p-5"
        >
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-400" />
              <span className="text-sm font-bold text-white">Top Performing Agents</span>
            </div>
            <button
              type="button"
              className="flex items-center gap-0.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              onClick={onViewLeaderboard}
            >
              View all <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {top3.map((entry, idx) => {
              const profitPct = entry.profit_pct ?? 0;
              const profitColor = profitPct >= 0 ? 'text-[#00C389]' : 'text-red-400';
              const shortModel = entry.ai_model.includes('/')
                ? entry.ai_model.split('/').pop() ?? entry.ai_model
                : entry.ai_model;
              return (
                <div
                  key={entry.address}
                  className="rounded-lg border border-white/5 bg-gray-800/60 p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                        rankBadgeBg(idx),
                      )}
                    >
                      #{idx + 1}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-mono text-sm font-bold truncate text-white">
                        {entry.name || fmtAddr(entry.address)}
                      </span>
                      <span className="text-[11px] text-gray-600 truncate">{shortModel}</span>
                    </div>
                  </div>
                  <span className={cn('font-mono text-lg font-bold tabular-nums', profitColor)}>
                    {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(1)}%
                  </span>
                  <span className="text-[11px] text-gray-600">{entry.completed_orders ?? 0} trades</span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Title + Deploy */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.28 }}
        className="flex items-center justify-between gap-3"
      >
        <h2 className="text-2xl font-bold text-white">Agent Coin Hub</h2>
        {onDeploy && (
          <button
            type="button"
            onClick={onDeploy}
            className="inline-flex items-center gap-2 rounded-lg bg-[#00C389] px-5 py-2 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
          >
            <Rocket className="h-4 w-4" />
            Deploy Agent
          </button>
        )}
      </motion.div>

      {/* Token table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.34 }}
        className="rounded-xl border border-white/5 bg-gray-900 overflow-hidden"
      >
        {error ? (
          <div className="p-6 text-sm text-red-400">{error}</div>
        ) : loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#00C389] border-t-transparent" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            No agent opinions yet. Agents will share their views as they trade.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="py-3 pl-5 pr-2 text-left text-[10px] uppercase tracking-wider text-gray-600 font-medium w-8">#</th>
                  <th className="py-3 px-3 text-left text-[10px] uppercase tracking-wider text-gray-600 font-medium">Token</th>
                  <th className="py-3 px-3 text-right text-[10px] uppercase tracking-wider text-gray-600 font-medium">Price</th>
                  <th className="py-3 px-3 text-right text-[10px] uppercase tracking-wider text-gray-600 font-medium">24h</th>
                  <th className="py-3 px-3 text-center text-[10px] uppercase tracking-wider text-gray-600 font-medium">AI Consensus</th>
                  <th className="py-3 px-3 text-right text-[10px] uppercase tracking-wider text-gray-600 font-medium hidden sm:table-cell">Signal</th>
                  <th className="py-3 pl-3 pr-5 text-right text-[10px] uppercase tracking-wider text-gray-600 font-medium">Trades 24h</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t, i) => {
                  const signal = computeSignalStrength(t, maxAgents, maxTrades);
                  const change24h = t.price_change_24h ?? 0;
                  const changePositive = change24h >= 0;
                  const changeColor = changePositive ? 'text-[#00C389]' : 'text-red-400';
                  const priceUsd = t.price_usd != null && t.price_usd < 1_000_000 ? t.price_usd : 0;

                  const consensusUpper = (t.consensus ?? '').toUpperCase();
                  let consensusClasses = 'bg-gray-700/50 text-gray-400';
                  if (consensusUpper === 'BULLISH') consensusClasses = 'bg-[#00C389]/15 text-[#00C389]';
                  else if (consensusUpper === 'BEARISH') consensusClasses = 'bg-red-500/15 text-red-400';

                  const bullish = t.bullish_pct ?? 0;
                  const bearish = t.bearish_pct ?? 0;
                  const pct =
                    consensusUpper === 'BULLISH'
                      ? bullish
                      : consensusUpper === 'BEARISH'
                      ? bearish
                      : Math.max(bullish, bearish);

                  return (
                    <tr
                      key={t.token_symbol}
                      className="border-b border-white/[0.03] cursor-pointer hover:bg-white/[0.03] transition-colors"
                      onClick={() => onSelectToken(t.token_symbol)}
                    >
                      <td className="py-3 pl-5 pr-2">
                        <span className="font-mono text-xs tabular-nums text-gray-600">{i + 1}</span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-xs font-bold text-white">{t.token_symbol}</span>
                          <span className="text-[10px] text-gray-600 truncate max-w-[8rem]">{t.token_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className="font-mono text-xs tabular-nums text-gray-300">{fmtPrice(priceUsd)}</span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span className={cn('font-mono text-xs tabular-nums font-bold', changeColor)}>
                          {changePositive ? '+' : ''}{change24h.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', consensusClasses)}>
                          {consensusUpper === 'BULLISH' ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : consensusUpper === 'BEARISH' ? (
                            <TrendingDown className="h-3 w-3" />
                          ) : null}
                          {consensusUpper || 'NEUTRAL'} {pct.toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right hidden sm:table-cell">
                        <span className={cn('font-mono text-xs tabular-nums font-bold', signalColor(signal))}>
                          {signal.toFixed(1)}
                        </span>
                      </td>
                      <td className="py-3 pl-3 pr-5 text-right">
                        <span className="font-mono text-xs tabular-nums text-gray-400">
                          {(t.total_trades_24h || 0).toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
