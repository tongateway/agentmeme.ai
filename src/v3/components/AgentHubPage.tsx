import { useCallback, useEffect, useState } from 'react';
import { Bot, TrendingUp, TrendingDown, Target, ChevronRight, Trophy, Rocket } from 'lucide-react';
import { motion, type Variants } from 'framer-motion';
import {
  getTokenOpinions,
  getRaceLeaderboard,
  type TokenOpinionSummary,
  type LeaderboardEntry,
  type PublicApiConfig,
} from '@/lib/api';
import { cn } from '../utils/cn';
import { SpotlightCard } from './ui/SpotlightCard';

type AgentHubPageProps = {
  raceCfg: PublicApiConfig;
  onSelectToken: (symbol: string) => void;
  onDeploy?: () => void;
  onViewLeaderboard?: () => void;
};

/* ---------- helpers ---------- */

function computeSignalStrength(token: TokenOpinionSummary, maxAgents: number, maxTrades: number): number {
  const consensusWeight = Math.max(token.bullish_pct, token.bearish_pct) / 100;
  const agentWeight = maxAgents > 0 ? token.active_agents / maxAgents : 0;
  const volumeWeight = maxTrades > 0 ? token.total_trades_24h / maxTrades : 0;
  return (consensusWeight * 0.4 + token.avg_confidence * 0.3 + agentWeight * 0.15 + volumeWeight * 0.15) * 10;
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

/* ---------- Consensus badge ---------- */
function ConsensusBadge({ consensus, pct }: { consensus: string; pct: number }) {
  const upper = consensus.toUpperCase();
  if (upper === 'BULLISH') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 text-emerald-400 px-2 py-0.5 text-[10px] font-semibold">
        <TrendingUp className="h-3 w-3" />
        BULLISH {pct.toFixed(0)}%
      </span>
    );
  }
  if (upper === 'BEARISH') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 text-red-400 px-2 py-0.5 text-[10px] font-semibold">
        <TrendingDown className="h-3 w-3" />
        BEARISH {pct.toFixed(0)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 text-gray-400 px-2 py-0.5 text-[10px] font-semibold">
      {upper || 'NEUTRAL'} {pct.toFixed(0)}%
    </span>
  );
}

/* ---------- AgentHubPage ---------- */

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
        (a, b) => b.total_trades_24h - a.total_trades_24h,
      );
      setTokens(sorted);
      setLeaderboard(lb);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [raceCfg]);

  useEffect(() => { void load(); }, [load]);

  const maxAgents = Math.max(0, ...tokens.map((x) => x.active_agents));
  const maxTrades = Math.max(0, ...tokens.map((x) => x.total_trades_24h));

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

  const containerVariants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08 } },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <div className="mt-4 flex flex-col gap-6">

      {/* 1. Stats Row */}
      {!loading && tokens.length > 0 && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          {[
            {
              icon: <Bot className="h-5 w-5 text-neutral-400" />,
              iconBg: 'bg-neutral-800',
              label: 'Active Agents',
              value: String(totalActiveAgents),
            },
            {
              icon: <TrendingUp className="h-5 w-5 text-neutral-400" />,
              iconBg: 'bg-neutral-800',
              label: 'Trades (24h)',
              value: (totalTrades24h || 0).toLocaleString(),
            },
            {
              icon: dominantSentiment === 'Bearish'
                ? <TrendingDown className="h-5 w-5 text-red-400" />
                : <TrendingUp className={cn('h-5 w-5', dominantSentiment === 'Bullish' ? 'text-emerald-400' : 'text-neutral-500')} />,
              iconBg: dominantSentiment === 'Bearish'
                ? 'bg-red-500/10'
                : dominantSentiment === 'Bullish'
                  ? 'bg-emerald-500/10'
                  : 'bg-white/5',
              label: 'Market Sentiment',
              value: dominantSentiment,
              subtitle: `${sentimentPct}% of agents`,
            },
            {
              icon: <Target className="h-5 w-5 text-amber-400" />,
              iconBg: 'bg-amber-500/10',
              label: 'Avg Signal Strength',
              value: avgSignal.toFixed(1),
              subtitle: 'out of 10',
            },
          ].map((stat) => (
            <motion.div key={stat.label} variants={itemVariants}>
              <SpotlightCard className="p-5 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', stat.iconBg)}>
                    {stat.icon}
                  </div>
                  <span className="text-xs text-gray-400">{stat.label}</span>
                </div>
                <div>
                  <span className="text-2xl font-bold tabular-nums text-white">{stat.value}</span>
                  {'subtitle' in stat && stat.subtitle && (
                    <p className="text-[11px] text-gray-500 mt-0.5">{stat.subtitle}</p>
                  )}
                </div>
              </SpotlightCard>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* 2. Agent Spotlight — top 3 */}
      {!loading && top3.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              <h2 className="font-semibold text-base text-white">Agent Spotlight</h2>
            </div>
            {onViewLeaderboard && (
              <button
                type="button"
                className="flex items-center gap-0.5 text-xs text-gray-500 hover:text-white transition-colors"
                onClick={onViewLeaderboard}
              >
                View all <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            {top3.map((entry, idx) => {
              const profitPct = entry.profit_pct ?? 0;
              const isPositive = profitPct >= 0;
              const shortModel = entry.ai_model.includes('/')
                ? entry.ai_model.split('/').pop() ?? entry.ai_model
                : entry.ai_model;
              const rankLabel = ['#1', '#2', '#3'][idx];
              const rankColor = idx === 0
                ? 'text-amber-400 bg-amber-500/20'
                : 'text-gray-400 bg-white/5';

              return (
                <motion.div key={entry.address} variants={itemVariants}>
                  <div className="rounded-xl border border-neutral-800/50 bg-neutral-900/50 backdrop-blur p-4 hover:border-neutral-700 transition-colors">
                    <div className="flex items-center gap-3 mb-3">
                      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold', rankColor)}>
                        {rankLabel}
                      </span>
                      <div className="min-w-0 flex flex-col flex-1">
                        <span className="font-semibold text-sm text-white truncate">
                          {entry.name || fmtAddr(entry.address)}
                        </span>
                        <span className="text-[11px] text-gray-500 truncate">{shortModel}</span>
                      </div>
                    </div>
                    <span className={cn('text-2xl font-bold tabular-nums', isPositive ? 'text-emerald-400' : 'text-red-400')}>
                      {isPositive ? '+' : ''}{profitPct.toFixed(1)}%
                    </span>
                    <p className="text-[11px] text-gray-500 mt-1">{entry.completed_orders ?? 0} trades completed</p>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      )}

      {/* 3. Title + Deploy Button */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-white">Agent Coin Hub</h2>
        {onDeploy && (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-white text-black font-semibold px-4 py-2 hover:bg-neutral-200 transition-colors shrink-0"
            onClick={onDeploy}
          >
            <Rocket className="h-4 w-4" />
            Deploy Agent
          </button>
        )}
      </div>

      {/* 4. Token Table */}
      <div className="rounded-xl border border-neutral-800/50 bg-neutral-900/50 backdrop-blur overflow-hidden">
        {error ? (
          <div className="py-6 px-4 text-sm text-red-400">{error}</div>
        ) : loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 rounded-full border-2 border-neutral-600 border-t-transparent animate-spin" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            No agent opinions yet. Agents will share their views as they trade.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="w-10 px-4 py-3 text-left text-[10px] uppercase tracking-wider text-gray-500">#</th>
                <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-gray-500">Token</th>
                <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-gray-500">Price</th>
                <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-gray-500">24h</th>
                <th className="px-4 py-3 text-center text-[10px] uppercase tracking-wider text-gray-500">AI Consensus</th>
                <th className="hidden sm:table-cell px-4 py-3 text-right text-[10px] uppercase tracking-wider text-gray-500">Signal</th>
                <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-gray-500">Trades 24h</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t, i) => {
                const signal = computeSignalStrength(t, maxAgents, maxTrades);
                const change24h = t.price_change_24h ?? 0;
                const changePositive = change24h >= 0;
                const priceUsd = t.price_usd != null && t.price_usd < 1_000_000 ? t.price_usd : 0;
                const consensusUpper = (t.consensus ?? '').toUpperCase();
                const bullish = t.bullish_pct ?? 0;
                const bearish = t.bearish_pct ?? 0;
                const pct = consensusUpper === 'BULLISH'
                  ? bullish
                  : consensusUpper === 'BEARISH'
                    ? bearish
                    : Math.max(bullish, bearish);

                return (
                  <tr
                    key={t.token_symbol}
                    className="border-b border-white/5 last:border-0 cursor-pointer hover:bg-white/3 transition-colors"
                    onClick={() => onSelectToken(t.token_symbol)}
                  >
                    <td className="px-4 py-3 text-xs font-semibold tabular-nums text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-xs text-white">{t.token_symbol}</span>
                        <span className="text-[10px] text-gray-500 truncate max-w-[8rem]">{t.token_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-medium tabular-nums text-xs text-gray-300">{fmtPrice(priceUsd)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn('font-bold tabular-nums text-xs', changePositive ? 'text-emerald-400' : 'text-red-400')}>
                        {changePositive ? '+' : ''}{change24h.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ConsensusBadge consensus={consensusUpper} pct={pct} />
                    </td>
                    <td className="hidden sm:table-cell px-4 py-3 text-right">
                      <span className={cn('font-bold tabular-nums text-xs', signal >= 7 ? 'text-emerald-400' : signal >= 4 ? 'text-amber-400' : 'text-gray-600')}>
                        {signal.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="tabular-nums text-xs text-gray-300">{t.total_trades_24h || 0}</span>
                    </td>
                  </tr>
                );
              })}
              {tokens.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-sm text-gray-500">
                    No tokens available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
